import argparse
import asyncio
import json
import logging
import sys
import threading
import traceback

_out = sys.__stdout__ or sys.stdout


def emit(kind, **data):
    """One line per message so ArchipelagoVic can read it as it arrives."""
    try:
        _out.write("APVIC " + json.dumps({"type": kind, **data}) + "\n")
        _out.flush()
    except Exception:
        pass


class _ErrorsToApp(logging.Handler):
    def emit(self, record):
        if record.levelno >= logging.ERROR:
            msg = record.getMessage()
            if msg and "In logic locations" not in msg:
                emit("log", level=record.levelname.lower(), text=msg[:2000])


def run(argv):
    parser = argparse.ArgumentParser(prog="ArchipelagoVic Logic")
    parser.add_argument("--connect", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--password", default=None)
    parser.add_argument("--yaml-dir", default=None)
    parser.add_argument("--nogui", action="store_true")
    args, _unknown = parser.parse_known_args(argv)
    try:
        from worlds.tracker.TrackerClient import TrackerGameContext  # Universal Tracker
    except Exception as e:  # not installed, or too old/new for this Archipelago
        emit("error", code="ut-missing", text=f"Universal Tracker isn't installed or couldn't load: {e}")
        return
    try:
        asyncio.run(_main(args, TrackerGameContext))
    except Exception:
        emit("error", code="crash", text=traceback.format_exc()[-3000:])


async def _main(args, TrackerGameContext):
    from CommonClient import server_loop
    from worlds.tracker.TrackerCore import TrackerLogLineGroup

    logging.getLogger("Client").addHandler(_ErrorsToApp())
    ctx = TrackerGameContext(args.connect, args.password)
    ctx.auth = args.name
    if args.yaml_dir:
        ctx.tracker_core.player_folder_override = args.yaml_dir

    problem_groups = {TrackerLogLineGroup.UT_ERROR, TrackerLogLineGroup.UT_STATUS}
    original_update = ctx.updateTracker

    def update_and_report():
        result = original_update()
        core = ctx.tracker_core
        notes = [line.location_label for group in core.log_lines.values() for line in group if line.group in problem_groups]
        emit("logic",
             slot=ctx.slot,
             game=core.game,
             inLogic=sorted(int(a) for a in (core.locations_available or [])),
             glitched=sorted(int(a) for a in (core.glitched_locations or [])),
             disabled=bool(core.tracker_disabled),
             ready=core.multiworld is not None and core.player_id is not None,
             notes=notes[:20],
             genError=(core.gen_error or "")[-1500:])
        return result

    ctx.updateTracker = update_and_report

    # When the world can't be built (no YAML, world not installed…) Universal Tracker just logs it and
    # never sends an update, so report the failure ourselves right after connecting.
    original_on_package = ctx.on_package

    def on_package(cmd, args):
        original_on_package(cmd, args)
        if cmd == "Connected":
            core = ctx.tracker_core
            if core.multiworld is None or core.player_id is None or core.tracker_disabled:
                try:
                    update_and_report()
                except Exception:
                    emit("error", code="update", text=traceback.format_exc()[-2000:])

    ctx.on_package = on_package

    loop = asyncio.get_running_loop()

    def watch_input():
        # ArchipelagoVic closes our input to stop us; "refresh" asks for a new report.
        for line in sys.stdin:
            cmd = line.strip()
            if cmd == "refresh":
                loop.call_soon_threadsafe(lambda: ctx.watcher_event.set())
            elif cmd == "quit":
                break
        loop.call_soon_threadsafe(ctx.exit_event.set)

    if sys.stdin:
        threading.Thread(target=watch_input, daemon=True).start()

    emit("status", stage="generating", text="Building your world's logic…")
    # Same order as Universal Tracker: the server task only starts running once generation is done,
    # so the Connected packet never arrives before the world exists.
    ctx.server_task = asyncio.create_task(server_loop(ctx), name="server loop")
    ctx.run_generator()
    emit("status", stage="connecting", text="Connecting…")
    await ctx.exit_event.wait()
    await ctx.shutdown()
