/*******************************************************************************
 *                                                                             *
 * Copyright (C) 2018 - 2019                                                   *
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
const WRITEFILEASYNC = UTIL.promisify(FS.writeFile);
const PROCESS = require('../process');

const CONFIGDIR = '/etc/opt/mxs824/';
const DEFAULTFILE = PATH.join(CONFIGDIR, 'api-default.json');
const CUSTOMFILE = PATH.join(CONFIGDIR, 'api-custom.json');


const CONFIGDB = function () { };
CONFIGDB.config = {};


function _merge_json(obj1, obj2)
{
    var res = {};

    Object.keys(obj1).forEach(key => res[key] = obj1[key]);

    Object.keys(obj2).forEach((key) =>
    {
        /**
         * This removes keys present in obj2 that are not present in obj1.
         * We want this for our config, but perhaps not for general purpose.
         */
        if (!obj1.hasOwnProperty(key)) {
            return;
        }

        if (obj1[key].constructor === {}.constructor) {
            res[key] = _merge_json(obj1[key], obj2[key]);
        } else {
            res[key] = obj2[key];
        }
    });

    return res;
}


function _merge_config(custom)
{
    if (custom.version) {
        delete custom.version;
    }

    if (custom.serial) {
        delete custom.serial;
    }

    if (custom.mcuver) {
        delete custom.mcuver;
    }

    if (custom.network && custom.network.ntp && custom.network.ntp.timezones) {
        delete custom.network.ntp.timezones;
    }

    CONFIGDB.config = _merge_json(CONFIGDB.config, custom);
}


function _load_config()
{
    var custom = {};

    /* Attempt to load default config file */
    try {
        CONFIGDB.config = require(DEFAULTFILE);
    } catch (e) {
        ERRORS.set('apicfg', `failed to load API config file: ${e.message}`);

        CONFIGDB.config = {
            version: 'Unknown',
            mcuver: 'Unknown',
            serial: 'MXS824-ZZ-999999',
            port: 8210,
            loginAttempts: 5,
            loginBlockMs: 900000,
            sessionTimeSeconds: 1209600,
            activeConfig: {
                group: "Unknown",
                name: "Unknown",
                file: "Unknown"
            },
            network: {
                ip4: {
                    type: 0,
                    address: [ '192.168.1.210' ],
                    netmask: [ '255.255.255.0' ],
                    gateway: [ '192.168.1.1' ],
                    domain: [],
                    dns: [ '192.168.1.1' ]
                },
                ip6: {
                    type: 0,
                    address: [ 'fc00::210/64' ],
                    gateway: [ 'fc00::1' ],
                    domain: [],
                    dns: [ 'fc00::1' ]
                },
                ntp: {
                    timezone: 'UTC',
                    servers: [ 'pool.ntp.org' ]
                }
            },
            apt: {
                active: 0,
                channels: [
                    {
                        name: 'Stable channel',
                        url: 'http://mxs824apt.dolphinics.com'
                    },
                    {
                        name: 'Beta channel',
                        url: 'http://mxs824apt.dolphinics.com,http://mxs824apt.dolphinics.com/master'
                    },
                    {
                        name: 'Internal development',
                        url: 'http://repo.dolphinics.no/apt/mxs824master',
                        hidden: 1
                    },
                    {
                        name: 'Custom',
                        url: '',
                        hidden: 1,
                        modify: 1
                    }
                ]
            },
            thresholds: {}
        };
    }

    /* Attempt to load custom config file (if exists) */
    try {
        custom = require(CUSTOMFILE);
    } catch (e) {
        try {
            FS.open(CUSTOMFILE, 'r', (err, fd) =>
            {
                if (!err) {
                    ERRORS.set('apicustomcfg', 'custom API cfg file has bad content');
                    FS.closeSync(fd);
                }
            });
        } catch(e) {
            console.log('Custom API config file is missing');
        }
        return;
    }

    _merge_config(custom);
}


function _retrieve_serial(config)
{
    PROCESS('sudo', ['fw_printenv', 'serialno'])
    .then(function (serial)
    {
        if (typeof serial !== 'string') {
            serial = serial.toString('utf-8').replace(/\r?\n|\r/g, '');
        }

        serial = serial.trim().substring(('serialno=').length);

        if ((serial.length != 16) || (serial.indexOf('MXS82') !== 0)
            || (serial.indexOf('-') !== 6) || (serial.lastIndexOf('-') !== 9)) {
            ERRORS.set('serial', 'invalid serial stored in hw (' + serial + ')');
            serial = 'MXS824-ZZ-999999';
        } else {
            ERRORS.clear('serial');
        }

        config.serial = serial;
    })
    .catch(function(error)
    {
        ERRORS.set('serial', `Unable to retrieve switch serial: ${error}`);
        config.serial = 'MXS824-ZZ-999999';
    });
}


CONFIGDB.save = function()
{
    return new Promise(function (resolve, reject)
    {
        WRITEFILEASYNC(CUSTOMFILE, JSON.stringify(CONFIGDB.config))
            .then(PROCESS('sync'))
            .then(resolve)
            .catch(reject);
    });
};

_load_config();
_retrieve_serial(CONFIGDB.config);

CONFIGDB.reload = _load_config;
module.exports = CONFIGDB;
