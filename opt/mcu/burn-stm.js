#!/usr/bin/env node

/*******************************************************************************
 *                                                                             *
 * Copyright (C) 2018 - 2020                                                   *
 *         Dolphin Interconnect Solutions AS                                   *
 *                                                                             *
 *    All rights reserved                                                      *
 *                                                                             *
 *                                                                             *
 *******************************************************************************/

const STMBL = require('/opt/mxs824/node_modules/stm32bl');
const STMMGMT = require('/opt/mxs824/stmmgt');

var promises = [];

function burnStm(file, serial, hostname, stmNo, cb)
{
    if (!cb) {
        cb = function(e) {};
    }
    if (stmNo > 5) {
        console.log(`\tExiting MCU bootloader`);

        /* All MCUs are burned. Let all of them out of reset */
        STMMGMT.exit_bootloader(0, (e) =>
            {
                if (e) {
                    return cb(`Failed to exit bootloader for MCU`);
                }
                return cb();
            });
        return;
    } else if (0 > stmNo) {
        return cb();
    }

    console.log(`Placing MCU#${stmNo} in bootloader`);

    /* This puts all STMs in reset, set the boot pins and releases stmNo into
     * the bootloader. If stmNo > 0, then stmNo-1 is put back in reset at this
     * point.
     */
    STMMGMT.enter_bootloader(stmNo, (e) =>
    {
        if (e) {
            return cb(`Failed to enter bootloader on MCU#${stmNo} ${e}`);
        }

        console.log(`\tHandshaking MCU#${stmNo}`);

        if (STMBL.handshake()) {
            STMMGMT.exit_bootloader(stmNo, (e) =>
            {
                return cb(`Failed to handshake MCU#${stmNo}`);
            });
            return;
        }

        console.log(`\tErasing MCU#${stmNo} - be patient`);

        if (STMBL.erase()) {
            STMMGMT.exit_bootloader(stmNo, (e) =>
            {
                return cb(`Failed to erase MCU#${stmNo}`);
            });
            return;
        }

        console.log(`\tWriting MCU#${stmNo} - be patient`);

        if (STMBL.write(file, serial, hostname)) {
            STMMGMT.exit_bootloader(stmNo, (e) =>
            {
                return cb(`Failed to write MCU#${stmNo}`);
            });
            return;
        }

        console.log(`\tCalling GO on MCU#${stmNo}`);

        if (STMBL.go()) {
            console.log(`\tMCU#${stmNo} failed to GO`);
        }

        console.log(`MCU#${stmNo} done\n`);
        burnStm(file, serial, hostname, ++stmNo, cb);

    });

    console.log('\nUpdating MCU code\n');
}

if (5 > process.argv.length) {
    console.log('Bad parameters.');
    console.log(`${process.argv[1]} <filename> <serial> <hostname>`);
    process.exit(1);
}

var file = process.argv[2];
var serial = process.argv[3];
var hostname = process.argv[4];

Promise.all(promises).then(function()
{
    burnStm(file, serial, hostname, 0, function(err)
    {
        var ret = 0;

        if (err) {
            ret = 1;
            console.error(err);
        }

        process.exit(ret);
    });
}).catch(function(e)
{
    console.error(e);
    process.exit(1);
});
