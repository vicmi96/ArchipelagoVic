"""ArchipelagoVic helpers: hidden Launcher components that ArchipelagoVic runs without any window.

ArchipelagoVic Logic runs Universal Tracker's logic and reports which of your checks are reachable:
    ArchipelagoLauncherDebug.exe "ArchipelagoVic Logic" -- --nogui --connect HOST:PORT --name SLOT [--password PW] [--yaml-dir DIR]
It stops when ArchipelagoVic closes its input.

ArchipelagoVic Patch makes the playable game from a patch file (see patcher.py):
    ArchipelagoLauncherDebug.exe "ArchipelagoVic Patch" -- [--inspect] [--rom BASE_ROM] PATCH_FILE

Both write lines that start with "APVIC " to their output (one JSON object per line).
"""
from worlds.LauncherComponents import Component, components, Type

BRIDGE_VERSION = 2


def launch(*args):
    from .bridge import run
    run(list(args))


def launch_patch(*args):
    from .patcher import run
    run(list(args))


components.append(Component("ArchipelagoVic Logic", func=launch, component_type=Type.HIDDEN))
components.append(Component("ArchipelagoVic Patch", func=launch_patch, component_type=Type.HIDDEN))
