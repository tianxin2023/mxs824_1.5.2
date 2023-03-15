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

const GPIO = require('./gpio');
const MTD = require('mtd');
const PROCESS = require('./process');

const GPIO_FLASH_SELECT = GPIO.get_base(2) + 12;
const GPIO_PFX_RESET = GPIO.get_base(2) + 13;


function _unload_drivers()
{
    return PROCESS('sudo', ['modprobe', '-ra', 'cmdlinepart', 'fsl_quadspi', 'ofpart', 'spi_nor', 'mtd'])
        .then( () => PROCESS("udevadm", ["settle"]) );
}


function _load_drivers()
{
    return PROCESS('sudo', ['modprobe', '-a', 'mtd', 'spi_nor', 'ofpart', 'fsl_quadspi', 'cmdlinepart'])
        .then( () => PROCESS("udevadm", ["settle"]) );
}


function _gpio_set_dir(pin, dir)
{
    return new Promise(function(resolve, reject)
    {
        // FIXME Should this be get_dir?
        GPIO.get(pin, (val, err) =>
        {
            var cur;

            if (err) {
                return reject(err);
            }

            cur  = val ? 'in' : 'out';

            if (dir === cur) {
                return resolve();
            }

            GPIO.set_dir(pin, dir, (err) =>
            {
                if (err) {
                    return reject(err);
                }

                resolve();
            });
        });
    });
}

var _is_reset = function (callback)
{
    GPIO.get(GPIO_PFX_RESET, (val, err) =>
    {
        callback(val == 0);
    });
};


var _reset_enter = function ()
{
    return _gpio_set_dir(GPIO_PFX_RESET, "out");
};


var _reset_exit = function ()
{
    return _gpio_set_dir(GPIO_PFX_RESET, "in");
};


var _flash_select = function ()
{
    return _gpio_set_dir(GPIO_FLASH_SELECT, "out");
};


var _flash_deselect = function ()
{
    return _gpio_set_dir(GPIO_FLASH_SELECT, "in");
};


var _reset_state = function ()
{
    return _unload_drivers()
    .then(_flash_deselect)
    .then(_reset_exit)
    .then(_load_drivers)
    .catch(function(e)
    {
        console.log(`Failed to unload PFX flash ${e}`);
    });
};


function _pfx_flash_write(file, progress, cb)
{
    const fs = require('fs');
    const tmpFile = '/run/mxs824/flashcheck-' + Date.now();

    /* Read first eight bytes to verify we're accessing the correct flash */
    MTD.read(tmpFile, progress, function(err) {
        if (err) {
            return cb(err);
        }

        var buffer = fs.readFileSync(tmpFile);
        fs.unlinkSync(tmpFile);
        var magic = buffer.readUInt32BE(0).toString(16);
        var submagic = buffer.readUInt32BE(4).toString(16);

        if ((magic === '1ee01') && (submagic === '55aa55aa')) {
            return cb(`Incorrect flash detected. Write aborted to prevent system corruption`);
        }

        return MTD.write(file, progress, cb);
    }, 8);
}


function _flash_access(file, progress, callback, write)
{
    if (!file || !callback || !progress) {
        if (callback) {
            callback('bad parameters');
        }
        return;
    }

    _unload_drivers()
    .then(_reset_enter)
    .then(_flash_select)
    .then(_load_drivers)
    .then(function()
    {
        if (write) {
            _pfx_flash_write(file, progress, (err) =>
            {
                _reset_state()
                .then(() => {})
                .catch(() => {})
                .finally(() =>
                {
                    return callback(err ? `MTD write failed: ${err}` : null);
                });
            });
        } else {
            MTD.read(file, progress, (err) =>
            {
                _reset_state()
                .then(() => {})
                .catch(() => {})
                .finally(() =>
                {
                    return callback(err ? `MTD read failed: ${err}` : null);
                });
            });
        }
    })
    .catch(function(err)
    {
        _reset_state()
        .then(() => {})
        .catch(() => {})
        .finally(() =>
        {
            return callback(err);
        });
    });
}


module.exports = {
    is_reset: _is_reset,

    reset_exit: _reset_exit,

    reset_enter: _reset_enter,

    flash_select: _flash_select,

    flash_deselect: _flash_deselect,

    read: function (file, progress, callback)
    {
        return _flash_access(file, progress, callback, 0);
    },

    write: function (file, progress, callback)
    {
        return _flash_access(file, progress, callback, 1);
    }
};
