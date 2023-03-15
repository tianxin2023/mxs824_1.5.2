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

const EXPRESS = require('express');
const FS = require('fs');
const UTIL = require('util');
const PATH = require('path');
const READDIRASYNC = UTIL.promisify(FS.readdir);
const READFILEASYNC = UTIL.promisify(FS.readFile);
const WRITEFILEASYNC = UTIL.promisify(FS.writeFile);
const STATUS = require('../status');
const SPAWN = require('child_process').spawn;
const UPLOAD = require('../uploads');
const CONFIGDB = require('../db/api-config');
const ROUTER = EXPRESS.Router();

const SOURCESDIR = '/etc/apt/sources.list.d/';
var _stdchunk;
var _errchunk;


function _get_stdout() {
    return _stdchunk ? _stdchunk : '';
}


function _get_stderr()
{
    return _errchunk ? _errchunk : '';
}


function _exec_cmd(cmd, params, updateStatus, detach)
{
    return new Promise((resolve, reject) =>
    {
        var options;

        if (detach) {
            options = {
                detached: true,
                stdio: 'ignore'
            };
        } else {
            options = {};
        }

        const proc = SPAWN(cmd, params, options);

        if (detach) {
            resolve();
        } else {
            proc.stdout.on('data', (data) =>
            {
                var str = data ? data.toString('utf-8') : '';

                if (_stdchunk) {
                    _stdchunk += str;
                } else {
                    _stdchunk = undefined;
                    _stdchunk = str;
                }

                if (updateStatus) {
                    STATUS.details(str);
                }
            });

            proc.stderr.on('data', (data) =>
            {
                var str = data ? data.toString('utf-8') : '';

                if (_errchunk) {
                    _errchunk += str;
                } else {
                    _errchunk = undefined;
                    _errchunk = str;
                }

                if (updateStatus) {
                    STATUS.details(str);
                }
            });

            proc.on('close', function (err)
            {
                if (err) {
                    return reject(err);
                }

                resolve();
            });
        }
    });
}


/* Available routes */
ROUTER.post('/', UPLOAD.single('zip'), function (req, res)
{
    if (!req.file || !req.file.path) {
        return res.status(400).json({ error: 'invalid request' });
    }

    if (STATUS.busy()) {
        FS.unlink(req.file.path, (e) => { });
        return res.status(400).json({ error: `busy with ${STATUS.get().state}` });
    }

    _errchunk = undefined;
    _stdchunk = undefined;

    STATUS.set('Processing update', -1);

    /* ZIP extract without password should fail! */
    _exec_cmd('unzip', ['-P', '', req.file.path, '-d', `${req.file.path}-dir`]).then(() =>
    {
        FS.unlink(req.file.path, (e) => { });
        var rmdir = SPAWN('rm', ['-rf', `${req.file.path}-dir`]);

        STATUS.error('Failed to process uploaded file');
    }).catch((e) =>
    {
        _exec_cmd('unzip', ['-P', 'djD$_BVU*qUV5$n9cbmWAWPRFdNh6jaWE+72c=K&+5S2+pQ@m@pU9ZLCRt$Zm?!p',
            req.file.path, '-d', `${req.file.path}-dir`])
        .then(() =>
        {
            return _exec_cmd('sh', [`${req.file.path}-dir/upgrade.sh`], 1);
        })
        .then(() =>
        {
            var rmdir = SPAWN('rm', ['-rf', `${req.file.path}-dir`]);
            FS.unlink(req.file.path, (e) => { });
            STATUS.clear();
        })
        .catch((err) =>
        {
            var rmdir = SPAWN('rm', ['-rf', `${req.file.path}-dir`]);
            FS.unlink(req.file.path, (e) => { });
            STATUS.error(`failed to perform upgrade (${err}): ${_get_stderr()}`);
        });
    });

    return res.status(200).json({ status: 'success' });
});


ROUTER.post('/auto', function (req, res)
{
    if (STATUS.busy()) {
        return res.status(400).json({ error: `busy with ${STATUS.get().state}` });
    }

    STATUS.set('Processing update', -1);

    _errchunk = undefined;
    _stdchunk = undefined;

    _exec_cmd('/bin/bash', ['/opt/mxs824/upgrade.sh'], 1, 1)
    .catch((e) =>
    {
        STATUS.error(`failed to initiate upgrades: ${e}`);
    });

    return res.status(200).json({ status: 'success' });
});


