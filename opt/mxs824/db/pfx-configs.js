/*******************************************************************************
 *                                                                             *
 * Copyright (C) 2018 - 2020                                                   *
 *         Dolphin Interconnect Solutions AS                                   *
 *                                                                             *
 *    All rights reserved                                                      *
 *                                                                             *
 *                                                                             *
 *******************************************************************************/

'use strict';

const FS = require('fs');
const PATH = require('path');
const UTIL = require('util');
const ERRORS = require('../errors');
const PROCESS = require('../process');
const CONFIGDIR = '/etc/opt/mxs824/pfx_configs';
const UPGRADE_CONFIG = '/etc/opt/mxs824/pfx_upgrade.json';
const READDIRASYNC = UTIL.promisify(FS.readdir);
const READFILEASYNC = UTIL.promisify(FS.readFile);
const WRITEFILEASYNC = UTIL.promisify(FS.writeFile);
const UNLINKASYNC = UTIL.promisify(FS.unlink);
const ACCESS = UTIL.promisify(FS.access);


const CONFIGDB = function () { };
CONFIGDB.configs = [];


function _random_error_id()
{
    return (Math.round(Math.random() * 100000000)).toString();
}


function _validate_config(conf)
{
    var i;
    var errors = [];
    var config = {};

    var dataExp = /^[\w.-]+$/;
    var idExp = /^[\w-.]+( [\w-.]+)*$/;
    var freeExp = /^[\u0000-\u007F]*$/;
    var verExp = /^[0-9.\-d]+$/;
    var intExp = /^\d+$/;

    var dataFields = [
        ['group', freeExp, 1],
        ['file', idExp, 1],
        ['name', freeExp, 1],
        ['type', dataExp],
        ['topology', freeExp],
        ['version', verExp],
        ['ports', intExp],
        ['speed', intExp],
        ['width', intExp],
        ['description', freeExp, 0, 'desc']
    ];

    for (i = 0; i < dataFields.length; ++i) {
        var filter = {
            'required': ((dataFields[i].length == 3) ? dataFields[i][2] : 0),
            'exp': dataFields[i][1],
            'key': dataFields[i][0]
        };

        if (!conf.hasOwnProperty(filter.key)) {
            if (filter.required) {
                errors.push('Missing required ' + filter.key);
            }

            continue;
        }

        if (filter.exp.test(conf[filter.key])) {
            config[filter.key] = conf[filter.key];
        } else {
            errors.push('Bad data for ' + filter.key + ' provided');
        }
    }

    if (errors.length) {
        throw new Error(errors.join(' '));
    }

    return config;
}


function _verify_config_file(file)
{
    return new Promise((resolve, reject) =>
    {
        PROCESS('sha256sum', ['-c', `${file}.sha256sum`], { cwd: CONFIGDIR })
        .then(function()
        {
            resolve();
        }).catch(function(e)
        {
            reject(`Checksum mismatch in ${file} (${e})`);
        });
    });
}


function _config_file_exists(file)
{
    var pfx_file = PATH.join(CONFIGDIR, file);
    var json_file = PATH.join(CONFIGDIR, `${file}.json`);
    var sha_file = PATH.join(CONFIGDIR, `${file}.sha256sum`);

    return ACCESS(pfx_file)
        .then(function() {
            return ACCESS(sha_file);
        })
        .then(function() {
            return ACCESS(json_file);
        });
}


