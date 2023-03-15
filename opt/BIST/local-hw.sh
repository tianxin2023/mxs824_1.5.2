#!/usr/bin/env bash

. common.sh

ERR=0

echo "TESTING LOCAL HARDWARE"
echo

diskusage=$( df | grep /$ | tr -s ' ' | cut -f 5 -d' ' | tr -d "%" )
memusage=$( printf "%.0f" $( free | grep 'Mem' | awk '{print $3/$2 * 100.0}' ) )

if [ -z "$diskusage" ]; then
    diskusage=-1
fi

if [ -z "$memusage" ]; then
    memusage=-1
fi

pgood "CPU utilization $( mpstat | tail -n 1 | awk '{print 100 - $12}' )%"

if [ $diskusage -lt 80 ]; then
    pgood "disk utilization $diskusage%"
else
    if [ $dikusage -gt 95 ]; then
        pwarn "high disk utilization $diskusage%"
    else
        perr "critical high disk utilization $diskusage%"
        ERR=$(( $ERR + 1 ))
    fi
fi

if [ $memusage -gt 90 ]; then
    perr "critical high memory utilization $memusage%"
    ERR=$(( $ERR + 1 ))
else
    pgood "memory utilization $memusage%"
fi

file="/tmp/wtest-$( date +%s )"
touch "$file" 2>/dev/null

if [ "$?" == '0' ]; then
    pgood "has write access to disk"
    rm -f "$file" 1>/dev/null 2>&1
else
    perr "no write access to disk"
    ERR=$(( $ERR + 1 ))
fi

exit $ERR
