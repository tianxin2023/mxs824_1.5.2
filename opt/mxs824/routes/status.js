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
const OS = require('os');
const FS = require('fs');
const MRPC = require('mrpc');
const UTIL = require('util');
const UTILS = require('../utils');
const WRITEFILEASYNC = UTIL.promisify(FS.writeFile);
const ROUTER = EXPRESS.Router();
const MAX = require('max31785etl');
const STATUS = require('../status');
const ERRORS = require('../errors');
const VOLTAGE = require('../voltage');
const CONFIGDB = require('../db/api-config');
const PROCESS = require('../process');

var _status = {};


function _verify_temp(current, key, desc)
{
    var thresholds = CONFIGDB.config.thresholds.temp;

    if (typeof current === 'string') {
        if (isNaN((current = parseInt(current)))) {
            ERRORS.set(key, `${desc} has bad data`);
            return;
        }
    }

    if (current < thresholds[key].min) {
        ERRORS.set(key, `${desc} temperature is low (${current})`);
    } else if (current >= thresholds[key].max) {
        ERRORS.set(key, `${desc} temperature is critically high (${current})`);
    } else if (current >= thresholds[key].warn) {
        ERRORS.set(key, `${desc} temperature is high (${current})`);
    } else {
        ERRORS.clear(key);
    }

}


function _verify_fans(rpms)
{
    var i;
    var thresholds = CONFIGDB.config.thresholds.fan;

    for (i in rpms) {
        if (1 > rpms[i]) {
            ERRORS.set(`fan${i}`, `Fan ${parseInt(i) + 1} is not running: ${rpms[i]}`);
        }  else if (Math.abs(thresholds.rpm - rpms[i]) > thresholds.hys) {
            ERRORS.set(`fan${i}`, `Fan ${parseInt(i) + 1} has a bad RPM: ${rpms[i]}`);
        } else {
            ERRORS.clear(`fan${i}`);
        }
    }
}


function _verify_voltage(current, key, desc)
{
    var thresholds = CONFIGDB.config.thresholds.power;

    if (typeof current === 'string') {
        if (isNaN((current = parseFloat(current)))) {
            ERRORS.set(key, `${desc} has bad data`);
            return;
        }
    }

    if (Math.abs(thresholds[key].voltage.vol - current) > thresholds[key].voltage.hys) {
        ERRORS.set(`${key}V`, `${desc} voltage is off (${current})`);
    } else {
        ERRORS.clear(`${key}V`);
    }
}


function _verify_current(current, key, desc)
{
    var thresholds = CONFIGDB.config.thresholds.power;

    if (typeof current === 'string') {
        if (isNaN((current = parseFloat(current)))) {
            ERRORS.set(key, `${desc} has bad data`);
            return;
        }
    }

    if (Math.abs(thresholds[key].current.vol - current) > thresholds[key].current.hys) {
        ERRORS.set(`${key}C`, `${desc} current is off (${current})`);
    } else {
        ERRORS.clear(`${key}C`);
    }
}


function _verify_voltage_data(v)
{
    _verify_voltage(v[0].devs[0].val, '3v', '3.3V');

    /* Do not verify 3.3V current on C switches and older */
    if (CONFIGDB.config.serial.charCodeAt(7) >= 'D'.charCodeAt(0)) {
        _verify_current(v[0].devs[1].val, '3v', '3.3V');
    }

    _verify_voltage(v[1].devs[0].val, '12v', '12V');
    _verify_current(v[1].devs[2].val, '12v', '12V');

    _verify_voltage(v[1].devs[1].val, '9v', '0.9V');
    _verify_current(v[1].devs[3].val, '9v', '0.9V');

    _verify_temp(v[1].devs[4].val, 'coil1', 'Coil 1');
    _verify_temp(v[1].devs[5].val, 'coil2', 'Coil 2');
    _verify_temp(v[1].devs[6].val, 'ltc38', '0.9V regulator');
}


function _retrieve_temperatures()
{
    var degree_char = String.fromCharCode(176);
    var cpuTemp = MAX.get_cpu_temp() / 100;
    var pfxTemp = MAX.get_pfx_temp() / 100;
    var intTemp = MAX.get_internal_temp() / 100;
    var temperatures = [
        { 'name': 'CPU', 'temp': '' },
        { 'name': 'PFX', 'temp': '' },
        { 'name': 'Ext', 'temp': '' }
    ];

    temperatures[0].temp = `${Math.round(cpuTemp)}${degree_char}C`;
    temperatures[1].temp = `${Math.round(pfxTemp)}${degree_char}C`;
    temperatures[2].temp = `${Math.round(intTemp)}${degree_char}C`;

    _verify_temp(cpuTemp, 'cpu', 'CPU');
    _verify_temp(pfxTemp, 'pfx', 'PFX');
    _verify_temp(intTemp, 'max31', 'MAX32 internal');

    /* JS cache "trick" */
    _status.temperatures = undefined;
    _status.temperatures = temperatures;
}


