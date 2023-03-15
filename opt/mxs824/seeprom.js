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

const SEEPROM = require('seeprom');
const GPIO = require('./gpio');

const GPIO_PFX_RESET   = GPIO.get_base(2) + 13;
const GPIO_SEEPROM_SEL = GPIO.get_base(2) + 11;


function _seeprom_select(callback)
{
    GPIO.set_dir(GPIO_SEEPROM_SEL, "out", (err) => {
        if (err) {
            if (callback) {
                callback(`failed to select SEEPROM: ${err}`);
            }
            return;
        }

        GPIO.set(GPIO_SEEPROM_SEL, 1, (err) => {
            if (callback) {
                if (err) {
                    callback(`failed to set SEEPROM select: ${err}`);
                } else {
                    callback();
                }
            }
        });
    });
}


function _seeprom_deselect(callback) {
    GPIO.set(GPIO_SEEPROM_SEL, 0, (err) => {
        if (err) {
            if (callback) {
                callback(`failed to set SEEPROM selec: ${err}`);
            }
            return;
        }

        GPIO.set_dir(GPIO_SEEPROM_SEL, "in", (err) => {
            if (callback) {
                if (err) {
                    callback(`failed to deselect SEEPROM: ${err}`);
                } else {
                    callback();
                }
            }
        });
    });
}


function _seeprom_access(file, callback, include_crc, op)
{
    if (!callback) {
        console.log(`Missing required callback`);
        return;
    }
    
    _seeprom_select((err) =>
    {
        if (err) {
            callback(err);
            return;
        }

        if (op === 'write') {
            SEEPROM.write(file, (err) => {
                _seeprom_deselect(() =>
                {
                    callback(err);
                });
            });
        } else if (op === 'read') {
            SEEPROM.read(file, include_crc, (err) => {
                _seeprom_deselect(() =>
                {
                    callback(err);
                });
            });
        } else if (op === 'erase') {
            SEEPROM.erase((err) => {
                _seeprom_deselect(() =>
                {
                    callback(err);
                });
            });
        } else {
            callback('Unknown operation ' + op);
        }
    });
};


exports.read = function(file, arg1, arg2) {
    if (arg2 === undefined) {
        _seeprom_access(file, arg1, 0, 'read');
    } else {
        _seeprom_access(file, arg2, arg1, 'read');
    }
}


exports.write = function(file, callback) {
    _seeprom_access(file, callback, 0, 'write');
}


exports.erase = function(callback) {
    _seeprom_access(undefined, callback, 0, 'erase');
}
