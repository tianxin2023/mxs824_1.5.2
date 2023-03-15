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
const JWT = require('jsonwebtoken');
const USERS = require('../db/users');
const SESSIONS = require('../db/sessions');
const CONFIGDB = require('../db/api-config');
const ROUTER = EXPRESS.Router();

/* Get user information */
ROUTER.get('/', function (req, res)
{
    if (req.user) {
        return res.status(200).json({ user: req.user.username });
    }

    res.status(500).json({ error: 'database issue' });
});

/* Change password */
ROUTER.post('/passwd', function (req, res)
{
    var oldToken = SESSIONS.reqToToken(req);

    USERS.passwd(req.user, req.body.pwd, req.body.old).then(function (user)
    {
        var options = { issuer: 'dolphinics.com' };
        var jwtData = { mxsuid: user.id, updated: user.updated, t: Date.now() };

        if (CONFIGDB.config.hasOwnProperty('sessionTimeSeconds')) {
            options.expiresIn = parseInt(CONFIGDB.config.sessionTimeSeconds);
        }

        var token = JWT.sign(jwtData, process.env.NODESEC, options);

        SESSIONS.delete(oldToken, 1);
        SESSIONS.add(token, (options.expiresIn ? ((options.expiresIn * 1000) + jwtData.t) : 0));

        res.status(200).json({ status: 'success', token: token });
    }).catch(function (e)
    {
        res.status(400).json({ error: e.hasOwnProperty('message') ? e.message : e });
    });
});

module.exports = ROUTER;
