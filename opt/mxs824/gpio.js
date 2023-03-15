/*******************************************************************************
 *                                                                             *
 * Copyright (C) 2011 - 2018                                                   *
 *         Dolphin Interconnect Solutions AS                                   *
 *                                                                             *
 *    All rights reserved                                                      *
 *                                                                             *
 *                                                                             *
 *******************************************************************************/

'use strict';

const fs = require('fs');
const GPIO_PATH = '/sys/class/gpio/';
const PROCESS = require('./process');


function _load_gpio_base(i2c_addr)
{
    var dir = fs.readdirSync(`/sys/bus/i2c/devices/i2c-0/0-00${i2c_addr}/gpio/`);
    return parseInt(dir[0].substring('gpiochip'.length));
}


function _udev_settle()
{
    return PROCESS("udevadm", ["settle"])
}


const GPIO_BASES = [
    _load_gpio_base(25),
    _load_gpio_base(26),
    _load_gpio_base(27)
];

function GPIO()
{
}


GPIO.get_base = function(num)
{
    if (isNaN(num) || (0 > num) || (num >= GPIO_BASES.length)) {
        return;
    }

    return GPIO_BASES[num];
};


GPIO.init = function (gpio, callback)
{
    /* Is the GPIO pin configured? */
    if (fs.existsSync(GPIO_PATH + 'gpio' + gpio)) {
        if (callback) {
            callback(0);
        }
        return;
    }

    /* Set up the GPIO */
    fs.writeFile(GPIO_PATH + 'export', gpio.toString(), 'ascii', (err) => {
        if (err) {
            console.log("Failed to configure GPIO " + gpio.toString() + " for export: " + err);
            if (callback) {
                callback(1);
            }
            return;
        }

        if (callback) {
            /* Wait for udev to fix permissions */
            _udev_settle()
                .then(() => {
                    if (fs.existsSync(GPIO_PATH + 'gpio' + gpio)) {
                        callback(0);
                    } else {
                        console.log("GPIO " + gpio + " is still unavailable!");
                        callback(1);
                    }
                })
                .catch((err) => {
                    console.log("Failed to wait for udev " + err);
                    callback(1);
                });
        }
    });
};


GPIO.deinit = function (gpio, callback)
{
    /* Is the GPIO pin configured? */
    if (!fs.existsSync(GPIO_PATH + 'gpio' + gpio)) {
        if (callback) {
            callback(0);
        }
        return;
    }

    /* Set up the GPIO */
    fs.writeFile(GPIO_PATH + 'unexport', gpio.toString(), 'ascii', (err) => {
        if (err) {
            console.log("Failed to un-configure GPIO " + gpio + ': ' + err);
            if (callback) {
                callback(1);
            }
            return;
        }

        if (callback) {
            /* Wait for udev to fix permissions */
            _udev_settle()
                .then(() => {
                    if (fs.existsSync(GPIO_PATH + 'gpio' + gpio)) {
                        console.log("GPIO " + gpio + ' still exported');
                        callback(1);
                    } else {
                        callback(0);
                    }
                })
                .catch((err) => {
                    console.log("Failed to wait for udev " + err);
                    callback(1);
                });
        }
    });
};


GPIO.get = function (gpio, callback)
{
    var data;

    this.init(gpio, (err) => {
        if (err) {
            if (callback) {
                callback(-1, err);
            }
            return;
        }

        data = fs.readFileSync(GPIO_PATH + 'gpio' + gpio + "/value", 'ascii');

        if (callback) {
            callback(parseInt(data.replace(/\n|\r|\t/g, '').trim()), 0);
        }
    });
};


GPIO.get_dir = function(gpio, callback)
{
    var direction;

    this.init(gpio, (err) => {
        if (err) {
            if (callback) {
                callback(-1, 1);
            }
            return;
        }

        direction = fs.readFileSync(GPIO_PATH + 'gpio' + gpio + "/direction", 'ascii');
        direction = direction.replace(/\n|\r|\t/g, '').trim();

        if (callback) {
            callback(direction, 0);
        }
    });
};


GPIO.set = function (gpio, value, callback)
{
    value = parseInt(value);

    if (isNaN(value) || (0 > value) || (value > 1)) {
        if (callback) {
            callback(1);
        }
        return;
    }

    if (this.init(gpio)) {
        if (callback) {
            callback(1);
        }
        return;
    }

    fs.writeFile(GPIO_PATH + 'gpio' + gpio + "/value", value.toString(), 'ascii', (err) => {
        if (err) {
            console.log('Failed to write GPIO ' + gpio + ' value: ' + err);
            if (callback) {
                callback(1);
            }
        } else if (callback) {
            callback(0);
        }
    });
};


GPIO.set_dir = function (gpio, direction, callback)
{
    if ((direction !== 'in') && (direction !== 'out')) {
        if (callback) {
            callback(1);
        }
        return;
    }

    this.init(gpio, (err) => {
        if (err) {
            if (callback) {
                callback(err);
            }

            return;
        }

        fs.writeFile(GPIO_PATH + 'gpio' + gpio + "/direction", direction, 'ascii', (err) => {
            if (err) {
                console.log('Failed to write GPIO ' + gpio + ' value: ' + err);
                if (callback) {
                    callback(1);
                }
            } else if (callback) {
                callback(0);
            }
        });
    });
};

module.exports = GPIO;
