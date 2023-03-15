#!/usr/bin/env bash

function pgood
{
    echo "[success]: $1"
}


function perr
{
    echo "[ error ]: $1" 1>&2
}


function pwarn
{
    echo "[warning]: $1" 1>&2
}

