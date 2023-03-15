#!/bin/bash

#Utility functions for DEB maintainer scripts

create_users() {
    #Nodejs backend runs under this user
    adduser --system mxs824api --ingroup mxs824hw --home /opt/mxs824/ || true
}

generate_default_users() {
    if [ ! -f "/etc/opt/mxs824/users.json" ]; then
        mkdir -p "/etc/opt/mxs824"
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
    fi
}

setup_permissions() {
    #tmp directory used by backend
    rm -rf /var/spool/mxs824 || true
    mkdir -p /var/spool/mxs824

    chown mxs824api /var/spool/mxs824/
    chmod 700 /var/spool/mxs824/

    mkdir -p /var/log/mxs824
    chown mxs824api /var/log/mxs824/
    chmod 755 /var/log/mxs824/

    chown -R mxs824api /etc/opt/mxs824/
    chmod 700 /etc/opt/mxs824/

    chown mxs824api /etc/systemd/network/20-wired.network
    chmod 664 /etc/systemd/network/20-wired.network

}

generate_nodesec() {
    #Generate nodesec, if it's not present
    if [ ! -s /etc/opt/mxs824/nodesec ] ;then
        NODESEC="$( < /dev/urandom tr -dc ' _!*A-Z-a-z-0-9' | head -c64)"
        echo "NODESEC=\"$NODESEC\"" > /etc/opt/mxs824/nodesec
        chown mxs824api /etc/opt/mxs824/nodesec
        chmod 400 /etc/opt/mxs824/nodesec
    fi
}

start_service() {
    #Start the nodejs backend
    systemctl daemon-reload
    systemctl enable mxs824init
    systemctl start mxs824init
    systemctl enable mxs824
    systemctl start mxs824
}


post_install() {
    create_users
    generate_default_users
    generate_nodesec
    setup_permissions

    #Backend contains a dynamic library. Make sure the system finds it
    ldconfig
    start_service
}


