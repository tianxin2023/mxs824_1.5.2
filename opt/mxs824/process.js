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


const { spawnSync } = require('child_process');

module.exports = function(process, args, opts)
{
    return new Promise(function(resolve, reject)
    {
        try {
            var outStr;
            var errStr;
            var proc = spawnSync(process, args, opts);

            if (proc.stdout && (typeof proc.stdout !== 'string')) {
                outStr = proc.stdout.toString('utf-8');
            } else {
                outStr = proc.stdout;
            }

            if (proc.stderr && (typeof proc.stderr !== 'string')) {
                errStr = proc.stderr.toString('utf-8');
            } else {
                errStr = proc.stderr;
            }

            if (proc.error) {
                reject(proc.error);
            } else if (proc.status) {
                var details = errStr || proc.status;
                reject(new Error('Failed to execute \'' + process + '\': ' + details));
            } else {
                resolve(outStr);
            }
        } catch(e) {
            reject(e);
        }
    });
};
