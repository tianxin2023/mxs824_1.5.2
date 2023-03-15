#!/bin/bash

set -e

# This script sets up a 'plain' arm64 rootfs to use our mxs824 apt repo and
# installs the mxs824 packages

if [[ $(uname -m) != "aarch64" ]]; then
	echo "Please run this script on the target switch or in a chroot with qemu-aarch64-static"
	exit 1
fi

echo 'nameserver 1.1.1.1' > /etc/resolv.conf

export DEBIAN_FRONTEND=noninteractive

apt-get -qq update
apt-get install -qq -y mxs824
apt-get -qq -y dist-upgrade
apt-get -qq -y autoremove
apt-get clean

