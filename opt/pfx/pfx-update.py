#!/usr/bin/env python3

from pathlib import Path
import json
import sys
from hashlib import sha256
from collections import namedtuple
import re

SHA_PAT = re.compile(r"([0-9a-f]+)\s+(?:\*)?(.*)\n")
UPGRADE_FILE = Path(sys.argv[1]) / "pfx_upgrade.json"
CONFIGDIR = Path(sys.argv[1]) / "pfx_configs"

MODE_MODIFIABLE = 0o0664

pfx_config_tuple = namedtuple("config_files", [
    "pfx",
    "shasum",
    "json",
    ])

def fixup_old_config(config_files):
    config = json.load(config_files.json.open())

    if config["group"] != "Standard":
        return

    print(f"Making {config_files.pfx.name} deletable")

    # Modify metadata of old config
    config["protected"] = 0
    config["group"] = f"{config['group']} (VER{config['version']})"

    # Read out shasum of pfx config file
    with config_files.shasum.open("r") as f:
        shalines = f.readlines()
    for l in shalines:
        shasum, fname = SHA_PAT.match(l).groups()
        if fname.endswith(".data"):
            pfx_sha = shasum
            break
    else:
        raise Exception("Could not find shashum of config")

    # Encode metadata and calculate new sha256sum for it
    json_str = json.dumps(config, indent=4, sort_keys=True).encode("utf-8")
    json_sha = sha256(json_str).hexdigest()

    # Make files deletable
    config_files.pfx.chmod(MODE_MODIFIABLE)
    config_files.shasum.chmod(MODE_MODIFIABLE)
    config_files.json.chmod(MODE_MODIFIABLE)

    # Write new metadata
    with config_files.json.open("wb") as j:
        j.write(json_str)

    # Write new sha256sum file
    with config_files.shasum.open("w") as c:
        c.write(f"{pfx_sha} *{config_files.pfx.name}\n")
        c.write(f"{json_sha} *{config_files.json.name}\n")


def find_old_configs(upgrade_config):
    for name,upgrade in upgrade_config.items():

        new_conf = Path(CONFIGDIR / upgrade["upgrade_to"])
        if not new_conf.exists():
            raise Exception(f"{new_conf} does not exist!")

        for old in upgrade['upgrade']:

            old_conf = Path(CONFIGDIR / old)
            shasum = Path(CONFIGDIR / (old + ".sha256sum"))
            json = Path(CONFIGDIR / (old + ".json"))

            if old_conf.exists() and shasum.exists() and json.exists():
                config_files = pfx_config_tuple(old_conf,shasum,json)
                fixup_old_config(config_files)

upgrade = json.load(UPGRADE_FILE.open())
find_old_configs(upgrade)
