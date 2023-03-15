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
TRIGGERFILE='/var/spool/mxs824/perform-factory-reset'
LOG="/tmp/mxs824-setup-$NOW.log"
ret=0
result=0
unexport=0

function check_ret
{
    if [ "$1" == "0" ]; then
        echo "$2 succeeded" >>"$LOG"
    else
        echo "$2 failed" >>"$LOG"
    fi
}

LEDID=$( ls '/sys/bus/i2c/devices/i2c-0/0-0027/gpio' ) || ret="$?"
if [ "$ret" != '0' ]; then
    LEDID='0'
else
    LEDID=$(( ${LEDID:8} + 1 ))
    if [ ! -d "/sys/class/gpio/gpio$LEDID" ]; then
        echo "$LEDID" > '/sys/class/gpio/export' || ret="$?"
        if [ "$ret" == '0' ]; then
            unexport=1
        fi
    fi

    if [ ! -d "/sys/class/gpio/gpio$LEDID" ]; then
        LEDID='0'
    fi
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
    systemctl enable mxs824
    systemctl start mxs824

    ledOff

    if [ "$unexport" == '1' ]; then
        echo "$LEDID" > '/sys/class/gpio/unexport' || ret="$?"
    fi
}
trap cleanup EXIT

function clean_old_files
{
    local r=0
    local up=0
    local dhsize=$( ls -l '/etc/nginx/dhparam.pem' ) || up=1

    if [ "$up" == '0' ]; then
        dhsize=$( echo "$dhsize" | cut -f 5 -d ' ' ) || dhsize=0

        if [ "$dhsize" -lt 769 ]; then
            up=1
        fi
    fi

    if [ "$up" == '1' ]; then
        rm -f '/etc/nginx/dhparam.pem' || r="$?"
    fi

    /bin/rm -rf /root/* /tmp/* /etc/ssl/certs/nginx-selfsigned.crt /etc/ssl/private/nginx-selfsigned.key /var/log/mxs824/* /run/mxs824/* /var/spool/mxs824/* >/dev/null 2>&1 || r="$?"
    /bin/rm -rf /etc/opt/mxs824/api-custom.json /etc/opt/mxs824/sessions.json /etc/opt/mxs824/nodesec /usr/lib/systemd/timesyncd.conf.d/30-mxsntp.conf /etc/systemd/network/20-wired.network || r="$?"
    journalctl --vacuum-size=1M || r="$?"
    journalctl --vacuum-size=200M || r="$?"

    mv /var/log/nginx/access.log /var/log/nginx/access.log.old >/dev/null 2>&1 || r="$?"
    mv /var/log/nginx/error.log /var/log/nginx/error.log.old >/dev/null 2>&1 || r="$?"
    kill -USR1 $( cat /var/run/nginx.pid ) >/dev/null 2>&1 || r="$?"
    /bin/rm -f /var/log/nginx/access.log.old /var/log/nginx/error.log.old /var/log/nginx/*log* >/dev/null 2>&1 || r="$?"

    hostnamectl set-hostname 'localhost' || r="$?"
    check_ret "$r" 'Reset hostname'

    $( node >"$LOG" 2>&1 <<EOF
const FS = require('fs');
const UTIL = require('util');
const PATH = require('path');
const DIR = '/etc/opt/mxs824/pfx_configs';
const READDIRASYNC = UTIL.promisify(FS.readdir);
const UNLINKASYNC = UTIL.promisify(FS.unlink);

async function cleanPFX()
{
    var i;
    var files = await READDIRASYNC(DIR).catch(function(e)
    {
        console.error('Failed process PFX directory: ' + e.message);
        process.exit(1);
    });

    for (i = 0; i < files.length; ++i) {
        if (PATH.extname(files[i]) !== '.json') {
            continue;
        }

        try {
            const json = require(PATH.join(DIR, files[i]));
           
            if (json.protected) {
                continue;
            }

            await UNLINKASYNC(PATH.join(DIR, files[i])).catch(function(e)
            {
                console.error('Failed to delete ' + files[i]);
            });

            await UNLINKASYNC(PATH.join(DIR, PATH.basename(files[i], '.json'))).catch(function(e)
            {
                console.error('Failed to delete ' + PATH.basename(files[i], '.json'));
            });

            await UNLINKASYNC(PATH.join(DIR, PATH.basename(files[i], '.json') + '.sha256sum')).catch(function(e)
            {
                console.error('Failed to delete ' + PATH.basename(files[i], '.json') + '.sha256sum');
            });
        } catch (e) {
            console.error('Failed to process ' + files[i] + ': ' + e.message);
        }
    }

    process.exit(0);
}

cleanPFX();
EOF
    ) || ret="$?"
}

setup_static_ip()
{
    cat > /etc/systemd/network/20-wired.network <<EOF
[Match]
Name=eth0

[Network]
DHCP=no
LinkLocalAddressing=ipv6
IPv6AcceptRA=no
DNS=192.168.1.1

[Address]
Address=192.168.1.210/24

[Route]
Gateway=192.168.1.1
EOF
    systemctl enable systemd-networkd
    systemctl restart systemd-networkd
}

setup_ntp() {
    if [ ! -d '/usr/lib/systemd/timesyncd.conf.d' ]; then
        mkdir '/usr/lib/systemd/timesyncd.conf.d'
    fi

    echo -e '[Time]\nNTP=pool.ntp.org\n' > '/usr/lib/systemd/timesyncd.conf.d/30-mxsntp.conf'
    /usr/bin/timedatectl set-timezone 'UTC'
    systemctl restart systemd-timesyncd

    chown root:mxs824hw '/usr/lib/systemd/timesyncd.conf.d/30-mxsntp.conf'
    chmod 664 '/usr/lib/systemd/timesyncd.conf.d/30-mxsntp.conf'
}

function dpkg_fix
{
    #Make sure dpkg doesn't try to ask us questions interactively
    export DEBIAN_FRONTEND=noninteractive

    local r=0
    echo 'Reconfiguring Dolphin packages' >> "$LOG"
    /bin/rm -f /etc/ssh/ssh_host_* || r=0
    dpkg-reconfigure -fnoninteractive \
        mxs824-system-config mxs824-static-web mxs824-pfx-config \
        mxs824-node-app mxs824 mxs824-mcu-firmware >>"$LOG" 2>&1 || r="$?"
    check_ret "$r" 'Reconfigure DPKG'
}

burn_pfx()
{
    local r=0
    printf "\nBurning PFX\n"

    $( node >>"$LOG" 2>&1 <<EOF
const API = require('/opt/mxs824/db/api-config.js');
const PFX = require('/opt/mxs824/pfx_flash.js');

if (!API.config.activeConfig || !API.config.activeConfig.file)
{
	console.error('Invalid config, no active PFX file found');
	console.log(API.config);
	process.exit(0);
}

PFX.write('/etc/opt/mxs824/pfx_configs/' + API.config.activeConfig.file,
	function (status, progress)
	{
		console.log(status + ': ' + progress + '%');
	},
	function (err)
	{
		if (err) {
			console.error('Failed to burn PFX: ' + err);
			process.exit(1);
		}

		process.exit(0);
	}
);
EOF
 ) || r="$?"
check_ret "$r" 'Burn PFX'
}

function update_pwd()
{
    local r=0
    local salt='F!ctory'
    local pass=$( echo "${salt}${1}" | sha256sum ) || r="$?"
    echo -e "${pass:0:16}\n${pass:0:16}" | passwd root || r="$?"
    check_ret "$r" 'Set root password'

    cat > "/etc/opt/mxs824/users.json" <<EOF
[
    {
        "id": 1,
        "username": "admin",
        "password": "\$argon2i\$v=19\$m=4096,t=3,p=1\$hNPb5+uTKqg4Z8+MaW/oCg\$JPifc7cyLuYgfAb8KIvbepfppmuOkjawaJ+qw4due/A"
    }
]
EOF

    /bin/chown mxs824api:mxs824hw /etc/opt/mxs824/users.json
    /bin/chmod 660 /etc/opt/mxs824/users.json

    /bin/cat /dev/null > /root/.bash_history && history -c || r="$?"
}

if [ ! -f "$TRIGGERFILE" ]; then
    exit 0
fi

ledOn

SERIAL=$( /usr/bin/fw_printenv serialno | cut -f 2 -d '=' ) || SERIAL='MXS824-ZZ-000001'
SERIALNUMSTR="$( echo $SERIAL | cut -f3 -d'-' )" || SERIALNUMSTR='1'
SERIALNUM="$(expr $SERIALNUMSTR + 0)" || SERIALNUM=1
HOSTNAME="$( echo $SERIAL | cut -f1 -d'-')-$SERIALNUM" || HOSTNAME='MXS824-1'

printf "Setup initiated on %s %s %s\n\n" "$SERIAL" "$( date )" "($( date +%s ))" > "$LOG"

if [ "$SERIALNUM" == '1' ]; then
    echo "This is a switch in production, exiting ..." >> "$LOG"
    exit 0
fi

systemctl stop mxs824
systemctl disable mxs824

clean_old_files
setup_static_ip
setup_ntp
dpkg_fix
systemctl stop mxs824 1>/dev/null 2>&1 || true
burn_pfx
/bin/bash /opt/apt/change_repo.sh public_repo.list >/dev/null 2>&1 || true
update_pwd "$SERIAL"
systemctl start mxs824 1>/dev/null 2>&1 || true

echo "Setup completed with error code $result" >>"$LOG"

exit "$result"
