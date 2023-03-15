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
RETFILE="/etc/opt/mxs824/upgrade-result"
LOG="${BUSYDIR}/upgrade.log"

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
    local logbase="/var/log/mxs824/upgrade-$NOW"
    local logDest="${logbase}.log"
    local attempts=0

    while [ $attempts -lt 999 ]; do
        if [ -f "$logDest" ]; then
            logDest="${logbase}-${attempts}.log"
            attempts=$(( $attempts + 1 ))
        else
            attempts=1000
        fi
    done

    echo "$result" > "$RETFILE" || echo "Failed to write return code" >>"$LOG"

    /bin/sleep 3 || echo "Failed to sleep" >>"$LOG"
    mv "$LOG" "$logDest" || true
    rm -rf "$BUSYDIR" || echo "Failed to remove upgrade directory" >>"$logDest"
}
trap cleanup EXIT

function check_ret
{
    if [ "$1" == "0" ]; then
        echo "$2 succeeded" >>"$LOG"
    else
        echo "$2 failed" >>"$LOG"
    fi
}

#Make sure dpkg doesn't try to ask us questions interactively
export DEBIAN_FRONTEND=noninteractive

printf "Upgrade initiated %s %s\n\n" "$( date )" "($( date +%s ))" > "$LOG"

printf "\nResuming aborted install (if any)\n\n" >>"$LOG"
sudo --preserve-env=DEBIAN_FRONTEND dpkg --force-confnew --configure -a >>"$LOG" 2>&1 || ret="$?"
result=$(( "$result" + "$ret" ))
check_ret "$ret" 'Resuming aborted upgrade'

printf "Updating repository\n\n" >>"$LOG"

sudo --preserve-env=DEBIAN_FRONTEND apt-get -q -y update >>"$LOG" 2>&1 || result="$?"
check_ret "$result" 'Update repository'

ret=0
printf "\nDownloading packages\n\n" >>"$LOG"

sudo --preserve-env=DEBIAN_FRONTEND apt-get --download-only -y dist-upgrade || ret="$?"
result=$(( "$result" + "$ret" ))
check_ret "$ret" 'Download'

printf "\nChangelog for upgrade:\n\n" >>"$LOG"
apt-listchanges --which=both --no-network --frontend text /var/cache/apt/archives/*.deb >>"$LOG" 2>&1 || true

printf "\nUpgrading packages\n\n" >>"$LOG"
sudo --preserve-env=DEBIAN_FRONTEND apt-get -o Dpkg::Options::="--force-confnew" -q -y dist-upgrade >>"$LOG" 2>&1 || ret="$?"
result=$(( "$result" + "$ret" ))
check_ret "$ret" 'Upgrade'

ret=0
printf "\nCleaning up\n\n" >>"$LOG"

sudo --preserve-env=DEBIAN_FRONTEND apt-get -q -y clean >>"$LOG" 2>&1 || ret="$?"
result=$(( "$result" + "$ret" ))
check_ret "$ret" 'Clean'

ret=0
printf "\nRemoving unused packages\n\n" >>"$LOG"

sudo --preserve-env=DEBIAN_FRONTEND apt-get -q -y autoremove >>"$LOG" 2>&1 || ret="$?"
result=$(( "$result" + "$ret" ))
check_ret "$ret" 'Upgrade'

if [[ -f "/var/run/reboot-required" ]]; then
    printf "\nSystem reboot required.\n\n" >>"$LOG"
fi

/bin/sync || true
/bin/echo 1 > /proc/sys/vm/drop_caches || true

exit "$result"
