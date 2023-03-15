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
const READFILEASYNC = UTIL.promisify(FS.readFile);


var _update_value = function (dev, value)
{
    var file;
    var degree_char = String.fromCharCode(176);

    if (Array.isArray(dev.file)) {
        file = dev.file[0];
    } else {
        file = dev.file;
    }

    value /= 1000;
    dev.val = undefined;
    dev.val = value;

    dev.str = undefined;
    if (file.indexOf('temp') !== -1) {
        dev.str = Math.round(value);
        dev.str += `${degree_char}C`;
    } else if (file.indexOf('curr') !== -1) {
        dev.str = Math.round(value * 100) / 100;
        dev.str += ' A';
    } else {
        dev.str = Math.round(value * 100) / 100;
        dev.str += ' V';
    }
};


var _retrieve_dev = async function volRetDev(path, dev)
{
    var i;
    var files;
    var value = 0;

    if (Array.isArray(dev.file)) {
        files = dev.file;
    } else {
        files = [ dev.file ];
    }

    for (i = 0; i < files.length; ++i) {
        var val = await READFILEASYNC(PATH.join(path, files[i])).catch(function(e)
        {
            console.error('Failed to read sensor: ' + dev.name);
            console.error(e);
            files = undefined;
            return;
        });

        val = parseInt(val);

        if (isNaN(val)) {
            console.error('Sensor ' + dev.name + ' gives bad data');
            files = undefined;
            return;
        }

        value += val;
        val = undefined;
    }

    value /= files.length;
    files = undefined;

    _update_value(dev, value);
    value = undefined;
    i = undefined;
};


var _retrieve_sensor = async function volRetSens(sensor)
{
    var i;

    for (i = 0; i < sensor.devs.length; ++i) {
        await _retrieve_dev(sensor.path, sensor.devs[i]);
    }
}


var _retrieve_data = async function volRetData()
{
    var i;

    for (i = 0; i < module.exports.sensors.length; ++i) {
        await _retrieve_sensor(module.exports.sensors[i])
    }
};


module.exports = {
    update: _retrieve_data,
    sensors: [
        {
            'name': '3.3V Supply',
            'path': '/sys/class/hwmon/hwmon0/',
            'devs': [
                {
                    'name': 'Voltage',
                    'file': 'in1_input',
                    'val' : -1,
                    'str' : 'Unknown'
                },
                {
                    'name': 'Current',
                    'file': 'curr1_input',
                    'val' : -1,
                    'str' : 'Unknown'
                }
            ]
        },
        {
            'name': '0.9V Supply',
            'path': '/sys/class/hwmon/hwmon1/',
            'devs': [
                {
                    'name': '12V voltage',
                    'file': 'in1_input',
                    'val' : -1,
                    'str' : 'Unknown'
                },
                {
                    'name': '0.9V voltage',
                    'file': [ 'in2_input', 'in3_input' ],
                    'val' : -1,
                    'str' : 'Unknown'
                },
                {
                    'name': '12V current',
                    'file': 'curr1_input',
                    'val' : -1,
                    'str' : 'Unknown'
                },
                {
                    'name': '0.9V current',
                    'file': [ 'curr2_input', 'curr3_input' ],
                    'val' : -1,
                    'str' : 'Unknown'
                },
                {
                    'name': 'Coil 1 temperature',
                    'file': 'temp1_input',
                    'val' : -1,
                    'str' : 'Unknown'
                },
                {
                    'name': 'Coil 2 temperature',
                    'file': 'temp2_input',
                    'val' : -1,
                    'str' : 'Unknown'
                },
                {
                    'name': 'Regulator temperature',
                    'file': 'temp3_input',
                    'val' : -1,
                    'str' : 'Unknown'
                }
            ]
        }
    ]
};