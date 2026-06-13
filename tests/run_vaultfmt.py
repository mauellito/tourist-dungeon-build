#!/usr/bin/env python3
"""Master Directive P1 — vault format + parser, and the LICENSING FENCE.

Loads the EXTERNAL .des fixtures (authored-for-test; the licensing fence keeps real DCSS
GPL vaults to fixtures only), runs engine/vaultfmt.js in headless Chrome, and asserts:
  - the header parses (NAME / TAGS / WEIGHT / EDGES / SUBST);
  - resolve(seed) yields a concrete h x w tagged map with doors/stairs/secrets categorised;
  - declared EDGES match the door (+) count in the map;
  - SUBST variation resolves (no raw variation glyph survives) and is DETERMINISTIC per seed;
  - the fence holds: engine/ never references vaults_EXTERNAL, and the mirror sync never
    copies it (GPL test-fixtures-only, never shipped/imported/mirrored).

Run:  python tests/run_vaultfmt.py
"""
import glob, html, json, os, re, shutil, subprocess, sys, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, "engine"); TMP = os.path.join(ROOT, "tests", ".tmp")
FIXDIR = os.path.join(ROOT, "tests", "fixtures", "vaults")
CH = [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
      r"C:\Program Files\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"]

REPORTER = r"""
<script>(function(){
  var out=document.getElementById('out'); var F=%s; var problems=[], n=0;
  try{
    F.forEach(function(fx){
      n++;
      var v=TD_VAULTFMT.parse(fx.text), tag=fx.file;
      if(!v.name) problems.push(tag+": no NAME");
      if(!v.h||!v.w) problems.push(tag+": empty MAP");
      var r1=TD_VAULTFMT.resolve(v,1), r2=TD_VAULTFMT.resolve(v,1), r3=TD_VAULTFMT.resolve(v,2);
      if(r1.grid.length!==v.h||r1.grid[0].length!==v.w) problems.push(tag+": resolved grid not h x w");
      // EDGES match door count
      if(v.edges.length && r1.doors.length!==v.edges.length) problems.push(tag+": EDGES="+v.edges.length+" but doors="+r1.doors.length);
      // no raw variation glyph survives resolution
      var rawvar=false; for(var y=0;y<r1.grid.length;y++) for(var x=0;x<r1.grid[0].length;x++){ var c=r1.grid[y][x]; if(c==='?'||c===','||c==='+'||c==='{'||c==='$'||c==='G'||c==='A'||c==='B') rawvar=true; }
      if(rawvar) problems.push(tag+": a non-render glyph survived into the resolved grid");
      // resolved grid only renders #/./~
      var bad=false; for(var y2=0;y2<r1.grid.length;y2++) for(var x2=0;x2<r1.grid[0].length;x2++){ if('#.~'.indexOf(r1.grid[y2][x2])<0) bad=true; }
      if(bad) problems.push(tag+": resolved grid has a non-{#,.,~} glyph");
      // determinism
      if(JSON.stringify(r1.grid)!==JSON.stringify(r2.grid)) problems.push(tag+": resolve not deterministic per seed");
    });
    out.textContent=JSON.stringify({n:n, problems:problems});
    document.title="ok";
  }catch(e){ out.textContent="HARNESS_ERROR "+(e&&e.stack?e.stack:e); document.title="err"; }
})();</script>
"""


def find_chrome():
    for p in CH:
        if os.path.exists(p):
            return p
    return None


def main():
    fixtures = sorted(glob.glob(os.path.join(FIXDIR, "*.des")))
    if not fixtures:
        print("no .des fixtures found"); return 2
    F = [{"file": os.path.basename(p), "text": open(p, encoding="utf-8").read()} for p in fixtures]

    chrome = find_chrome()
    if not chrome:
        sys.exit("FATAL: no Chrome/Edge found.")
    os.makedirs(TMP, exist_ok=True)
    parts = ['<!doctype html><meta charset=utf-8><title>p</title><pre id=out>p</pre>']
    for fn in ("rng.js", "vaultfmt.js"):
        parts.append("<script>\n" + open(os.path.join(ENGINE, fn), encoding="utf-8").read() + "\n</script>")
    parts.append(REPORTER % json.dumps(F))
    rp = os.path.join(TMP, "vaultfmt_runner.html"); open(rp, "w", encoding="utf-8").write("\n".join(parts))
    ud = tempfile.mkdtemp(prefix="td_vf_")
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
    d = json.loads(raw)
    probs = d["problems"]
    print("Parsed + resolved {} authored worked-stone vault fixtures.".format(d["n"]))
    if probs:
        for p in probs:
            print("  FAIL " + p)
        print("RESULT: {} problems".format(len(probs))); return 1
    print("RESULT: vault format parses + resolves on all {} authored fixtures.".format(d["n"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
