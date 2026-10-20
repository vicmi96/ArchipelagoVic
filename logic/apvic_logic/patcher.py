"""ArchipelagoVic Patch: makes the playable game from an Archipelago patch file (.apred, .apblue…)
with no window and no file picker.

ArchipelagoVic starts it as
    ArchipelagoLauncherDebug.exe "ArchipelagoVic Patch" -- [--inspect] [--rom BASE_ROM] PATCH_FILE
and reads one line that starts with "APVIC " from its output:
    {"type": "inspect", ...}  what the patch needs (game, expected base ROM hash, host.yaml key…)
    {"type": "patched", ...}  the patched game was written to "output"
    {"type": "error", "code": ..., "text": ...}

--rom uses that base ROM for this run only. Without it, the ROM set in host.yaml is used.
host.yaml is never rewritten by this helper.
"""
import argparse
import hashlib
import os
import traceback

from .bridge import emit


def _md5(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def _hashes(cls):
    """The base ROM hashes a ROM setting accepts, as lower-case hex."""
    out = []
    for v in getattr(cls, "md5s", None) or []:
        out.append(v.hex() if isinstance(v, bytes) else str(v).lower())
    return out


def _rom_setting(game, expected):
    """Find the host.yaml setting that holds this game's base ROM: the file setting whose accepted
    hashes include the patch's. Returns (section, key, group, current value) or None."""
    import settings
    from worlds.AutoWorld import AutoWorldRegister
    world = AutoWorldRegister.world_types.get(game)
    if world is None or not getattr(world, "settings_key", None):
        return None
    group = getattr(settings.get_settings(), world.settings_key, None)
    if group is None:
        return None
    first_file = None
    for key in type(group).__annotations__:
        if key.startswith("_"):
            continue
        try:
            value = object.__getattribute__(group, key)  # plain read: no file picker, no hash check
        except AttributeError:
            continue
        if not isinstance(value, settings.FilePath):
            continue
        if expected and expected in _hashes(type(value)):
            return world.settings_key, key, group, value
        first_file = first_file or (world.settings_key, key, group, value)
    return None if expected else first_file


def run(argv):
    import settings
    settings.no_gui = True          # a missing base ROM becomes an error, never a file picker
    settings.skip_autosave = True   # never rewrite host.yaml when this helper exits

    parser = argparse.ArgumentParser(prog="ArchipelagoVic Patch")
    parser.add_argument("patch_file")
    parser.add_argument("--inspect", action="store_true")
    parser.add_argument("--rom", default=None)
    args, _unknown = parser.parse_known_args(argv)
    try:
        _run(args)
    except Exception as e:
        emit("error", code="crash", text=f"{type(e).__name__}: {e}", details=traceback.format_exc()[-3000:])


def _run(args):
    from worlds.Files import AutoPatchRegister

    patch_file = os.path.abspath(args.patch_file)
    if not os.path.isfile(patch_file):
        emit("error", code="patch-missing", text=f"The patch file {patch_file} doesn't exist.")
        return
    handler_cls = AutoPatchRegister.get_handler(patch_file)
    if handler_cls is None:
        emit("error", code="no-handler",
             text=f"No game in your Archipelago install makes {os.path.splitext(patch_file)[1]} patch files. "
                  "Install the game's .apworld first.")
        return

    handler = handler_cls(patch_file)
    handler.read()
    expected = (getattr(handler_cls, "hash", None) or "").lower() or None
    output = os.path.splitext(patch_file)[0] + handler.result_file_ending
    found = _rom_setting(handler.game, expected)
    info = dict(game=handler.game, patchEnding=handler_cls.patch_file_ending, resultEnding=handler.result_file_ending,
                expectedHash=expected, output=output, server=getattr(handler, "server", "") or "",
                player=getattr(handler, "player", None), playerName=getattr(handler, "player_name", "") or "",
                romSection=found[0] if found else None, romKey=found[1] if found else None,
                romSetting=found[3].resolve() if found else None)

    if args.inspect:
        emit("inspect", **info)
        return
    if not found:
        emit("error", code="no-rom-setting", text=f"Couldn't find where {handler.game} keeps its base ROM in host.yaml.", **info)
        return
    section, key, group, value = found

    rom = os.path.abspath(args.rom) if args.rom else value.resolve()
    if not os.path.isfile(rom):
        emit("error", code="rom-missing", text=f"The original ROM {rom} doesn't exist.", rom=rom, **info)
        return
    actual = _md5(rom)
    if expected and actual != expected:
        emit("error", code="hash-mismatch", text=f"{os.path.basename(rom)} isn't the ROM {handler.game} needs.",
             rom=rom, actualHash=actual, **info)
        return
    if args.rom:
        setattr(group, key, type(value)(rom))   # this run only (autosave is off)

    import Patch
    meta, written = Patch.create_rom_file(patch_file)
    emit("patched", rom=rom, written=os.path.abspath(written), size=os.path.getsize(written),
         **{**info, "server": meta.get("server") or "", "playerName": meta.get("player_name") or ""})
