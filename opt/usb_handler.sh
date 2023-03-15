#!/usr/bin/env bash
if test "$BASH" = "" || "$BASH" -uc "a=();true \"\${a[@]}\"" 2>/dev/null; then
    # Bash 4.4, Zsh
    set -euo pipefail
else
    # Bash 4.3 and older chokes on empty arrays with set -u.
    set -eo pipefail
fi
shopt -s nullglob globstar

NOW="$( date +%s )"
LOG="/root/usb-log-$NOW.txt"
DIR="/mnt/SDA$NOW"
DEST="$DIR/MXS$NOW"
FIL='upgrade.zip'
TMPDIR='/tmp'
DEV="$1"

# Only work on partition 1
if [ "$2" != '1' ]; then
    exit 0
fi 

LEDID=$( ls '/sys/bus/i2c/devices/i2c-0/0-0027/gpio' )
if [ "$?" != '0' ]; then
    LEDID='0'
else
    LEDID=$(( ${LEDID:8} + 1 ))
fi


function ledOn
{
    if [ "$LEDID" != '0' ]; then
        echo 'out' > "/sys/class/gpio/gpio$LEDID/direction"
    fi
}


function ledOff
{
    if [ "$LEDID" != '0' ]; then
        echo 'in' > "/sys/class/gpio/gpio$LEDID/direction"
    fi
}


function cleanup
{
    if [ -f "$TMPDIR/$NOW" ]; then
        rm -f "$TMPDIR/$NOW" || true
    fi

    if [ -d "${TMPDIR}/${NOW}-dir" ]; then
        rm -rf "${TMPDIR}/${NOW}-dir" || true
    fi

    if [ -d "$DIR" ]; then
        mv "$LOG" "$DEST/" || true
        sync || true
        umount "$DIR" || true
        rm -rf "$DIR" || true
    else
        rm -f "$LOG" || true
    fi

    ledOff
}
trap cleanup EXIT


function upgrade
{
    zipdir="${1}-dir"

    # test for password-less extraction, we do NOT want to support this
    unzip -P '' "$1" -d "$zipdir" >/dev/null 2>&1
    if [ "$?" == '0' ]; then
        rm -rf "$zipdir"
        echo "Bad upgrade executable" >> "$LOG"
        return 1
    fi

    unzip -P 'djD$_BVU*qUV5$n9cbmWAWPRFdNh6jaWE+72c=K&+5S2+pQ@m@pU9ZLCRt$Zm?!p' "$1" -d "$zipdir" >>"$LOG" 2>&1
    if [ "$?" != '0' ]; then
        echo "Failed to UNZIP $1" >>"$LOG"
    else
        if [ -f "$zipdir/upgrade.sh" ]; then
            bash "$zipdir/upgrade.sh" >"$DEST/upgrade-$NOW.log" 2>&1
            echo "Upgrade script success: $?" >>"$LOG"
        else
            echo "No upgrade file found" >>"$LOG"
        fi
        rm -rf "$zipdir"
    fi
}


printf "%s %s (%s %s)\n\n" "$( date )" "($( date +%s ))" "$DEV" "$2" > "$LOG"

if [ "$LEDID" != '0' ]; then
    if [ ! -d "/sys/class/gpio/gpio$LEDID" ]; then
        echo "$LEDID" > '/sys/class/gpio/export'
        if [ "$?" != '0' ]; then
            echo "Failed to export LED GPIO $LEDID" >>"$LOG"
        fi
    fi
fi

ledOn

mkdir "$DIR" >>"$LOG" 2>&1
if [ "$?" != '0' ]; then
    echo "Failed to create $DIR" >>"$LOG"
    exit 1
fi

mount -o rw "$DEV" "$DIR" >>"$LOG" 2>&1
if [ "$?" != '0' ]; then
    echo "Failed to mount SDA1 as writable" >>"$LOG"
    rm -rf "$DIR"
    exit 1
fi

mkdir "$DEST" >>"$LOG" 2>&1
if [ "$?" != '0' ]; then
    echo "Failed to create $DEST" >>"$LOG"
    exit 1
fi

if [ -f "$DIR/$FIL" ]; then
    echo "Found $DIR/$FIL on USB device" >>"$LOG"
    cp "$DIR/$FIL" "$TMPDIR/$NOW" >>"$LOG" 2>&1
    if [ "$?" != '0' ]; then
        echo "Failed to copy file" >> "$LOG"
    else
        upgrade "$TMPDIR/$NOW" || true
        rm -f "$TMPDIR/$NOW"
    fi
else
    echo "No upgrade ZIP found on USB device" >>"$LOG"
fi

ifconfig -a >"$DEST/ifconfig-$NOW.txt" 2>&1
if [ "$?" != '0' ]; then
    echo "Failed to retrieve IP configuration" >>"$LOG"
    exit 1
fi

cp '/run/mxs824/status.json' "$DEST/status-$NOW.json" 2>/dev/null || echo "Failed to retrieve status" >>"$LOG"

exit 0
