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
    ("E2E real keypresses on play-map.html", "run_keys.py"),
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
