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
const PASSPORT = require("passport");
const PASSPORTJWT = require("passport-jwt");
const USERS = require('../db/users');
const SESSIONS = require('../db/sessions');
const CONFIGDB = require('../db/api-config');
const STATUS = require('../status');
const PROCESS = require('../process');

const ROUTER = EXPRESS.Router();
const APP = EXPRESS();

var ip_list = [];
var blockTime;
var maxAttempts;
var sessionTime;


if (CONFIGDB.config.hasOwnProperty('loginAttempts')) {
    maxAttempts = parseInt(CONFIGDB.config.loginAttempts);
}

if (CONFIGDB.config.hasOwnProperty('loginBlockMs')) {
    blockTime = parseInt(CONFIGDB.config.loginBlockMs);
}

if (CONFIGDB.config.hasOwnProperty('sessionTimeSeconds')) {
    sessionTime = parseInt(CONFIGDB.config.sessionTimeSeconds);
}

/* Substitute eventually missing config parameters */
if (isNaN(blockTime) || (0 > blockTime)) {
    blockTime = 900000;
}

if (isNaN(maxAttempts) || (0 > maxAttempts)) {
    maxAttempts = 5;
}

if (isNaN(sessionTime) || (0 > sessionTime)) {
    sessionTime = 1209600;
    CONFIGDB.config.sessionTimeSeconds = sessionTime;
}


/* Ensure we have a token secret available */
if (process.env.NODESEC === undefined) {
    throw(`Compromised switch!`);
}


/* Set up PASSPORTJS authentication strategy for JWT */
PASSPORT.use(new PASSPORTJWT.Strategy({
        jwtFromRequest: PASSPORTJWT.ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: process.env.NODESEC,
        issuer: 'dolphinics.com'
    },
    function (jwtPayload, next)
    {
        var user = USERS.find({ id: jwtPayload.mxsuid });

        if (jwtPayload.updated !== user.updated) {
            user = null;
        }

        next(null, user);
    }
));


/* Export function to verify authentication. Needed just for proper JSON response. */
ROUTER.authenticate = function (req, res, next)
{
    var error_response = { error: 'unauthorized', serial: CONFIGDB.config.serial };
    var token = SESSIONS.reqToToken(req);

    if (!SESSIONS.valid(token)) {
        return res.status(401).json(error_response);
    }

    PASSPORT.authenticate('jwt', { session: false }, function(err, user, info)
    {
        if (err) {
            return next(err);
        }

        if (!user) {
            return res.status(401).json(error_response);
        }

        req.user = user;
        
        next();
    })(req, res, next);
};


/* IP blocking management */
function _unblock_ip(ip)
{
    if (!(ip in ip_list)) {
        return;
    }

    if (ip_list[ip].tim !== undefined) {
        clearTimeout(ip_list[ip].tim);
    }

    ip_list[ip] = undefined;
    delete ip_list[ip];
}


function _is_ip_blocked(ip)
{
    if (!(ip in ip_list)) {
        ip_list[ip] = { attempts: 0, tim: undefined };
    }

    if (ip_list[ip].tim !== undefined) {
        clearTimeout(ip_list[ip].tim);
    }

    ip_list[ip].tim = setTimeout(() => {
        _unblock_ip(ip);
    }, blockTime);

    if (ip_list[ip].attempts > maxAttempts) {
        return 1;
    }

    ip_list[ip].attempts += 1;

    return 0;
}


/* Register Express with Passport */
APP.use(PASSPORT.initialize());


/* Available routes */
ROUTER.get('/', function (req, res)
{
    res.status(200).json({ status: 'ok' });
});


ROUTER.get('/config', ROUTER.authenticate, function (req, res)
{
    res.status(200).json(CONFIGDB.config);
});


ROUTER.post('/reboot', ROUTER.authenticate, function (req, res)
{
    if (STATUS.busy()) {
        return res.status(400).json({ error: 'device is busy' });
    }

    STATUS.set('Rebooting system', -1);

    var t = setTimeout(function rebootTimeout ()
    {
        PROCESS('sudo', [ 'reboot' ], { detached: true, stdio: 'ignore' })
            .then(function () { }).catch(function (e) { });
    }, 1000);

    res.status(200).json({ status: 'ok' });
});


ROUTER.post('/poweroff', ROUTER.authenticate, function (req, res) {
    if (STATUS.busy()) {
        return res.status(400).json({ error: 'device is busy' });
    }

    STATUS.set('Powering down management processor', -1);

    var t = setTimeout(function powerOffTimeout ()
    {
        PROCESS('sudo', ['poweroff'], { detached: true, stdio: 'ignore' })
            .then(function () { }).catch(function (e) { });
    }, 1000);

    res.status(200).json({ status: 'ok' });
});


ROUTER.post('/login', function (req, res)
{
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    var username;
    var password;

    if (_is_ip_blocked(ip)) {
        return res.status(429).send({ error: 'Too many login attempts. Try again later.' });
    }

    if (req.body.username && req.body.password) {
        username = req.body.username;
        password = req.body.password;
    }

    var user = USERS.find({ username: username });

    if (!user) {
        return res.status(401).json({ error: 'Bad username or password' });
    }

    USERS.authenticate(user, password).then(() =>
    {
        var options = { issuer: 'dolphinics.com' };
        var jwtData = { mxsuid: user.id, updated: user.updated, t: Date.now() };

        if (sessionTime) {
            options.expiresIn = sessionTime;
        }

        var token = JWT.sign(jwtData, process.env.NODESEC, options);
        _unblock_ip(ip);

        SESSIONS.add(token, (sessionTime ? ((sessionTime * 1000) + jwtData.t) : 0));
        res.status(200).json({ status: "ok", token: token });
    }).catch((err) => {
        res.status(401).json({ error: 'Bad username or password' });
    });
});


ROUTER.post('/logout', ROUTER.authenticate, function (req, res)
{
    var error_response = { error: 'bad request' };
    var token = SESSIONS.reqToToken(req);

    if (!SESSIONS.valid(token)) {
        return res.status(400).json(error_response);
    }

    SESSIONS.delete(token);

    req.logout();
    res.status(200).json({ status: 'ok' });
});


module.exports = ROUTER;