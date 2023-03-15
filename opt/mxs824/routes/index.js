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

const APP = require('express')();
const ROOTROUTER = require('./root');
const STATUSROUTER = require('./status');
const PFXROUTER = require('./pfx');
const UPGRADEROUTER = require('./upgrade');
const USERROUTER = require('./user');
const NETWORKROUTER = require('./network');

/* Root elements of API is public */
APP.use('/', ROOTROUTER);

/* Password protect the rest of the API */
APP.use(ROOTROUTER.authenticate);

/* Remaining components */
APP.use('/status', STATUSROUTER)
APP.use('/pfx', PFXROUTER);
APP.use('/upgrade', UPGRADEROUTER);
APP.use('/user', USERROUTER);
APP.use('/network', NETWORKROUTER);

/* Error handling */
APP.use(function (req, res, next) {
    res.status(404).json({ error: 'resource not found' });
});

APP.use(function (err, req, res, next) {
    console.log(err.stack);
    res.status(500).json({ error: 'unexpected error' });
});

module.exports = APP;