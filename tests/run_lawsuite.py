#!/usr/bin/env python3
"""Master Directive P3 — THE GATE (dungeon spatial law-suite) validation.

Feeds engine/lawsuite.js hand-built CANDIDATE maps and asserts it CATCHES the violations
(failures are shown with numbers, never hidden) and PASSES a clean one — so the assembler
(P2) has a trustworthy gate to discard+regenerate against.

Run:  python tests/run_lawsuite.py
"""
import html, json, os, re, shutil, subprocess, sys, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, "engine"); TMP = os.path.join(ROOT, "tests", ".tmp")
CH = [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
      r"C:\Program Files\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"]


def blank(w, h):
    return {"w": w, "h": h, "grid": [["#"] * w for _ in range(h)], "tag": [["wall"] * w for _ in range(h)]}


def carve(m, x, y, g="."):
    m["grid"][y][x] = g


def settag(m, x, y, t):
    m["tag"][y][x] = t


def open_blob():
    m = blank(30, 20)
    for y in range(1, 19):
        for x in range(1, 29):
            carve(m, x, y); settag(m, x, y, "room")   # one giant open room: too open
    return m


def solid_rock():
    m = blank(30, 20)
    for y in range(9, 12):
        for x in range(14, 17):
            carve(m, x, y); settag(m, x, y, "room")    # a tiny pocket: too little walkable + huge wall
    return m


def decent():
    # a corridor spine with two rooms hung off it via doors, thin walls — a small clean map.
    m = blank(21, 11)
    for x in range(2, 19):                              # horizontal corridor at y=5
        carve(m, x, 5); settag(m, x, 5, "corridor")
    # room A (top-left) via a door at (4,4)
    for y in range(1, 4):
        for x in range(2, 8):
            carve(m, x, y); settag(m, x, y, "room")
    carve(m, 4, 4); settag(m, 4, 4, "door")
    settag(m, 3, 1, "feature")                          # a feature so the room reads
    # room B (bottom-right) via a door at (15,6)
    for y in range(7, 10):
        for x in range(13, 19):
            carve(m, x, y); settag(m, x, y, "room")
    carve(m, 15, 6); settag(m, 15, 6, "door")
    settag(m, 17, 9, "loot")
    m["entry"] = {"x": 2, "y": 5}
    return m


CASES = [
    {"name": "open-blob", "map": open_blob(), "mustFail": ["L2", "L3"]},
    {"name": "solid-rock", "map": solid_rock(), "mustFail": ["L1", "L3"]},
    {"name": "decent", "map": decent(), "mustPass": ["L4", "L5", "L6", "L7", "D1"]},
]

REPORTER = r"""
<script>(function(){
  var out=document.getElementById('out'); var CASES=%s; var rows=[];
  try{
    CASES.forEach(function(c){ var r=TD_LAWS.check(c.map); rows.push({name:c.name, pass:r.pass, laws:r.laws, mustFail:c.mustFail||[], mustPass:c.mustPass||[]}); });
    out.textContent=JSON.stringify(rows); document.title="ok";
  }catch(e){ out.textContent="HARNESS_ERROR "+(e&&e.stack?e.stack:e); document.title="err"; }
})();</script>
"""


def find_chrome():
    for p in CH:
        if os.path.exists(p):
            return p
    return None


def main():
    chrome = find_chrome()
    if not chrome:
        sys.exit("FATAL: no Chrome/Edge found.")
    os.makedirs(TMP, exist_ok=True)
    parts = ['<!doctype html><meta charset=utf-8><title>p</title><pre id=out>p</pre>',
             "<script>\n" + open(os.path.join(ENGINE, "lawsuite.js"), encoding="utf-8").read() + "\n</script>",
             REPORTER % json.dumps(CASES)]
    rp = os.path.join(TMP, "lawsuite_runner.html"); open(rp, "w", encoding="utf-8").write("\n".join(parts))
    ud = tempfile.mkdtemp(prefix="td_ls_")
    try:
        pr = subprocess.run([chrome, "--headless", "--disable-gpu", "--no-sandbox", "--user-data-dir=" + ud, "--dump-dom", "file:///" + rp.replace("\\", "/")], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=120)
    finally:
        shutil.rmtree(ud, ignore_errors=True)
    dom = pr.stdout.decode("utf-8", "replace")
    m = re.search(r'<pre id=.?out.?>(.*?)</pre>', dom, re.DOTALL)
    if not m:
        print("NO OUTPUT"); print(dom[:1200]); return 2
    raw = html.unescape(m.group(1))
    if raw.startswith("HARNESS_ERROR"):
        print(raw[:2000]); return 2
    rows = json.loads(raw)
    fails = []
    for r in rows:
        laws = r["laws"]
        line = " ".join(["%s%s" % (k, "" if laws[k]["pass"] else "!") for k in sorted(laws.keys())])
        print("  {:<12} {}".format(r["name"], line))
        for L in r["mustFail"]:
            if laws.get(L, {}).get("pass", True):
                fails.append("%s: expected %s to FAIL (gate must catch it), but it passed [%s]" % (r["name"], L, laws.get(L, {}).get("value")))
        for L in r["mustPass"]:
            if not laws.get(L, {}).get("pass", False):
                fails.append("%s: expected %s to PASS, but it failed [%s]" % (r["name"], L, laws.get(L, {}).get("value")))
    print("-" * 60)
    if fails:
        for f in fails:
            print("FAIL " + f)
        print("RESULT: gate validation FAILED ({} problems)".format(len(fails))); return 1
    print("RESULT: the GATE correctly catches violations and passes a clean map (law numbers shown).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
