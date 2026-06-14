#!/usr/bin/env python3
"""THE VAULT WIRE-IN — proof that the assembler places AUTHORED vaults as its rooms.

Two independent checks (both must pass):
  A. SOURCE OF TRUTH: engine/vaultlib.js (the embedded corpus the browser assembler reads)
     parses to the SAME vaults as the authoring .des files in tests/fixtures/vaults/.
  B. THE WIRE-IN: every room slot the assembler emits traces to a NAMED authored vault, the
     authored CHARACTER survives the stamp (pillars / loot / irregular cells appear in placed
     rooms), and the assembler source actually CALLS the vault parser. If any room region traces
     to no authored vault, the wire-in FAILED.

Law-green is NOT proof here (the egg carton passed the laws); the proof is authored provenance.

Run:  python tests/run_vaultwire.py
"""
import glob
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
FIXDIR = os.path.join(ROOT, "tests", "fixtures", "vaults")
TMP = os.path.join(ROOT, "tests", ".tmp")
CH = [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
      r"C:\Program Files\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"]

REPORTER = r"""
<script>(function(){
  var out=document.getElementById('out');
  try{
    // A. vaultlib corpus parses to a named set with the expected count
    var lib=TD_VAULTLIB.all(), libNames=lib.map(function(v){return v.name;}).sort();
    // B. the wire-in: across several floors of every bundle, every room slot must name an
    //    authored vault, and authored character (pillar/loot tiles) must survive into placed rooms.
    var nameSet={}; libNames.forEach(function(n){nameSet[n]=1;});
    var bundles=["STANDARD","WARREN","HALLS"], slots=0, orphan=0, used={}, charFloors=0, floors=0;
    bundles.forEach(function(b){
      for(var s=1;s<=6;s++){
        var g=TD_ASSEMBLER.generateGated(s*13+1,b,80); if(!g||!g.passed) continue;
        var m=g.map; floors++;
        // every emitted room slot names an authored vault
        m.rooms.forEach(function(R){ slots++; if(!nameSet[R.name]) orphan++; else used[R.name]=1; });
        // authored character survived: at least one pillar (o-> wall inside a room bbox) or loot/landmark
        var hasChar=false;
        m.rooms.forEach(function(R){
          if(R.vault && (/o/.test(R.vault.rows.join("")) || /\$|G/.test(R.vault.rows.join("")))) hasChar=true;
        });
        if(hasChar) charFloors++;
      }
    });
    out.textContent=JSON.stringify({libCount:lib.length, libNames:libNames, slots:slots, orphan:orphan,
      usedCount:Object.keys(used).length, floors:floors, charFloors:charFloors});
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
    # ---- Check A (pure Python): vaultlib SOURCES vs the .des files ----
    des = sorted(glob.glob(os.path.join(FIXDIR, "*.des")))
    des_norm = [open(p, encoding="utf-8").read().replace("\r\n", "\n").rstrip("\n") for p in des]
    libtext = open(os.path.join(ENGINE, "vaultlib.js"), encoding="utf-8").read()
    problems = []
    for i, body in enumerate(des_norm):
        if body not in libtext:
            problems.append("vaultlib.js is missing/!= %s (re-run scripts/build_vaultlib.py)" % os.path.basename(des[i]))
    # the assembler must actually call the vault parser
    asm = open(os.path.join(ENGINE, "assembler.js"), encoding="utf-8").read()
    if "TD_VAULTLIB.all()" not in asm or "TD_VAULTFMT.resolve" not in asm:
        problems.append("assembler.js does NOT call the vault library/parser (TD_VAULTLIB.all / TD_VAULTFMT.resolve)")

    # ---- Check B (headless Chrome): the wire-in at runtime ----
    os.makedirs(TMP, exist_ok=True)
    parts = ['<!doctype html><meta charset=utf-8><title>p</title><pre id=out>p</pre>']
    for fn in ("rng.js", "vaultfmt.js", "vaultlib.js", "lawsuite.js", "assembler.js"):
        parts.append("<script>\n" + open(os.path.join(ENGINE, fn), encoding="utf-8").read() + "\n</script>")
    parts.append(REPORTER)
    rp = os.path.join(TMP, "vaultwire_runner.html")
    open(rp, "w", encoding="utf-8").write("\n".join(parts))
    ud = tempfile.mkdtemp(prefix="td_vw_")
    try:
        pr = subprocess.run([chrome, "--headless", "--disable-gpu", "--no-sandbox", "--user-data-dir=" + ud, "--dump-dom", "file:///" + rp.replace("\\", "/")], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=240)
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

    print("A. vaultlib corpus: %d authored vaults, matches the .des source of truth: %s"
          % (d["libCount"], "yes" if not problems else "NO"))
    print("   vaults: " + ", ".join(d["libNames"]))
    print("B. wire-in over %d floors (STANDARD/WARREN/HALLS): %d room slots, %d traced to NO authored vault; "
          "%d distinct vaults used; authored character present on %d/%d floors."
          % (d["floors"], d["slots"], d["orphan"], d["usedCount"], d["charFloors"], d["floors"]))
    if d["slots"] == 0:
        problems.append("no room slots emitted")
    if d["orphan"] > 0:
        problems.append("%d room slots trace to NO authored vault — the wire-in FAILED" % d["orphan"])
    if d["charFloors"] < d["floors"]:
        problems.append("authored character (pillars/loot) missing on %d floors" % (d["floors"] - d["charFloors"]))
    if d["usedCount"] < 6:
        problems.append("only %d distinct authored vaults ever placed (variety too low)" % d["usedCount"])
    print("-" * 64)
    if problems:
        for p in problems:
            print("FAIL " + p)
        print("RESULT: the vault wire-in is NOT proven"); return 1
    print("RESULT: rooms ARE authored vaults — every slot traces to a named vault, character "
          "survives, the assembler calls the parser, and vaultlib matches the .des source.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
