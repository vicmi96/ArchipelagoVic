"""ArchipelagoVic Logic: a hidden Launcher component that runs Universal Tracker's
logic without its window and reports which of your checks are reachable.

ArchipelagoVic starts it as
    ArchipelagoLauncherDebug.exe "ArchipelagoVic Logic" -- --nogui --connect HOST:PORT --name SLOT [--password PW] [--yaml-dir DIR]
and reads lines that start with "APVIC " from its output (one JSON object per line).
It stops when ArchipelagoVic closes its input.
"""
from worlds.LauncherComponents import Component, components, Type

BRIDGE_VERSION = 1


def launch(*args):
    from .bridge import run
    run(list(args))


components.append(Component("ArchipelagoVic Logic", func=launch, component_type=Type.HIDDEN))
