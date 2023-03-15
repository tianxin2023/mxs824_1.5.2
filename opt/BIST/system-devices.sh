#!/usr/env/bin bash

. ./common.sh


ERR=0


function devExists
{
    if [ -c "/dev/$1" ]; then
        pgood "$2 exists"
    else
        perr "$2 missing"
        ERR=$(( $ERR + 1 ))
    fi
}


function dirExists
{
    if [ -d "$1" ]; then
        pgood "$2 exists"
    else
        perr "$2 missing"
        ERR=$(( $ERR + 1 ))
    fi
}


function progExists
{
    res=$( $1 2>&1 )

    if [ "$?" == '0' ]; then
        pgood "$2 exists: $res"
    else
        perr "$2 missing"
        ERR=$(( $ERR + 1 ))
    fi
}


echo "TESTING FOR REQUIRED SYSTEM DEVICES AND PROGRAMS"
echo

devExists 'mtd0' 'MTD device 0'
devExists 'mtd0ro' 'MTD Read-Only device 0'
devExists 'i2c-0' 'I2C device 0'
devExists 'spidev0.0' 'DSPI device 0.0'

for i in $( seq 25 27 ); do
    dirExists "/sys/bus/i2c/devices/i2c-0/0-00$i/gpio" "I2C GPIO 0x$i"
done

progExists 'nginx -v' 'NGINX'
progExists 'node -v' 'Node'
progExists 'i2cget -V' 'i2cget'

exit "$ERR"

