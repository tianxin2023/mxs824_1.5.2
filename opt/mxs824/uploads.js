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

const MULTER = require('multer');
const FS = require('fs');
const TEMPPATH = '/var/spool/mxs824/';


const UPLOAD = MULTER({
    storage: MULTER.diskStorage({
        destination: (req, file, cb) =>
        {
            cb(null, TEMPPATH);
        },
        filename: (req, file, cb) =>
        {
            var name;
            var prefix = Date.now();
            var counter = 0;

            if (!file || !file.fieldname) {
                return req.status(400).json({ error: 'Invalid request' });
            }

            do {
                name = file.fieldname + prefix + counter++;

                if (counter > 1000) {
                    return req.status(500).json({ error: 'No available file name' });
                }
            } while (FS.existsSync(`${TEMPPATH}${name}`));

            cb(null, name);
        }
    })
});


module.exports = UPLOAD;