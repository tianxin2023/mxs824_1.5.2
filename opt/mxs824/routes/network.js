/*******************************************************************************
 *                                                                             *
 * Copyright (C) 2018 - 2019                                                   *
 *         Dolphin Interconnect Solutions AS                                   *
 *                                                                             *
 *    All rights reserved                                                      *
 *                                                                             *
 *                                                                             *
 *******************************************************************************/

'use strict';

const EXPRESS = require('express');
const ROUTER = EXPRESS.Router();
const CONFIGDB = require('../db/api-config');
const STATUS = require('../status');
const UTIL = require('util');
const FS = require('fs');
const PROCESS = require('../process');
const ERROR = require('../errors');
const WRITEFILEASYNC = UTIL.promisify(FS.writeFile);

const NETWORK_FILE = '/etc/systemd/network/20-wired.network';
const NTP_FILE = '/usr/lib/systemd/timesyncd.conf.d/30-mxsntp.conf';


function _req_to_config(req, keys)
{
    var key;
    const sanitizeHtml = require('sanitize-html');
    var config = {};

    for (key in req.body) {
        var i;

        if (keys.indexOf(key) === -1) {
            throw new Error('bad parameters');
        }

        if (typeof req.body[key] === 'string') {
            var param = sanitizeHtml(req.body[key].replace(/\s/g, ''));
            config[key] = param.split(',');
        }
    }

    return config;
}


function _valid_ipv4(ip)
{
    var rx = /^(?!.*\.$)((1?\d?\d|25[0-5]|2[0-4]\d)(\.|$)){4}$/;

    if (!ip || (typeof ip !== 'string')) {
        return false;
    }

    return rx.test(ip);
}


function _valid_ipv6(ip)
{
    var rx = /(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))/;

    if (!ip || (typeof ip !== 'string')) {
        return false;
    }

    return rx.test(ip);
}


function _valid_domain(domain)
{
    var rx = /^(((?!-))(xn--|_{1,1})?[a-zA-Z0-9-]{0,61}[a-zA-Z0-9]{1,1}\.)*(xn--)?([a-zA-Z0-9\-]{1,61}|[a-zA-Z0-9-]{1,30}\.[a-zA-Z]{2,})$/;

    if (!domain || (typeof domain !== 'string')) {
        return 0;
    }

    return rx.test(domain);
}


function _valid_ipv4_array(ipa)
{
    var i;

    if (!Array.isArray(ipa)) {
        return _valid_ipv4(ipa);
    }

    for (i = 0; i < ipa.length; ++i) {
        if (!_valid_ipv4(ipa[i])) {
            return false;
        }
    }

    return true;
}


function _valid_ipv6_array(ipa)
{
    var i;

    if (!Array.isArray(ipa)) {
        return _valid_ipv6(ipa);
    }

    for (i = 0; i < ipa.length; ++i) {
        if (!_valid_ipv6(ipa[i])) {
            return false;
        }
    }

    return true;
}


function _valid_domain_array(domains)
{
    var i;

    if (!Array.isArray(domains)) {
        return _valid_domain(domains);
    }

    for (i = 0; i < domains.length; ++i) {
        if (!_valid_domain(domains[i])) {
            return false;
        }
    };

    return true;
}


function _netmask_to_cidr(mask)
{
    var i;
    var maskNodes = mask.match(/(\d+)/g);
    var cidr = 0;

    for (i = 0; i < maskNodes.length; ++i) {
        var node = parseInt(maskNodes[i]);

        if (isNaN(node) || ((node > 0) && ((128 > node) || (node > 255)))) {
            throw new Error(`Invalid netmask: ${mask}`);
        }

        cidr += (((node >>> 0).toString(2)).match(/1/g) || []).length;
    }

    return cidr;
}


function _req_to_ipv4_config(req)
{
    var config;
    var type;

    if (!req.body || !req.body.hasOwnProperty('type')) {
        throw new Error('missing parameters');
    }

    type = parseInt(req.body.type);
    delete req.body.type;

    config = _req_to_config(req, [
        'address',
        'netmask',
        'gateway',
        'domain',
        'dns'
    ]);

    config.type = type;

    if (isNaN(config.type) || (config.type > 2) || (config.type < 0)) {
        throw new Error('bad parameters');
    }

    return config;
}


function _req_to_ipv6_config(req)
{
    var config;
    var type;

    if (!req.body || !req.body.hasOwnProperty('type')) {
        throw new Error('missing parameters');
    }

    type = parseInt(req.body.type);
    delete req.body.type;

    config = _req_to_config(req, [
        'address',
        'gateway',
        'domain',
        'dns'
    ]);

    config.type = type;

    if (isNaN(config.type) || (config.type > 3) || (config.type < 0)) {
        throw new Error('bad parameters');
    }

    return config;
}


