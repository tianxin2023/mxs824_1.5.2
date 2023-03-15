#!/usr/bin/env nodejs

'use strict';

const MGT = require('/opt/mxs824/stmmgt');
const BL  = require('/opt/mxs824/node_modules/stm32bl');

var stmNo = 0;
var len = 6;
var errors = 0;

if (process.argv.length == 3) {
    stmNo = parseInt(process.argv[2]);
    len = stmNo + 1;
}

if (isNaN(stmNo) || (0 > stmNo) || (stmNo > 5)) {
    console.log(`[ error ]: invalid STM specified`);
    process.exit(1);
}

function handshake_stm(no)
{
    if ((0 > no) || (no >= len)) {
        return (0 > no);
    }

    console.log(`Handshaking STM#${no}`);

    MGT.enter_bootloader(no, (e) =>
    {
        var ret = 0;

        if (e) {
            console.error(`[ error ] failed to enter bootloader: ${e}`);
            ++errors;
            handshake_stm(++no);
        }

        if (BL.handshake()) {
            console.error(`[ error ]: handshake failed!`);
            ++errors;
        }

        MGT.exit_bootloader(no, (e) => {
            if (e) {
                console.log(`[ error ]: failed to exit bootloader: ${e}`);
                ++errors;
            } else {
                console.log(`[success]: handshake complete for STM#${no}`);
            }

            handshake_stm(++no);
        });
    });
}

console.log(`Checking for STM SPI access through BL handshake\n`);

handshake_stm(stmNo);