function _load_file(file)
{
    /**
     * Note that we always resolve() as we should not break the
     * load chain if one config is bad.
     */
    return new Promise(function (resolve, reject)
    {
        var dataFile;
        var path = PATH.join(CONFIGDIR, file);
        var filename = PATH.basename(file);

        if (PATH.extname(file) !== '.json') {
            return resolve(null);
        }

        dataFile = filename.substring(0, filename.length - '.json'.length);

        /* Verify files exists */
        _config_file_exists(dataFile).then(function ()
        {
            try {
                var conf = require(path);

                conf.file = dataFile;
                conf.id = CONFIGDB.configs.length;

                /* Validate JSON file parameters */
                _validate_config(conf);

                CONFIGDB.configs.push(conf);
                resolve(null);
            } catch(err) {
                ERRORS.set(_random_error_id(), `Invalid PFX config file ${file}: ${err.message}`);
                resolve(err.message);
            }
        }).catch(function(e)
        {
            ERRORS.set(_random_error_id(), `Invalid PFX config file ${file}: ${e.message}`);
            resolve(e);
        });
    });
}


function _load_config_files()
{
    CONFIGDB.configs = [];

    return new Promise(function (resolve, reject)
    {
        var promises = [];

        READDIRASYNC(CONFIGDIR)
        .then(function (files)
        {
            var i;

            for (i = 0; i < files.length; ++i) {
                promises.push(_load_file(files[i]));
            };

            Promise.all(promises).then(resolve).catch(reject);
        })
        .catch(function (err)
        {
            ERRORS.set('pfxconf', `Failed to read PFX configuration dir: ${err.message}`);
            reject(err.message);
        });
    });
}


function _update_checksum(hash, file)
{
    var i;

    for (i = 0; i < CONFIGDB.configs.length; ++i) {
        if (CONFIGDB.configs[i].file == file) {
            CONFIGDB.configs[i].checksum = hash;
        }
    }
}


function _check_for_config_update(config_to_check)
{
    var upgrade = require(UPGRADE_CONFIG);

    var key;
    for (key in upgrade) {
        var series = upgrade[key];
        var upgrade_list = series.upgrade;
        var i;
        for (i = 0; i < upgrade_list.length; ++i) {
            if (upgrade_list[i] == config_to_check.file) {
                return series.upgrade_to;
            }
        }
    }
    return null;
}


CONFIGDB.find_upgraded_version = function(config_to_check)
{
    var upgraded = _check_for_config_update(config_to_check);
    var filter = {"file": upgraded}
    var matching = CONFIGDB.find(filter)

    if (matching.length == 1) {
        return matching[0];
    } else {
        return null;
    }
}


function _load_checksums()
{
    READDIRASYNC(CONFIGDIR)
    .then(function (files)
    {
        files.forEach(function (file, index)
        {
            if (PATH.extname(file) !== '.sha256sum') {
                return;
            }

            READFILEASYNC(PATH.join(CONFIGDIR, file)).then(function (data)
            {
                var i;

                /* Sometimes string, sometimes binary buffer... sigh */
                if (typeof (data) !== 'string') {
                    data = data.toString('utf-8');
                }

                var lines = data.split(/\r?\n/);

                for (i = 0; i < lines.length; ++i) {
                    if (!lines[i].length) {
                        continue;
                    }

                    var firstSpace = lines[i].indexOf(' ');
                    var lastSpace = lines[i].lastIndexOf(' ');

                    var hash = lines[i].substring(0, firstSpace);
                    var fileStr = PATH.basename(lines[i].substring(lastSpace + 1).trim());

                    if ((firstSpace == -1) || !hash.length || !fileStr.length || (hash.length == lines[i].length)) {
                        ERRORS.set(`sha256-${i}`, `Invalid line ${i} in PFX checksum file`);
                        continue;
                    }

                    if (PATH.extname(fileStr) == '.json') {
                        continue;
                    }

                    _update_checksum(hash, file.substring(0, file.indexOf('.sha256sum')));
                }
            }).catch(function (err)
            {
                ERRORS.set(file, `Failed to load checksum: ${err.message}`);
            });
        });
    })
    .catch(function (err)
    {
        ERRORS.set('pfxconf', `Failed to read PFX configuration dir: ${err.message}`);
    });
}


