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

var _errors = {};


exports.get = function()
{
    return _errors;
};


exports.set = function(type, str)
{
    if (_errors.hasOwnProperty(type)) {
        _errors[type] = undefined;
    } else {
        console.error(str);
    }

    _errors[type] = str;
};


exports.clear = function(type)
{
    if (_errors.hasOwnProperty(type)) {
        _errors[type] = undefined;
        delete _errors[type];
    }
};

