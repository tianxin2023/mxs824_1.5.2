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

const EXPRESS = require('express');
const HELMET = require('helmet');
const BODYPARSER = require('body-parser');
const FANCTRL = require('max31785etl');
const ROUTES = require('./routes');
const CONFIGDB = require('./db/api-config');
const APP = EXPRESS();


process.on('uncaughtException', function ucExcpt(err)
{
    console.error("Unexpected exception not handeled");
    console.error(err);
});


process.on('unhandledRejection', function nonResolv(reason, promise)
{
    console.error('Uncaught resolve detected');
    console.error(reason);
    console.error(promise);
});


console.log('Starting MXS824 24 port PCIe RESTful API server');
console.log('Copyright (C) 2018 - 2020 Dolphin Interconnect Solutions AS');

try {
    /* Ensure fans are correctly configured */
    if (FANCTRL.max_fans() == -1) {
        console.log('Failed to configure the fans :-(');
    }

    if (!CONFIGDB.config.hasOwnProperty('port')) {
        CONFIGDB.config.port = process.env.PORT || 8210;
    }

    /* Only allow connections from localhost (NGINX reverse proxy) */
    APP.set('trust proxy', 'loopback');

    /* HTTP headers for content parsing and security */
    APP.use(BODYPARSER.urlencoded({ extended: true }));
    APP.use(BODYPARSER.json());
    APP.use(HELMET());

    /* Allow CORS - it's an API */
    APP.use(function allowCors(req, res, next)
    {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
        next();
    });

    /* Set up routes */
    APP.use(ROUTES);

    /* Start accepting request */
    APP.listen(CONFIGDB.config.port, 'localhost', () =>
    {
        console.log('API listening on port ' + CONFIGDB.config.port);
    });

    process.on('exit', (err) =>
    {
        console.log(`Server terminated with status ${err}`);
    });
} catch(e) {
    console.log('ERROR: Server unexpectedly terminated.');
    console.log(e);
    console.log(e.stack);
}
