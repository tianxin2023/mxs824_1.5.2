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
const ARGON2 = require('argon2');
const USERFILE = '/etc/opt/mxs824/users.json';


/* Attempt to load config file */
try {
    var users = require(USERFILE);
} catch (e) {
    var users = {};
    console.log(`ERROR: User file (${USERFILE}) has bad contents.`);
    console.log(e);
}


function _write_db(cb)
{
    if (!cb) {
        cb = function (e) { };
    }

    /* Write to copy, then move file */
    FS.writeFile(USERFILE + '-copy', JSON.stringify(users), (err) =>
    {
        if (err) {
            return cb(err);
        }

        FS.rename(USERFILE + '-copy', USERFILE, (err) => {
            cb(err);
        });
    });
}


const USERDB = function () { };


USERDB.find = function(user)
{
    var i;
    var missingAttr = 0;

    if (!user) {
        return null;
    }

    if (!user.hasOwnProperty('username')) {
        user.username = 'unown';
        ++missingAttr;
    }

    if (!user.hasOwnProperty('id')) {
        user.id = -1;
        ++missingAttr;
    }

    if (missingAttr == 2) {
        return null;
    }

    if ((typeof user.username !== 'string') || !user.username.length)
    {
        return null;
    }

    for (i = 0; i < users.length; ++i) {
        if ((users[i].username === user.username) || (users[i].id === user.id)) {
            return users[i];
        }
    }

    return null;
};


USERDB.passwd = function (user, password, oldpassword)
{
    return new Promise(function (resolve, reject)
    {
        if ((typeof password !== 'string') || !password.length ||
            (password.length > 512) || !oldpassword ||
            !oldpassword.length || oldpassword === password) {
            return reject(`invalid parameters`);
        }


        ARGON2.verify(user.password, oldpassword).then(function(match)
        {
            if (!match) {
                return Promise.reject(`incorrect current password`);
            }

            return ARGON2.hash(password);
        }).then(function(hash)
        {
            var oldPwd = user.password;
            var oldUpdated = user.updated;
            user.passwd = undefined;
            user.password = hash;
            user.updated = undefined;
            user.updated = (new Date()).getTime();

            _write_db(function (err)
            {
                if (err) {
                    user.password = oldPwd;
                    user.updated = oldUpdated;
                    reject(err);
                } else {
                    resolve(user);
                }
            });
        }).catch(function (err)
        {
            reject(err);
        });
    });
};


USERDB.authenticate = function (user, password)
{
    return new Promise(function(resolve, reject)
    {
        if ((typeof password !== 'string') || !password.length) {
            return reject(`invalid password`);
        }

        ARGON2.verify(user.password, password).then(function(match)
        {
            if (!match) {
                return reject(`bad credentials`);
            }

            resolve();
        }).catch(function(err)
        {
            reject(err);
        });
    });
};


module.exports = USERDB;