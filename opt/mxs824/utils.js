/*******************************************************************************
 *                                                                             *
 * Copyright (C) 2018 - 2019                                                   *
 *         Dolphin Interconnect Solutions AS                                   *
 *                                                                             *
 *    All rights reserved                                                      *
 *                                                                             *
 *                                                                             *
 *******************************************************************************/

async function _wait(ms)
{
    return new Promise((resolve) =>
    {
        setTimeout(resolve, ms);
    });
}


module.exports = {
    wait: _wait
};