ROUTER.post('/changelog', function (req, res)
{
    if (STATUS.busy()) {
        return res.status(400).json({ error: `busy with ${STATUS.get().state}` });
    }

    _errchunk = undefined;
    _stdchunk = undefined;

    _exec_cmd('/bin/bash', ['/opt/mxs824/check_updates.sh'])
    .then(function ()
    {
        res.status(200).json({ status: 'success', details: _get_stdout() });
    })
    .catch(function (e)
    {
        res.status(500).json({ error: 'failed to check for updates (' + e + '): ' + _get_stderr() });
    });
});


ROUTER.post('/reset', function (req, res)
{
    if (STATUS.busy()) {
        return res.status(400).json({ error: `busy with ${STATUS.get().state}` });
    }

    STATUS.set('Performing factory reset', -1);

    WRITEFILEASYNC('/var/spool/mxs824/perform-factory-reset', Date.now()).then(function ()
    {
        return _exec_cmd('sudo', ['reboot'], 1, 1);
    }).then(function ()
    {
        res.status(200).json({ status: 'success' });
    }).catch(function (e)
    {
        return res.status(500).json({ error: e.message });
    });
});


ROUTER.post('/channel/:id', function (req, res)
{
    if (STATUS.busy()) {
        return res.status(400).json({ error: `busy with ${STATUS.get().state}` });
    }

    var i = parseInt(req.params.id);

    if (isNaN(i) || (i < 0) || (i >= CONFIGDB.config.apt.channels.length)) {
        return res.status(400).json({ error: `bad input data` });
    }

    if (CONFIGDB.config.apt.channels[i].hasOwnProperty('modify') && CONFIGDB.config.apt.channels[i].modify) {
        var rx = /^[a-zA-Z0-9:.,\/\\?#&=-]*$/;

        if (!req.body.url || (req.body.url.length == 0) || !rx.test(req.body.url)) {
            return res.status(400).json({ error: `bad url data` });
        }

        CONFIGDB.config.apt.channels[i].url = req.body.url;
    }

    _errchunk = undefined;
    _stdchunk = undefined;

    _exec_cmd('sudo', ['/opt/apt/change_repo.sh', CONFIGDB.config.apt.channels[i].url])
    .then(function ()
    {
        CONFIGDB.config.apt.active = i;
        return CONFIGDB.save();
    })
    .then(function ()
    {
        res.status(200).json({ status: 'success', details: _get_stdout() });
    }).catch(function (e)
    {
        res.status(500).json({ error: 'failed to change channel (' + e + '): ' + _get_stderr() });
    });
});


async function detectSources(files)
{
    var i;
    var url;

    for (i = 0; i < files.length; ++i) {
        var content = await READFILEASYNC(PATH.join(SOURCESDIR, files[i])).catch(function (e)
        {
            console.error(`Failed to read ${files[i]}: ${e.message}`);
            content = undefined;
        });

        if (!content) {
            continue;
        }

        var lines = content.toString('utf-8').split("\n");
        var j;

        for (j = 0; j < lines.length; ++j) {
            var line = lines[j];
            var pos = line.indexOf('#');

            if (pos !== -1) {
                line = line.substring(0, pos);
            }

            pos = line.indexOf('deb ');

            if (pos === -1) {
                continue;
            }

            line = line.substring(pos + ('deb ').length);

            pos = line.indexOf(' ');

            if (1 > pos) {
                continue;
            }

            if (url) {
                url += `,${line.substring(0, pos)}`;
            } else {
                url = line.substring(0, pos);
            }
        }
    }

    for (i = 0; i < CONFIGDB.config.apt.channels.length; ++i) {
        if (CONFIGDB.config.apt.channels[i].url == url) {
            CONFIGDB.config.apt.active = i;
            return;
        }
    }

    CONFIGDB.config.apt.active = CONFIGDB.config.apt.channels.length - 1;
    CONFIGDB.config.apt.channels[CONFIGDB.config.apt.channels.length - 1].url = url;
}


READDIRASYNC(SOURCESDIR).then(function (files)
{
    detectSources(files);
});

module.exports = ROUTER;
