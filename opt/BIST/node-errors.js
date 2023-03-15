#!/usr/bin/env node

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


var _errors = 0;

console.log(`Checking for app reported errors`);

var t = setTimeout(function()
{
    try {
        var i;
        var length;
        var status = require('/var/run/mxs824/status.json');

        if ((typeof status !== 'object') || (!status.hasOwnProperty('errors'))) {
            throw new Error(`bad data response: ${status}`);
        }

        length = Object.keys(status.errors).length;

        for (i in status.errors) {
            console.log(`[ error ]: ${ status.errors[i]}`);
        }

        if (!length) {
            console.log(`[success]: app reports no errors`);
        }

        _errors += length;
        process.exit(_errors);
    } catch(e) {
        console.log(`[ error ]: unable to retrieve status - ${e.message}`);
        process.exit(++_errors);
    }
}, 1500);