function _validate_ipv4_config(config)
{
    var requiredKeys;

    if (config.type == 0) {
        /* Static IP */
        requiredKeys = [ 'address', 'netmask', 'gateway', 'dns' ];
    } else if (config.type == 1) {
        /* DHCP, remove unwanted fields */
        config = { 'type': config.type };
        requiredKeys = [];
    } else if (config.type == 2) {
        /* DHCP with static IP, remove unwanted fields */
        config = { 'type': config.type, 'address': config.address };
        requiredKeys = ['address'];
    } else {
        throw new Error('bad config');
    }

    requiredKeys.forEach((key) =>
    {
        if (!config.hasOwnProperty(key) || (config[key] === undefined)) {
            throw new Error(`missing ${key}`);
        }
    });

    if (config.hasOwnProperty('address') && !_valid_ipv4_array(config.address)) {
        throw new Error('bad IPv4 address(es)');
    }

    if (config.hasOwnProperty('netmask') && !_valid_ipv4_array(config.netmask)) {
        throw new Error('bad netmask(s)');
    }

    if (config.hasOwnProperty('gateway') && !_valid_ipv4_array(config.gateway)) {
        throw new Error('bad gateway(s)');
    }

    if (config.hasOwnProperty('domain') && !_valid_domain_array(config.domain)) {
        throw new Error('bad dns settings');
    }

    if (config.hasOwnProperty('dns') && !_valid_ipv4_array(config.dns)) {
        throw new Error('bad dns settings');
    }
}


function _validate_ipv6_config(config)
{
    var requiredKeys;

    if (config.type === 1) {
        /* Static IP */
        requiredKeys = [ 'address', 'gateway', 'dns' ];
    } else if ((config.type >= 0) && (config.type < 4)) {
        /* Automatic */
        config = { 'type': config.type };
        requiredKeys = [];
    } else {
        throw new Error('bad config');
    }

    requiredKeys.forEach((key) =>
    {
        if (!config.hasOwnProperty(key) || (config[key] === undefined)) {
            throw new Error(`missing ${key}`);
        }
    });

    if (config.hasOwnProperty('address') && !_valid_ipv6_array(config.address)) {
        throw new Error('bad IPv6 address(es)');
    }

    if (config.hasOwnProperty('gateway') && !_valid_ipv6_array(config.gateway)) {
        throw new Error('bad gateway(s)');
    }

    if (config.hasOwnProperty('domain') && !_valid_domain_array(config.domain)) {
        throw new Error('bad dns settings');
    }

    if (config.hasOwnProperty('dns') && !_valid_ipv6_array(config.dns)) {
        throw new Error('bad dns settings');
    }
}


function _validate_ntp_config(timezones, config)
{
    if (!config.hasOwnProperty('server') && !config.hasOwnProperty('tz')) {
        throw new Error('bad config');
    }

    if (config.hasOwnProperty('server') && !_valid_domain_array(config.server)) {
        throw new Error('bad NTP server settings');
    }

    if (config.hasOwnProperty('tz') && (timezones.indexOf(config.tz[0]) === -1)) {
        throw new Error('invalid timezone');
    }
}


