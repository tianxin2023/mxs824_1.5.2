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
const SESSIONFILE = '/etc/opt/mxs824/sessions.json';
const SESSIONSDB = function () { };


/* Attempt to load config file */
var allowInitial = 0;

try {
    var sessions = require(SESSIONFILE);
} catch (e) {
    var sessions = {};
    allowInitial = 1;
}


function _write_db(cb)
{
    if (!cb) {
        cb = function(err)
        {
            if (err) {
                console.error(`ERROR: failed to save session database ${err}`);
            }
        };
    }

    /* Write to copy, then move file */
    FS.writeFile(SESSIONFILE + '-copy', JSON.stringify(sessions), (err) =>
    {
        if (err) {
            return cb(err);
        }

        FS.rename(SESSIONFILE + '-copy', SESSIONFILE, (err) => {
            cb(err);
        });
    });
}


function _invalid_token(token)
{
    /* Check if not 0, as 0 means infinite expire time */
    return (sessions[token] && (Date.now() >= sessions[token]));
}


/**
 * Check for expired login sessions every 10th minute.
 * Don't worry, passport and JWT handles expired tokens
 * properly, this is just to free up memory.
 */
var cleanupInterval = setInterval(function ()
{
    var token;
    var deleted = 0;

    for (token in sessions) {
        if (!sessions.hasOwnProperty(token)) {
            continue;
        }

        /* This deletes expired tokens */
        if (_invalid_token(token)) {
            SESSIONSDB.delete(token, 1);
            ++deleted;
        }
    }
    
    if (deleted) {
        _write_db();
    }
}, 600000);


SESSIONSDB.reqToToken = function(req)
{
    var token = req.get('Authorization');
    var bearer = 'bearer ';

    if (!token) {
        return;
    }

    var pos = token.indexOf(bearer);

    if (pos !== 0) {
        return;
    }

    return token.substring(bearer.length, token.length);
};


SESSIONSDB.find = function(token)
{
    if (this.valid(token)) {
        return sessions[token];
    }
    
    return null;
};


SESSIONSDB.add = function (token, expireMS)
{
    if (!token || (typeof token !== 'string') || !token.length || isNaN(expireMS)) {
        return;
    }

    sessions[token] = expireMS;

    _write_db();
};


SESSIONSDB.delete = function (token, memoryOnly)
{
    if (!token || !sessions.hasOwnProperty(token)) {
        return;
    }

    sessions[token] = undefined;
    delete sessions[token];
    
    if (memoryOnly) {
        return;
    }

    _write_db();
};


SESSIONSDB.valid = function (token)
{
    if (!token) {
        return false;
    }

    if (!sessions.hasOwnProperty(token)) {
        /**
         * This is an ugly but required hack when migrating from 1.1.0
         * to later releases. The user will be logged out during upgrade
         * without this. Don't worry; the user cannot forge JWT Tokens.
         * It will be validated later even though forced into the
         * database. Can probably be removed in good time after
         * 1.2.0 release.
         */
        if (allowInitial) {
            /* Will be logged out after 24h */
            this.add(token, (Date.now() + 86400000));
            allowInitial = 0;
        } else {
            return false;
        }
    }

    if (_invalid_token(token)) {
        /* Login has expired */
        this.delete(token);
        return false;
    }
    
    return true;
};


module.exports = SESSIONSDB;