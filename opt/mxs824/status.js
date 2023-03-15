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

const UTIL = require('util');
const FS = require('fs');
const UTILS = require('./utils');
const PROCESS = require('./process');
const ERRORS = require('./errors');
const READFILEASYNC = UTIL.promisify(FS.readFile);
const SYSUPDATEFILE = "/etc/opt/mxs824/upgrade/upgrade.log";
const SYSUPDATERESFILE = "/etc/opt/mxs824/upgrade-result";
const REBOOTFILE = "/var/run/reboot-required";

var _status = {
    'busy': false,
    'state': 'idle',
    'progress': 0,
    'reboot': 0,
    'details': undefined
};


function _check_active_update()
{
    return new Promise(function(resolve, reject)
    {
        /* If this file exists and update is in progress */
        READFILEASYNC(SYSUPDATEFILE)
        .then(function (log)
        {
            exports.set('System update in progress', -1);
            _status.details = undefined;
            _status.details = log.toString('utf-8');
            resolve(true);
        })
        .catch(function (e)
        {
            /* We are no longer updating, but the result may be stored in this file */
            READFILEASYNC(SYSUPDATERESFILE)
            .then(function (code)
            {
                var c = parseInt(code);

                if (!isNaN(c) && (c != 0)) {
                    exports.error(c);
                } else {
                    exports.clear();
                }

                FS.unlink(SYSUPDATERESFILE, function unlinkSysUpdateFile(e)
                {
                    exports.updateVersions();
                    resolve(false);
                });
            })
            .catch(function (e)
            {
                resolve(false);
            });
        });
    });
}


async function _poll_sysupdate()
{
    while (true) {
        var updateInProgress = await _check_active_update().catch(function (e)
        {
            /* expected */
        });

        if (_status.busy || updateInProgress) {
            var waitUpdate = await UTILS.wait(1000);
            waitUpdate = undefined;
            continue;
        }

        var rebootNeeded = await READFILEASYNC(REBOOTFILE).catch(function (e)
        {
            _status.reboot = undefined;
            _status.reboot = 0;
        });

        if (rebootNeeded) {
            _status.reboot = undefined;
            _status.reboot = 1;
        }

        var waitUpdate = await UTILS.wait(3000);
        waitUpdate = undefined;
    }
}


exports.dpkgVersions = {};


exports.set = function(state, progress)
{
    if (!state) {
        return -1;
    }

    /* JS cache "trick" with undefined */
    _status.busy = undefined;
    _status.busy = true;
    _status.state = undefined;
    _status.state = state;
    _status.progress = undefined;
    _status.progress = progress;
    _status.details = undefined;
};


exports.details = function(data)
{
    if (_status.details) {
        _status.details += data;
    } else {
        _status.details = undefined;
        _status.details = data;
    }
};


exports.error = function (error)
{
    _status.busy = undefined;
    _status.busy = false;
    _status.state = undefined;
    _status.state = 'error';
    _status.progress = undefined;
    _status.progress = error;
};


exports.progress = function (progress)
{
    if (!progress) {
        return;
    }

    _status.progress = undefined;
    _status.progress = progress;
};


exports.busy = function () {
    return _status.busy;
};


exports.clear = function ()
{
    _status.busy = undefined;
    _status.busy = false;
    _status.state = undefined;
    _status.state = 'idle';
    _status.progress = undefined;
    _status.progress = 0;
    _status.details = undefined;
};


exports.get = function()
{
    return _status;
};


function _get_dpkg_version(dpkg)
{
    return new Promise(function getDpkgPromise(resolve, reject)
    {
        PROCESS('dpkg', ['-s', dpkg]).then(function getDpkgStats(out)
        {
            var result;
            var pos = out.indexOf('Version: ');

            if (pos === -1) {
                return reject(new Error('Version not present in data set'));
            }

            result = out.substring(pos + 'Version: '.length);

            if ((pos = result.indexOf('\n')) === -1) {
                pos = result.length;
            }

            resolve(result.substring(0, pos));
        }).catch(function (e)
        {
            reject(e);
        });
    });
}


exports.updateVersions = function ()
{
    var versions = {};

    _get_dpkg_version('mxs824').then(function mxs824Version(version)
    {
        versions['management'] = version;
        return _get_dpkg_version('mxs824-system-config');
    }).then(function mgmtVersion(version)
    {
        versions['config'] = version;
        return _get_dpkg_version('mxs824-pfx-config');
    }).then(function pfxVersion(version)
    {
        versions['pfx'] = version;
        return _get_dpkg_version('mxs824-mcu-firmware');
    }).then(function mcuVersion(version)
    {
        versions['mcu'] = version;
        return _get_dpkg_version('mxs824-node-app');
    }).then(function appVersion(version)
    {
        versions['app'] = version;
        return _get_dpkg_version('mxs824-static-web');
    }).then(function guiVersion(version)
    {
        versions['gui'] = version;
        return _get_dpkg_version('mxs824-kernel');
    }).then(function kernelVersion(version)
    {
        versions['kernel'] = version;
        exports.dpkgVersions = undefined;
        exports.dpkgVersions = versions;
        ERRORS.clear('dpkg');
    }).catch(function versionRejected(e)
    {
        ERRORS.set('dpkg', 'Unable to retrieve versions: '
            + (e.hasOwnProperty('message') ? e.message : e));
    });
}


exports.updateVersions();
_poll_sysupdate();