CONFIGDB.find = function (filter)
{
    var key;
    var i;
    var results = [];

    if (typeof filter !== 'object') {
        return new Error('Invalid filter object provided');
    }

    for (i = 0; i < CONFIGDB.configs.length; ++i) {
        var matches = 0;
        var keys = 0;

        for (key in filter) {
            ++keys;

            if (!CONFIGDB.configs[i].hasOwnProperty(key)) {
                break;
            }

            if (CONFIGDB.configs[i][key] !== filter[key]) {
                break;
            }

			++matches;
        }

        if (matches === keys) {
            results.push(CONFIGDB.configs[i]);
        }
    }

    return results;
};


CONFIGDB.add = function (config)
{
    return new Promise(function (resolve, reject)
    {
        var file;

        try {
            config = _validate_config(config);
        } catch (e) {
            return reject(e.message);
        }

        file = config.file;
        delete config.file;

        WRITEFILEASYNC(PATH.join(CONFIGDIR, `${file}.json`), JSON.stringify(config))
        .then(function()
        {
            return PROCESS('sha256sum', [`${file}`, `${file}.json`], { cwd: CONFIGDIR });
        })
        .then(function(chunk)
        {
            return WRITEFILEASYNC(PATH.join(CONFIGDIR, `${file}.sha256sum`), chunk);
        })
        .then(function()
        {
            _load_config_files().then(function()
            {
                _load_checksums();
                resolve();
            })
            .catch(function(e)
            {
                reject('Failed to load PFX configs: '
                    + (e.hasOwnProperty('message') ? e.message : e));
            });
        }).catch(function(e)
        {
            FS.unlink(PATH.join(CONFIGDIR, `${file}.json`), function (e) { });
            reject(e.hasOwnProperty('message') ? e.message : e);
        });
    });
};


CONFIGDB.delete = function(configs)
{
    return new Promise(function (resolve, reject)
    {
        var i;
        var promises = [];

        for (i = 0; i < configs.length; ++i) {
            if (configs[i].hasOwnProperty('protected') && configs[i].protected) {
                return reject('Protected config(s) was specified');
            }

            if (!configs[i].hasOwnProperty('id') || !configs[i].hasOwnProperty('file')) {
                return reject('Bad config(s) specified');
            }

            var id = parseInt(configs[i].id);

            if (isNaN(id) || (0 > id) || (id >= CONFIGDB.configs.length)
                || (CONFIGDB.configs[id].file != configs[i].file)) {
                return reject('Incorrect config(s) specified');
            }
        }

        for (i = 0; i < configs.length; ++i) {
            promises.push(UNLINKASYNC(PATH.join(CONFIGDIR, configs[i].file)));
            promises.push(UNLINKASYNC(PATH.join(CONFIGDIR, `${configs[i].file}.json`)));
            promises.push(UNLINKASYNC(PATH.join(CONFIGDIR, `${configs[i].file}.sha256sum`)));
        }

        Promise.all(promises).then(function ()
        {
            _load_config_files().then(function ()
            {
                _load_checksums();
                resolve();
            }).catch(function (e)
            {
                reject(e);
            });
        }).catch(function(e)
        {
            reject(e);
        });
    });
};


CONFIGDB.verify = function (id)
{
    return new Promise(function (resolve, reject)
    {
        if (0 > id || (id >= CONFIGDB.configs.length)) {
            return reject(new Error(`Invalid config id ${id}`));
        }

        try {
            _validate_config(CONFIGDB.configs[id]);
        } catch (e) {
            return reject(e);
        }

        _verify_config_file(CONFIGDB.configs[id].file).then(function()
        {
            resolve();
        }).catch(function (e)
        {
            reject(e);
        });
    });
};


CONFIGDB.init = function (callback)
{
    _load_config_files().then(function()
    {
        _load_checksums();

        if (callback) {
            callback();
        }
    }).catch(function (e)
    {
        ERRORS.set('pfxconf', 'Failed to load PFX configs: '
            + (e.hasOwnProperty('message') ? e.message : e));
    });
};

module.exports = CONFIGDB;
