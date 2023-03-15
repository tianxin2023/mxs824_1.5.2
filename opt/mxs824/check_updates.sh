#!/usr/bin/env bash
if test "$BASH" = "" || "$BASH" -uc "a=();true \"\${a[@]}\"" 2>/dev/null; then
    # Bash 4.4, Zsh
    set -euo pipefail
else
    # Bash 4.3 and older chokes on empty arrays with set -u.
    set -eo pipefail
fi
shopt -s globstar

NOW="$( date +%s )"
BUSYDIR="/etc/opt/mxs824/upgrade"

result=0
ret=0

# Is an update already in progress?
mkdir "$BUSYDIR" || result="$?"
if [ "$result" != "0" ]; then
    (>&2 echo "An upgrade is already in progress")
    exit 1
fi

function cleanup
{
    rm -rf "$BUSYDIR" || echo "Failed to remove busy directory"
}
trap cleanup EXIT

function check_ret
{
    if [ "$1" != "0" ]; then
        echo "$2 failed"
    fi
}

#Make sure dpkg doesn't try to ask us questions interactively
export DEBIAN_FRONTEND=noninteractive

#We need to resume any aborted upgrade before running any other apt commands
sudo --preserve-env=DEBIAN_FRONTEND dpkg --force-confnew --configure -a || result="$?"
check_ret "$result" 'Resuming aborted upgrade'

sudo --preserve-env=DEBIAN_FRONTEND apt-get -q -y update 1>/dev/null 2>&1 || result="$?"
check_ret "$result" 'Update repository'

sudo --preserve-env=DEBIAN_FRONTEND apt-get --download-only -y dist-upgrade || result="$?"
check_ret "$result" 'Download packages'

updates_available=0
ls /var/cache/apt/archives/*.deb 1>/dev/null 2>&1 || updates_available="$?"

if [ "$updates_available" == '0' ]; then
    apt-listchanges --which=both --no-network --frontend text /var/cache/apt/archives/*.deb || result="$?"
    check_ret "$result" 'List changelog'
else
    printf "No updates available\n"
fi

cleanup
exit "$result"
