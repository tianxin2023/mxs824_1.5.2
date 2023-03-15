#!/usr/bin/env bash

. common.sh

tests=(
    'local-hw.sh'
    'system-devices.sh'
    'i2c-devices.sh'
    'node-errors.js'
    'stm-handshake.js'
)

ERR=0

echo "Dolphinics MX824 Built-In Self Test"
echo "Test initated $( date ) by $( whoami )"
echo

serial=$( sudo fw_printenv 'serialno' | cut -f 2 -d '=' )
macaddr=$( sudo fw_printenv 'ethaddr' | cut -f 2 -d '=' )
hostname=$( hostname )

echo "Running from $serial at $macaddr ($hostname)"
echo

ifconfig -a eth0
echo

for t in "${tests[@]}"; do
    if [ "${t##*.}" == 'js' ]; then
        node "$t"
        ret="$?"

        if [ "$ret" -lt 0 ]; then
            perr "Failed to run node application ${t}: $ret"
            ERR=$(( $ERR + 1))
        else
            ERR=$(( $ERR + $ret ))
        fi
    else
        bash "$t"
        ERR=$(( $ERR + $? ))
    fi
    echo
done

echo "Test completed with $ERR errors"

exit "$ERR"

