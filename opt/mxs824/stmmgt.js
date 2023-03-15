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

const GPIO = require('./gpio');

const NRST_START = GPIO.get_base(0) + 8;
const BOOT0 = GPIO.get_base(0) + 14;
const BOOT1 = GPIO.get_base(0) + 15;
const SPI_SEL1 = GPIO.get_base(2) + 8;
const SPI_SEL2 = GPIO.get_base(2) + 9;
const SPI_SEL3 = GPIO.get_base(2) + 10;


function _enter_reset(rst)
{
    return new Promise(function (resolve, reject)
    {
        GPIO.set_dir(rst, 'out', function (e)
        {
            if (e) {
                return reject(e)
            }

            resolve();
        });
    });
}


function _exit_reset(rst)
{
    return new Promise(function (resolve, reject)
    {
        GPIO.set_dir(rst, 'in', function (e)
        {
            if (e) {
                return reject(e)
            }

            resolve();
        });
    });
}


function _toggle_reset(stmNo, releaseAll, cb)
{
    /* Set STM#0 in reset */
    _enter_reset(NRST_START).then(function ()
    {
        /* Set STM#1 in reset */
        return _enter_reset(NRST_START + 1);
    }).then(function ()
    {
        /* Set STM#2 in reset */
        return _enter_reset(NRST_START + 2);
    }).then(function ()
    {
        /* Set STM#3 in reset */
        return _enter_reset(NRST_START + 3);
    }).then(function ()
    {
        /* Set STM#4 in reset */
        return _enter_reset(NRST_START + 4);
    }).then(function ()
    {
        /* Set STM#5 in reset */
        return _enter_reset(NRST_START + 5);
    }).then(function ()
    {
        var t = setTimeout(function ()
        {
            if (!releaseAll) {
                _exit_reset(NRST_START + stmNo).then(function ()
                {
                    var t2= setTimeout(function stmExitTimeout ()
                    {
                        cb();
                    }, 150);
                }).catch(cb);
            } else {
                _exit_reset(NRST_START).then(function ()
                {
                    return _exit_reset(NRST_START + 1);
                }).then(function ()
                {
                    return _exit_reset(NRST_START + 2);
                }).then(function ()
                {
                    return _exit_reset(NRST_START + 3);
                }).then(function ()
                {
                    return _exit_reset(NRST_START + 4);
                }).then(function ()
                {
                    return _exit_reset(NRST_START + 5);
                }).then(function () {
                    var t2 = setTimeout(function stmExitTimeout2 ()
                    {
                        cb();
                    }, 150);
                }).catch(cb);
            }
        }, 250);
    }).catch(cb);
}


function _set_spi_select(dir, cb)
{
    GPIO.set_dir(SPI_SEL1, dir, (e) => {
        if (e) {
            cb(e);
            return;
        }

        GPIO.set_dir(SPI_SEL2, dir, (e) => {
            if (e) {
                cb(e);
                return;
            }

            GPIO.set_dir(SPI_SEL3, dir, (e) => {
                cb(e);
            });
        });
    });
}


function _set_spi_select_out(cb)
{
    _set_spi_select('out', cb);
}


function _set_spi_select_in(cb) {
    _set_spi_select('in', cb);
}


function _spi_select(select, cb)
{
    _set_spi_select_out((e) => {
        if (e) {
            cb(e);
            return;
        }

        GPIO.set(SPI_SEL1, select[0], (e) => {
            if (e) {
                cb(e);
                return;
            }

            GPIO.set(SPI_SEL2, select[1], (e) => {
                if (e) {
                    cb(e);
                    return;
                }

                GPIO.set(SPI_SEL3, select[2], (e) => {
                    cb(e);
                });
            });
        });
    });
}


function _spi_select_reset(cb)
{
    _spi_select([0, 0, 0], (e) => {
        if (e) {
            cb(e);
            return;
        }

        _set_spi_select_in(cb);
    });
}


function _select_stm(stmNo)
{
    return new Promise(function (resolve, reject)
    {
        var SPI_SEL = [0, 0, 0];

        stmNo = parseInt(stmNo);

        if (isNaN(stmNo) || (0 > stmNo) || (stmNo > 5)) {
            return reject(`invalid STM number provided`);
        }

        switch (stmNo) {
            case 1:
                SPI_SEL[0] = 1;
                break;
            case 2:
                SPI_SEL[1] = 1;
                break;
            case 3:
                SPI_SEL[0] = 1;
                SPI_SEL[1] = 1;
                break;
            case 4:
                SPI_SEL[2] = 1;
                break;
            case 5:
                SPI_SEL[0] = 1;
                SPI_SEL[2] = 1;
                break;
        }

        _spi_select(SPI_SEL, function(err)
        {
            if (err) {
                return reject(err);
            }

            resolve();
        });
    });
}


function _boot_pins_enter(cb)
{
    GPIO.set_dir(BOOT0, 'out', function (e)
    {
        if (e) {
            return cb(e);
        }

        GPIO.set_dir(BOOT1, 'out',function (e)
        {
            if (e) {
                return cb(e);
            }

            GPIO.set(BOOT0, 1, function (e)
            {
                if (e) {
                    return cb(e);
                }

                GPIO.set(BOOT1, 0, function (e)
                {
                    cb(e);
                });
            });
        });
    });
}


function _boot_pins_exit(cb)
{
    GPIO.set_dir(BOOT0, 'out', function(e)
    {
        if (e) {
            return cb(e);
        }

        GPIO.set_dir(BOOT1, 'out', function (e)
        {
            if (e) {
                return cb(e);
            }

            GPIO.set(BOOT0, 0, function (e)
            {
                if (e) {
                    return cb(e);
                }

                GPIO.set(BOOT1, 0, function (e)
                {
                    cb(e);
                });
            });
        });
    });
}


function _enter_bootloader(stmNo, callback)
{
    if (!callback) {
        callback = (e) => {};
    }

    if ((0 > stmNo) || (stmNo > 5)) {
        callback(1);
        return;
    }

    _boot_pins_enter(function(e)
    {
        if (e) {
            return callback(e);
        }

        _select_stm(stmNo).then(function()
        {
            _toggle_reset(stmNo, 0, callback);
        }).catch(function(e) {
            callback(e);
        });
    });
}


function _exit_bootloader(stmNo, callback)
{
    if (!callback) {
        callback = (e) => {};
    }

    if ((0 > stmNo) || (stmNo > 5)) {
        return callback(1);
    }

    _boot_pins_exit(function(e)
    {

        if (e) {
            return callback(e);
        }

        _spi_select_reset(function (e)
        {
            if (e) {
                return callback(e);
            }

            _toggle_reset(stmNo, 1, function (e)
            {
                if (e) {
                    return callback(e);
                }

                GPIO.set_dir(BOOT0, 'in', function (e)
                {
                    GPIO.set_dir(BOOT1, 'in', callback);
                });
            });
        });
    });
}



module.exports = {
    enter_bootloader: _enter_bootloader,
    exit_bootloader: _exit_bootloader,
    select_stm: _select_stm,
    deselect_stm: _spi_select_reset
};