function _configure_network(ip4, ip6, cb)
{
    var cfg = '[Match]\nName=eth0\n';
    var network = '';
    var address = '';
    var route = '';
    var domains = [];
    var ip6dhcp = (ip6.type === 3);
    var ip4dhcp = ((ip4.type === 1) || (ip4.type === 2));

    if (!cb) {
        cb = (e) => { };
    }

    /* DHCP */
    network += 'DHCP=';

    if (ip6dhcp && ip4dhcp) {
        network += 'yes';
    } else if (ip6dhcp) {
        network += 'ipv6';
    } else if (ip4dhcp) {
        network += 'ipv4';
    } else {
        network += 'no';
    }

    network += '\n';

    /* IPv6 */
    if (ip6.type === 0) {
        /* Local link only */
        network += 'LinkLocalAddressing=ipv6\nIPv6AcceptRA=no\n';
    } else if (ip6.type === 1) {
        /* Static IP */
        if (ip6.hasOwnProperty('dns')) {
            network += (ip6.dns.map((d) => { return `DNS=${d}\n`; })).join('');
        }

        if (ip6.hasOwnProperty('address') && (ip6.address.length > 0)) {
            var i;

            for (i = 0; i < ip6.address.length; ++i) {
                address += `\n[Address]\nAddress=${ip6.address[i]}\n`;
            }
        } else {
            return cb(new Error('invalid static IP configuration'));
        }

        if (ip6.hasOwnProperty('gateway') && (ip6.gateway.length > 0)) {
            route += (ip6.gateway.map((g) => { return `\n[Route]\nGateway=${g}\n`; })).join('');
        } else {
            return cb(new Error('invalid gateway configuration'));
        }

        if (ip6.hasOwnProperty('domain') && (ip6.domain.length > 0)) {
            domains = domains.concat(ip6.domain);
        }
    } else if (ip6.type === 2) {
        /* SLAAC/NDP */
        network += 'IPv6AcceptRA=yes\n';
    } else if (ip6.type > 3) {
        return cb(new Error(`Invalid IPv6 config type ${ip6.type}`));
    }

    /* IPv4 */
    if (ip4.type === 0) {
        /* Static IP */
        if (ip4.hasOwnProperty('dns')) {
            network += (ip4.dns.map((d) => { return `DNS=${d}\n`; })).join('');
        }

        if (ip4.hasOwnProperty('address') && (ip4.address.length > 0)) {
            var i;

            if (!ip4.hasOwnProperty('netmask') || (1 > ip4.netmask.length)) {
                return cb(new Error('invalid netmask configuration'));
            }

            for (i = 0; i < ip4.address.length; ++i) {
                var maskID = i;

                if (maskID >= ip4.netmask.length) {
                    maskID = ip4.netmask.length - 1;
                }

                var cidr = _netmask_to_cidr(ip4.netmask[maskID]);

                address += `\n[Address]\nAddress=${ip4.address[i]}/${cidr}\n`;
            }
        } else {
            return cb(new Error('invalid static IP configuration'));
        }

        if (ip4.hasOwnProperty('gateway') && (ip4.gateway.length > 0)) {
            route += (ip4.gateway.map((g) => { return `\n[Route]\nGateway=${g}\n`; })).join('');
        } else {
            return cb(new Error('invalid gateway configuration'));
        }

        if (ip4.hasOwnProperty('domain') && (ip4.domain.length > 0)) {
            domains = domains.concat(ip4.domain);
        }
    } else if (ip4.type === 2) {
        if (ip4.hasOwnProperty('address') && (ip4.address.length > 0)) {
            var i;

            for (i = 0; i < ip4.address.length; ++i) {
                address += `\n[Address]\nAddress=${ip4.address[i]}\n`;
            }
        } else {
            return cb(new Error('invalid static IP configuration'));
        }
    } else if (ip4.type > 2) {
        return cb(new Error(`Invalid IPv4 config type ${ip4.type}`));
    }

    if (domains.length) {
        network += 'Domains=' + domains.join(' ') + '\n';
    }

    if (network.length) {
        cfg += '\n[Network]\n' + network;
    }

    if (address.length) {
        cfg += address;
    }

    if (route.length) {
        cfg += route;
    }

    WRITEFILEASYNC(NETWORK_FILE, cfg).then(() =>
    {
        /* All is good, merge in the new config */
        CONFIGDB.config.network.ip4 = {
            ...CONFIGDB.config.network.ip4,
            ...ip4
        };

        CONFIGDB.config.network.ip6 = {
            ...CONFIGDB.config.network.ip6,
            ...ip6
        };

        return CONFIGDB.save();
    }).then(() =>
    {
        return PROCESS('sudo', ['systemctl', 'restart', 'systemd-networkd']);
    }).then(() =>
    {
        cb();
    }).catch((e) =>
    {
        cb(e);
    });
}


function _update_ntp_servers(servers)
{
    return new Promise(function(resolve, reject)
    {
        var conf = "[Time]\nNTP=";

        if (!servers || !servers.length) {
            return reject(`bad NTP server list`);
        }

        conf += servers.join(' ');
        conf += '\n';

        WRITEFILEASYNC(NTP_FILE, conf).then(function ()
        {
            return PROCESS('sudo', ['systemctl', 'restart', 'systemd-timesyncd']);
        }).then(function()
        {
            resolve();
        }).catch(function(e)
        {
            reject(e);
        });
    });
}


function _update_tz(timezone)
{
    return PROCESS('sudo', ['timedatectl', 'set-timezone', timezone]);
}


