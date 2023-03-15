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
const FS = require('fs');
const PATH = require('path');
const UPLOAD = require('../uploads');
const PFX = require('../pfx');
const STATUS = require('../status');
const ROUTER = EXPRESS.Router();
const CONFDIR = '/etc/opt/mxs824/pfx_configs';
const MRPC = require('mrpc');


var _get_reset_state = function (req, res)
{
    PFX.reset_status().then(function (isReset) {
        res.status(200).json({ reset: isReset });
    });
};


var _request_to_cfg_filter = function (req)
{
    var key;
    var filter = {};
    const sanitizeHtml = require('sanitize-html');
    const valid_keys = [
        'id',
        'name',
        'group',
        'type',
        'topology',
        'version',
        'ports',
        'speed',
        'width',
        'description'
    ];

    for (key in req.body) {
        /* We cannot let the user over-write critical functions */
        if (valid_keys.indexOf(key) !== -1) {
            if (typeof req.body[key] === 'number') {
                filter[key] = req.body[key];
            } else {
                filter[key] = sanitizeHtml(req.body[key]);
            }
        } else {
            throw new Error('bad request for config');
        }
    }

    return filter;
};


/* Available routes */
ROUTER.get('/reset', _get_reset_state);
ROUTER.get('/reset/status', _get_reset_state);


ROUTER.post('/reset', function (req, res)
{
    var promise;
    var reset = req.body.reset;
    var resetInt = parseInt(reset);

    if (!reset) {
        return res.status(400).json({ error: 'missing argument' });
    }

    if (STATUS.busy()) {
        return res.status(400).json({ error: `switch busy with: ${STATUS.get().state}` });
    }

    if ((reset === 'enter') || (reset == true)) {
        promise = PFX.reset_enter();
    } else if ((reset === 'exit') || (reset == false)) {
        promise = PFX.reset_exit();
    } else if (!isNaN(resetInt) && (resetInt > 0)) {
        promise = PFX.reset_enter();
        var t = setTimeout(PFX.reset_exit, resetInt);
    } else {
        return res.status(400).json({ error: 'invalid argument' });
    }

    promise.then(function()
    {
        res.status(200).json({ status: 'ok' });
    }).catch(function(err)
    {
        res.status(400).json({ error: err });
    });
});


ROUTER.get('/config', function (req, res)
{
    res.status(200).json(PFX.get_all_configs());
});


ROUTER.delete('/config/', function (req, res) {
    var filter;
    var del;

    if (STATUS.busy()) {
        return res.status(400).json({ error: `switch busy with: ${STATUS.get().state}` });
    }

    try {
        filter = _request_to_cfg_filter(req);
        del = PFX.delete(filter);
    } catch (e) {
        return res.status(400).json({ error: e.message });
    }

    del.then(() =>
    {
        res.status(200).json({ status: 'ok' });
    }).catch((e) =>
    {
        res.status(400).json({ error: e });
    });
});


ROUTER.post('/burn/:id', function (req, res)
{
    var err;

    if (STATUS.busy()) {
        return res.status(400).json({ error: `switch busy with: ${STATUS.get().state}` });
    }

    err = PFX.burn(req.params.id);

    if (err) {
        return res.status(400).json({ error: err });
    }

    res.status(200).json({ status: 'ok' });
});


ROUTER.post('/upload', UPLOAD.single('file'), function (req, res)
{
    var conf;
    var name = req.file.originalname ? req.file.originalname : 'unown';
    var destination = name;
    var offs = 0;

    if (STATUS.busy()) {
        FS.unlink(req.file.path, (e) => { });
        return res.status(400).json({ error: `switch busy with: ${STATUS.get().state}` });
    }

    while (FS.existsSync(PATH.join(CONFDIR, destination))) {
        destination = `${name}-${offs++}`;
    }

    FS.rename(req.file.path, PATH.join(CONFDIR, destination), (err) =>
    {
        if (err) {
            FS.unlink(req.file.path, (e) => {});
            return res.status(500).json({ error: err });
        }

        try {
            conf = _request_to_cfg_filter(req);
        } catch (e) {
            FS.unlink(req.file.path, (e) => { });
            return res.status(500).json({ error: e.message });
        }

        conf.group = 'Custom';
        conf.file = destination;
        delete conf.id;

        PFX.add_cfg(conf).then(function ()
        {
            res.status(200).json({ status: 'ok', file: destination });
        }).catch(function (e)
        {
            FS.unlink(PATH.join(CONFDIR, destination), (e) => { });
            res.status(400).json({ error: e });
        });
    });
});


ROUTER.get('/ports', function (req, res)
{
    MRPC.get_ports().then(function (d)
    {
        res.status(200).json(d);
    }).catch(function(e)
    {
        res.status(400).json({ error: e.message });
    });
});


module.exports = ROUTER;