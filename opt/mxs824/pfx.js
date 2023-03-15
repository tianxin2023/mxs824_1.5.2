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

const FS = require('fs');
const PATH = require('path');
const CONFIGDIR = '/etc/opt/mxs824/pfx_configs';
const CONFIGDB = require(`./db/pfx-configs`);
const APIDB = require(`./db/api-config`);
const STATUS = require('./status');


function _check_for_config_update()
{
    var upgraded_config = CONFIGDB.find_upgraded_version(APIDB.config.activeConfig);
    if (upgraded_config == null) {
        delete APIDB.config.pfxUpdateAvailable;
        return;
    }

    APIDB.config.pfxUpdateAvailable = upgraded_config.id;
}


CONFIGDB.init(function()
{
    _check_for_config_update();
    console.log(`Config initialized: ` + new Date());
});


exports.get_all_configs = function ()
{
    return CONFIGDB.configs;
};


exports.reset_status = function ()
{
    return new Promise(function (resolve, reject)
    {
        const FLASH = require('./pfx_flash');

        FLASH.is_reset((reset) => {
            resolve(reset);
        });
    });
};


exports.reset_enter = function ()
{
    const FLASH = require('./pfx_flash');
    return FLASH.reset_enter();
};


exports.reset_exit = function ()
{
    const FLASH = require('./pfx_flash');
    return FLASH.reset_exit();
};


exports.burn = function (id)
{
    const FLASH = require('./pfx_flash');

    id = parseInt(id);

    if (isNaN(id) || (0 > id) || (id >= CONFIGDB.configs.length)) {
        STATUS.error(`invalid input data`);
        return;
    }

    STATUS.set('Verifying config', 0);

    CONFIGDB.verify(id).then(function()
    {
        FLASH.write(PATH.join(CONFIGDIR, CONFIGDB.configs[id].file), STATUS.set, (err) =>
        {
            if (err) {
                STATUS.error(`Burn failed with error: ${err}.`);
            } else {
                STATUS.set('Updating config', 0);
                APIDB.config.activeConfig = CONFIGDB.configs[id];
                APIDB.save().then(() =>
                {
                    STATUS.clear();
                }).catch((err) =>
                {
                    STATUS.error(`Failed to update active config: ${err.message}`);
                }).finally(() =>
                {
                    _check_for_config_update();
                });
            }
        });
    }).catch(function (e)
    {
        STATUS.error(`Failed to verify config file: ${e}.`);
    });
};


exports.add_cfg = function (config)
{
    return CONFIGDB.add(config);
};


exports.delete = function (filter)
{
    var configs = CONFIGDB.find(filter);

    if (!configs.length) {
        throw new Error('no matching configs found');
    }

    return CONFIGDB.delete(configs);
};
