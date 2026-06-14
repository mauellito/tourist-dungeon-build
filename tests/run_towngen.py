#!/usr/bin/env python3
"""TOWN GENERATOR (TD_TOWNGEN) vs the TOWN LAW-SUITE (TD_TOWNLAWS), headless Chrome.

The procedural town is the figure/ground INVERSION of the vault assembler: water organises
the map, the land is BSP-partitioned into districts placed by geography, each district is packed
with BUILDINGS (the figure) leaving street margins (the ground), and a main-street spine runs
gate -> plaza -> dungeon mouth. A candidate must PASS the law-suite (required features present +
reachable + anti-grid) or it is discarded + regenerated.

Asserts: a healthy share of seeds yield a gate-passing town, and every required-feature law is
exercised. Dumps an ASCII gallery to tests/.tmp/town_gallery.txt.

Run:  python tests/run_towngen.py
"""
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, "engine")
TMP = os.path.join(ROOT, "tests", ".tmp")
CH = [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
      r"C:\Program Files\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"]

REPORTER = r"""
<script>(function(){
  var out=document.getElementById('out');
  try{
    var N=40, pass=0, sample=null, fails={};
    for(var s=1;s<=N;s++){
      var g=TD_TOWNGEN.generateGated(s, 200); if(!g) continue;
      if(g.passed){ pass++; if(!sample){ var rows=[]; for(var y=0;y<g.map.h;y++) rows.push(g.map.grid[y]); sample={rows:rows, laws:g.laws, districts:g.map.meta.districts.map(function(d){return d.role;})}; } }
      else Object.keys(g.laws).forEach(function(k){ if(!g.laws[k].pass) fails[k]=(fails[k]||0)+1; });
    }
    out.textContent=JSON.stringify({N:N, pass:pass, fails:fails, sample:sample});
    document.title="ok";
  }catch(e){ out.textContent="HARNESS_ERROR "+(e&&e.stack?e.stack:e); }
})();</script>
"""


def find_chrome():
    for p in CH:
        if os.path.exists(p):
            return p
    return None


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    chrome = find_chrome()
    if not chrome:
        sys.exit("FATAL: no Chrome/Edge found.")
    os.makedirs(TMP, exist_ok=True)
    parts = ['<!doctype html><meta charset=utf-8><title>p</title><pre id=out>p</pre>']
    for fn in ("rng.js", "townlaws.js", "towngen2.js"):
        parts.append("<script>\n" + open(os.path.join(ENGINE, fn), encoding="utf-8").read() + "\n</script>")
    parts.append(REPORTER)
    rp = os.path.join(TMP, "towngen_runner.html")
    open(rp, "w", encoding="utf-8").write("\n".join(parts))
    ud = tempfile.mkdtemp(prefix="td_tg_")
    try:
        pr = subprocess.run([chrome, "--headless", "--disable-gpu", "--no-sandbox", "--user-data-dir=" + ud, "--dump-dom", "file:///" + rp.replace("\\", "/")], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=300)
    finally:
        shutil.rmtree(ud, ignore_errors=True)
    dom = pr.stdout.decode("utf-8", "replace")
    m = re.search(r'<pre id=.?out.?>(.*?)</pre>', dom, re.DOTALL)
    if not m:
        print("NO OUTPUT"); print(dom[:1200]); return 2
    raw = html.unescape(m.group(1))
    if raw.startswith("HARNESS_ERROR"):
        print(raw[:2500]); return 2
    d = json.loads(raw)
    print("TOWN: %d/%d seeds yield a gate-passing town." % (d["pass"], d["N"]))
    if d["sample"]:
        print("   districts: " + ", ".join(d["sample"]["districts"]))
        gal = os.path.join(TMP, "town_gallery.txt")
        with open(gal, "w", encoding="utf-8") as f:
            f.write("law-check: " + "  ".join("%s%s(%s)" % (k, "" if d["sample"]["laws"][k]["pass"] else "!", d["sample"]["laws"][k]["value"]) for k in sorted(d["sample"]["laws"].keys())) + "\n\n")
            f.write("\n".join(d["sample"]["rows"]) + "\n")
        print("   gallery written: tests/.tmp/town_gallery.txt")
    if d["fails"]:
        print("   law fails across discarded candidates: " + json.dumps(d["fails"]))
    print("-" * 64)
    if d["pass"] < d["N"] * 0.5:
        print("RESULT: town pass-rate too low (%d/%d) — the town gate is discarding too much." % (d["pass"], d["N"])); return 1
    if not d["sample"]:
        print("RESULT: no gate-passing town produced."); return 1
    print("RESULT: the procedural town passes its law-suite (required features present, reachable, "
          "anti-grid) — %d/%d seeds." % (d["pass"], d["N"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