function _configure_ntp(ntp, config, cb)
{
    var i;
    var promises = [];
    var update_tz = 0;
    var update_servers = 0;

    if (!cb) {
        cb = (e) => {};
    }

    if (config.server) {
        if (ntp.servers.length != config.server.length) {
            update_servers = 1;
        } else {
            for (i = 0; i < config.server.length; ++i) {
                if (config.server[i] !== ntp.servers[i]) {
                    update_servers = 1;
                    break;
                }
            }
        }
    }

    if (config.tz && (config.tz[0] !== ntp.timezone)) {
        config.tz = config.tz[0];
        update_tz = 1;
    }

    if (!update_tz && !update_servers) {
        return cb();
    }

    (update_servers ? _update_ntp_servers(config.server) : Promise.resolve())
    .then(function()
    {
        return (update_tz ? _update_tz(config.tz) : Promise.resolve());
    }).then(function()
    {
        ntp.timezone = config.tz;
        ntp.servers = config.server;

        return CONFIGDB.save();
    }).then(function()
    {
        cb();
    }).catch(function(e)
    {
        cb(e.message);
    });
}


/* Available routes */
ROUTER.get('/', function (req, res)
{
    res.status(200).json(CONFIGDB.config.network);
});


ROUTER.get('/:child', function (req, res)
{
    if (!req.params.child
        || !CONFIGDB.config.network.hasOwnProperty(req.params.child)
        || (typeof CONFIGDB.config.network[req.params.child] !== 'object')) {
        return res.status(400).json({ error: 'bad request' });
    }

    res.status(200).json(CONFIGDB.config.network[req.params.child]);
});


ROUTER.post('/ip4', function (req, res)
{
    try {
        var config = _req_to_ipv4_config(req);
        var ret = 200;
        var resp = { success: 'success' };

        _validate_ipv4_config(config);

        if (STATUS.busy()) {
            return res.status(400).json({ error: `switch busy with: ${STATUS.get().state}` });
        }

        STATUS.set('Updating IPv4 configuration', -1);

        _configure_network(config, CONFIGDB.config.network.ip6, (e) =>
        {
            if (e) {
                STATUS.error(e.message);
                ret = 400;
                resp = { error: e.message };
            } else {
                STATUS.clear();
            }
        });

        res.status(ret).json(resp);
    } catch (e) {
        return res.status(400).json({ error: e.message });
    }
});


ROUTER.post('/ip6', function (req, res)
{
    try {
        var config = _req_to_ipv6_config(req);
        var ret = 200;
        var resp = { success: 'success' };

        _validate_ipv6_config(config);

        if (STATUS.busy()) {
            return res.status(400).json({ error: `switch busy with: ${STATUS.get().state}` });
        }

        STATUS.set('Updating IPv6 configuration', -1);

        _configure_network(CONFIGDB.config.network.ip4, config, (e) =>
        {
            if (e) {
                STATUS.error(e.message);
                ret = 400;
                resp = { error: e.message };
            } else {
                STATUS.clear();
            }
        });

        res.status(ret).json(resp);
    } catch (e) {
        return res.status(400).json({ error: e.message });
    }
});


ROUTER.post('/ntp', function (req, res)
{
    try {
        var ret = 200;
        var resp = { success: 'success' };

        if (STATUS.busy()) {
            return res.status(400).json({ error: `switch busy with: ${STATUS.get().state}` });
        }

        var config = _req_to_config(req, [
            'server',
            'tz'
        ]);

        _validate_ntp_config(CONFIGDB.config.network.ntp.timezones, config);

        STATUS.set('Updating NTP configuration', -1);

        _configure_ntp(CONFIGDB.config.network.ntp, config, function (e)
        {
            if (e) {
                STATUS.error(e.message);
                ret = 400;
                resp = { error: e.message };
            } else {
                STATUS.clear();
            }
        });

        res.status(ret).json(resp);
    } catch (e) {
        STATUS.clear();
        return res.status(400).json({ error: e.message });
    }
});


ROUTER.post('/hostname', function(req, res)
{
    if (!req.body.hasOwnProperty('hostname') || !req.body.hostname.length || !_valid_domain_array([ req.body.hostname.trim() ])) {
        return res.status(400).json({ error: 'bad hostname' });
    }

    PROCESS('sudo', ['hostnamectl', 'set-hostname', req.body.hostname.trim()]).then(function(d)
    {
        return res.status(200).json({ status: 'ok' });
    }).catch(function(e)
    {
        return res.status(400).json({ error: `unable to set hostname ${e}` });
    });
});


ROUTER.get('/hostname', function(req, res)
{
    if (!CONFIGDB.os || !CONFIGDB.os.hostname) {
        return res.status(200).json({ hostname: CONFIGDB.os.hostname });
    }

    return res.status(500).json({ error: 'missing hostname' });
});


PROCESS('sudo', [ 'timedatectl', 'list-timezones' ])
.then(function(timezones)
{
    ERROR.clear('tz');
    CONFIGDB.config.network.ntp.timezones = timezones.trim().split("\n");
})
.catch(function(e)
{
    ERROR.set('tz', `Unable to retrieve timezones: ${e.message}`);
});

module.exports = ROUTER;
