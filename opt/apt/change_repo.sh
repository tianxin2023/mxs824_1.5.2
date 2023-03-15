#!/usr/bin/env bash

set -e

if [ -z "$1" ]; then
    echo 'Missing parameter'
    exit 1
fi

check_ret()
{
    if [ "$1" != '0' ]; then
        echo "$2 failed"
        exit 1
    fi
}

function cleanup
{
    local change=0

    if [ -f "$TMPSRCLST" ]; then
        change=1
        mv -f "$TMPSRCLST" '/etc/apt/sources.list' || change=0
    fi

    if [ -d "$TMPSRCDIR" ]; then
        change=1
        mv -f $TMPSRCDIR/* '/etc/apt/sources.list.d/' || true
        rm -rf "$TMPSRCDIR" || true
    fi

    if [ "$change" != '0' ]; then
        apt-get -qq update 1>/dev/null 2>&1 || true
    fi

    sync
}
trap cleanup EXIT

REPOFILE=$(dirname $0)/$1
NOW=$( date +%s )
TMPSRCLST="/tmp/sources.list-$NOW"
TMPSRCDIR="/tmp/sources.list.d-$NOW"

ret=0
cp -f '/etc/apt/sources.list' "$TMPSRCLST" || ret="$?"
check_ret "$ret" 'Backup sources.list'

mkdir "$TMPSRCDIR" || ret="$?"
check_ret "$ret" 'Create sources backup dir'

#Remove any upstream sources
echo '' > /etc/apt/sources.list || true

#Remove other sources
mv -f /etc/apt/sources.list.d/* "$TMPSRCDIR/" || true

if [ -f "$REPOFILE" ]; then
    echo "Changing repo to $REPOFILE"
    cp -f "$REPOFILE" '/etc/apt/sources.list.d/' || ret="$?"
    check_ret "$ret" "Change repo to $REPOFILE"
    chmod 444 /etc/apt/sources.list.d/*.list
    check_ret "$ret" "Chmod $REPOFILE"
else
    cnt=0
    for src in $( echo "$1" | tr ',' "\n"); do
        echo "deb ${src} bionic main" > "/etc/apt/sources.list.d/mxs824_custom_${cnt}.list" || ret="$?"
        check_ret "$ret" "Add ${src} to repo list"
        cnt=$(( "$cnt" + 1 ))
    done
fi

apt-get -qq update || ret="$?"
check_ret "$ret" "Update apt"

rm -rf "$TMPSRCLST" "$TMPSRCDIR"

echo "Done"
exit 0