function _retrieve_fan_rpms()
{
    var i;
    var fans = [];
    var rpms = [];

    /* 6 fan slots, but only 4 used */
    for (i = 0; i < 5; ++i) {
        if (i == 2) {
            continue;
        }

        var rpm = MAX.get_fan_rpm(i);

        rpms.push(rpm);
        fans.push(`${rpm} RPM`);
    }

    _verify_fans(rpms);
    rpms = undefined;

    /* JS cache "trick" */
    _status.fans = undefined;
    _status.fans = fans;
}


async function _retrieve_stats()
{
    var voltageUpdate = VOLTAGE.update();
    _retrieve_temperatures();
    _retrieve_fan_rpms();

    /* JS cache "trick" with undefine */
    _status.config = undefined;
    _status.config = CONFIGDB.config;
    _status.server = undefined;
    _status.server = STATUS.get();
    _status.voltage = undefined;
    _status.voltage = VOLTAGE.sensors;
    _status.os = undefined;
    _status.os = _get_os_info();

    if (_status.server.reboot) {
        ERRORS.set('reboot', 'A system reboot is required.');
    } else {
        ERRORS.clear('reboot');
    }

    var dateString = await PROCESS('date', ['+%Y-%m-%d %H:%M:%S %Z']).catch(function(e)
    {
        console.error(e);
    });

    /* Current timestamp */
    if (dateString) {
        ERRORS.clear('dateret');
        _status.os['date'] = dateString.trim();
    } else {
        ERRORS.set('dateret', 'Unable to retrieve date.');
        _status.os['date'] = 'Unknown';
    }

    /* Version information */
    _status.versions = undefined;
    _status.versions = STATUS.dpkgVersions;

    /* Port information */
    var portInfo = await MRPC.get_ports().catch(function(e)
    {
        console.error(e);
    });

    if (portInfo) {
        ERRORS.clear('portinfo');
        _status.ports = undefined;
        _status.ports = portInfo;
    } else {
        _status.ports = undefined;
        _status.ports = [];
        ERRORS.set('portinfo', 'Unable to retrieve port information');
    }

    _status.errors = undefined;
    _status.errors = ERRORS.get();

    /* Write status to file for forensics. Note RAMFS. */
    var waitWrit = await WRITEFILEASYNC('/run/mxs824/status.json', JSON.stringify(_status)).catch(function(e)
    {
        console.error('Failed to write status file');
        console.error(e);
    });
}


async function _poll()
{
    while (true) {
        var waitUpdate = await _retrieve_stats();
        waitUpdate = await UTILS.wait(1000); /* Sleep 1s */
        waitUpdate = undefined;
    }
}


function _get_os_info()
{
    var seconds;
    var uptime = OS.uptime();
    var network = OS.networkInterfaces();
    var info = {
        hostname: OS.hostname(),
        uptime: {}
    };

    if (network.hasOwnProperty('eth0')) {
        info.network = network.eth0;
    }

    seconds = 31557600;
    info.uptime.years = Math.floor(uptime / seconds);
    uptime -= seconds * info.uptime.years;

    seconds = 2629800;
    info.uptime.months = Math.floor(uptime / seconds);
    uptime -= seconds * info.uptime.months;

    seconds = 604800;
    info.uptime.weeks = Math.floor(uptime / seconds);
    uptime -= seconds * info.uptime.weeks;

    seconds = 86400;
    info.uptime.days = Math.floor(uptime / seconds);
    uptime -= seconds * info.uptime.days;

    seconds = 3600;
    info.uptime.hours = Math.floor(uptime / seconds);
    uptime -= seconds * info.uptime.hours;

    seconds = 60;
    info.uptime.minutes = Math.floor(uptime / seconds);
    info.uptime.seconds = uptime - (seconds * info.uptime.minutes);

    return info;
}


/* Available routes */
ROUTER.get('/', function (req, res) {
    res.status(200).json(_status);
});

/* Start stats polling */
var pollThread = _poll();

module.exports = ROUTER;
