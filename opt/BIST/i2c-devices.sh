#!/usr/bin/env bash

. common.sh

ERR=0


function i2cMaskMatch
{
    type='b'

    if [ "${#3}" == '6' ]; then
        type='w'
    fi

    res=$( i2cget -f -y 0 $1 $2 $type 2>&1 )

    if [ "$?" != '0' ]; then
        perr "Reading reg $2 from I2C addr $1 failed: $res"
        ERR=$(( $ERR + 1 ))
        return
    fi

    if [ $(( $res & $3 )) == 0 ]; then
        perr "$res does not match $3 in reg $2 from I2C addr $1"
        ERR=$(( $ERR + 1 ))
    else
        pgood "reg $2 from I2C addr $1 is sane"
    fi
}


function i2cBitsSet
{
    type='b'

    if [ "${#3}" == '6' ]; then
        type='w'
    fi

    res=$( i2cget -f -y 0 $1 $2 $type 2>&1 )

    if [ "$?" != '0' ]; then
        perr "Reading reg $2 from I2C addr $1 failed: $res"
        ERR=$(( $ERR + 1 ))
        return
    fi

    if [ $(( $res & $3 )) == 0 ]; then
        pgood "reg $2 from I2C addr $1 is sane"
    else
        perr "$res has bad bits set ($3) in reg $2 from I2C addr $1"
        ERR=$(( $ERR + 1 ))
    fi
}


echo "TESTING I2C DEVICES"
echo


echo "Testing 3.3V regulator"

# device code (generic I2C test)
i2cMaskMatch 0x1B 0x19 0xB0

# 0xD87E indicate error bits (primitive error test)
i2cBitsSet 0x1B 0x79 0xD87E


for i in $( seq 25 27 ); do
    echo "Testing ioexpander 0x$i"

    ret=$( i2cget -f -y 0 "0x$i" 0x00 b 2>&1 )
    
    if [ "$?" == '0' ]; then
        pgood "input port returns $ret"
    else
        perr "failed to read input port: $ret"
        ERR=$(( $ERR + 1 ))
    fi
done



echo "Testing 0.9V regulator"

# A bit primitive test of a register expected to be zero
i2cBitsSet 0x4F 0xB3 0xFFFF

# 0xF8F4 indicate error bits (primitive error test)
i2cBitsSet 0x4F 0x79 0xF8F4

echo "Testing Max. fan controller"

# Manufacturer ID match
i2cMaskMatch 0x52 0x99 0x4D

# 0x8424 indicate error bits (primitive error test)
i2cBitsSet 0x52 0x79 0x8424

echo "Testing power monitor"

# initial read clears start-up registers
i2cget -y 0 0x5C 0x80 b 1>/dev/null 2>&1

if [ "$?" != '0' ]; then
    perr "Reading reg 0x80 failed for power monitor 0x5C"
    ERR=$(( $ERR + 1 ))
else
    pgood "clearing status register"
fi

# 0x6F indicate error bits (primitive error test)
i2cBitsSet 0x5C 0x80 0x6F


echo "Testing 12V regulator"

# device code (generic I2C test)
i2cMaskMatch 0x69 0xFC 0x00FF

# 0x8038 indicate error bits (primitive error test)
i2cBitsSet 0x69 0x79 0x8038

echo "Testing PFX I2C device availability"
i2cdetect -y 0 | grep 18 >/dev/null 2>&1

if [ "$?" == '0' ]; then
    pgood 'PFX I2C device is available'
else
    perr 'PFX I2C device is unavailable'
    ERR=$(( $ERR + 1 ))
fi

echo "Testing SEEPROM"

seefile="/tmp/seeprom-$( date +%s )"
node -e "const S = require('/opt/mxs824/seeprom'); S.read('$seefile', (e) => { process.exit(e) });"

if [ "$?" != '0' ]; then
    perr "failed to read SEEPROM"
    exit $(( $ERR + 1 ))
fi

p2pVenID=$( xxd -l 2 -s 0x37 -u "$seefile" | cut -f 2 -d ' ' )

if [ "$p2pVenID" == "11F8" ]; then
    pgood "reg 0x37 from SEEPROM 0x57 gives sane data 0x$p2pVenID"
else
    perr "reg 0x37 from SEEPROM 0x57 gives bad data 0x$p2pVenID"
    ERR=$(( $ERR + 1 ))
fi

rm -f $seefile

exit $ERR
