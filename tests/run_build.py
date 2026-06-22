#!/usr/bin/env python3
"""Run the playable BUILD's behaviour tests (the subset that ships in the public
mirror — no /design dependency).

  python tests/run_build.py

Covers: the P1 text instrument, the visual map mode, town + the two forks, and a
real-keypress end-to-end playthrough of engine/play-map.html.
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SUITES = [
    ("P1 text instrument", "run.py"),
    ("visual map mode", "run_map.py"),
    ("town + forks + signals", "run_game.py"),
    ("UI quality-of-life", "run_ui.py"),
    ("game-feel layer (TD_FEEL)", "run_feel.py"),
    ("LIVE juice integration (feel fires in play)", "run_juice.py"),
    ("pure resolution core — combat + smash-grab (TD_RESOLVE)", "run_resolve.py"),
    ("balance sim — per-policy distribution + determinism (tests/sim.js)", "run_sim.py"),
    ("harvest interest-pass — live generator hard rules + metric bands", "run_harvest.py"),
    ("ten-stat spine — feel-words, Lucky bounds, derived registry (TD_STATS)", "run_stats.py"),
    ("two-function combat — hit/damage/read, gap-scale, Lucky (TD_RESOLVE)", "run_combat.py"),
    ("burden + coin-weight — bands, carry cap, coins 25/lb (TD_BURDEN)", "run_burden.py"),
    ("Smash-and-Grab §24 fun-test (TD_SMASHGRAB)", "run_smashgrab.py"),
    ("procedural SFX stub hooks (TD_SFX)", "run_sfx.py"),
    ("town composition law (TD_TOWN)", "run_towncompose.py"),
    ("procedural TOWN generator + law-suite", "run_towngen.py"),
    ("FIXED authored town map + randomized tenants", "run_townmap.py"),
    ("E2E real keypresses on play-map.html", "run_keys.py"),
    ("FRONT-DOOR smoke: boot -> create -> ticket -> descend", "run_smoke.py"),
    ("bestiary — 200+ foes via families/variants (TD_BESTIARY)", "run_bestiary.py"),
    ("status engine — poison/bleed/fear/regen (TD_STATUS)", "run_status.py"),
    # Master Directive — the gate is independently verifiable on the mirror now:
    ("vault format + parser (P1)", "run_vaultfmt.py"),
    ("spatial law-suite / THE GATE (P3)", "run_lawsuite.py"),
    ("VAULT WIRE-IN (rooms are authored vaults)", "run_vaultwire.py"),
    ("vault assembler, gated (P2/P4)", "run_assembler.py"),
    ("STANDARD drift bands + type params", "run_drift.py"),
    ("dungeon legibility (clean floors / speckle)", "run_legibility.py"),
    ("LIVE-PLAY WALK (both generators live, spawn->descend)", "walk_liveplay.py"),
]


def main():
    failed = []
    for title, fname in SUITES:
        print("=" * 60)
        print("# " + title + "  (" + fname + ")")
        print("=" * 60)
        if subprocess.run([sys.executable, os.path.join(HERE, fname)]).returncode != 0:
            failed.append(title)
        print("")
    print("=" * 60)
    if failed:
        print("OVERALL: FAILED -> " + ", ".join(failed))
        return 1
    print("OVERALL: ALL BUILD SUITES PASSED ({} suites)".format(len(SUITES)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
