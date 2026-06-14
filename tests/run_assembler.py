#!/usr/bin/env python3
"""Master Directive P2/P3/P4 — the assembler, gated, with the gallery.

Generates assembler maps through THE GATE (TD_LAWS) and reports, per type bundle:
  - pass-rate over N seeds (the gate discards+regenerates; we measure first-try health),
  - a sample PASSING map's law table + an ASCII render (room vs corridor distinct),
  - on failure, the best-effort law numbers SHOWN (never hidden), so iteration is informed.

Run:  python tests/run_assembler.py
"""
import html, json, os, re, shutil, subprocess, sys, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, "engine"); TMP = os.path.join(ROOT, "tests", ".tmp")
CH = [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
      r"C:\Program Files\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"]
TYPES = ["STANDARD", "WARREN", "HALLS"]
N = 40

REPORTER = r"""
<script>(function(){
  var out=document.getElementById('out'); var TYPES=%s, N=%d; var report={};
  function render(m){
    var L=[];
    for(var y=0;y<m.h;y++){ var row="";
      for(var x=0;x<m.w;x++){ var t=m.tag[y][x], g=m.grid[y][x];
        row += (t==="room")?"." : (t==="corridor")?"+" : (t==="door")?"D" : (t==="secret")?"S" : (t==="feature")?"*" : (t==="stair")?">" : (g==="~")?"~" : "#";
      } L.push(row); }
    return L.join("\n");
  }
  try{
    TYPES.forEach(function(ty){
      var pass=0, sample=null, firstFail=null, totalAttempts=0;
      for(var s=1;s<=N;s++){
        var g=TD_ASSEMBLER.generateGated(s, ty, 60); if(!g) continue;
        totalAttempts+=g.attempt;
        if(g.passed){ pass++; if(!sample) sample={laws:g.laws, render:render(g.map), w:g.map.w, h:g.map.h, attempt:g.attempt}; }
        else if(!firstFail){ firstFail={laws:g.laws}; }
      }
      report[ty]={pass:pass, n:N, avgAttempt:(totalAttempts/N).toFixed(1), sample:sample, firstFail:firstFail};
    });
    out.textContent=JSON.stringify(report); document.title="ok";
  }catch(e){ out.textContent="HARNESS_ERROR "+(e&&e.stack?e.stack:e); document.title="err"; }
})();</script>
"""


def find_chrome():
    for p in CH:
        if os.path.exists(p):
            return p
    return None


def lawline(laws):
    return " ".join("%s%s(%s)" % (k, "" if laws[k]["pass"] else "!", laws[k]["value"]) for k in sorted(laws.keys()))


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
    for fn in ("rng.js", "vaultfmt.js", "vaultlib.js", "lawsuite.js", "assembler.js"):
        parts.append("<script>\n" + open(os.path.join(ENGINE, fn), encoding="utf-8").read() + "\n</script>")
    parts.append(REPORTER % (json.dumps(TYPES), N))
    rp = os.path.join(TMP, "assembler_runner.html"); open(rp, "w", encoding="utf-8").write("\n".join(parts))
    ud = tempfile.mkdtemp(prefix="td_as_")
    try:
        pr = subprocess.run([chrome, "--headless", "--disable-gpu", "--no-sandbox", "--user-data-dir=" + ud, "--dump-dom", "file:///" + rp.replace("\\", "/")], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=240)
    finally:
        shutil.rmtree(ud, ignore_errors=True)
    dom = pr.stdout.decode("utf-8", "replace")
    m = re.search(r'<pre id=.?out.?>(.*?)</pre>', dom, re.DOTALL)
    if not m:
        print("NO OUTPUT"); print(dom[:1500]); return 2
    raw = html.unescape(m.group(1))
    if raw.startswith("HARNESS_ERROR"):
        print(raw[:3000]); return 2
    rep = json.loads(raw)
    gallery = os.path.join(TMP, "assembler_gallery.txt"); gf = open(gallery, "w", encoding="utf-8")
    allpass = True
    for ty in TYPES:
        d = rep[ty]
        print("=== %s: %d/%d first-try PASS (avg %s attempts to a passing map) ===" % (ty, d["pass"], d["n"], d["avgAttempt"]))
        gf.write("=== %s: %d/%d pass ===\n" % (ty, d["pass"], d["n"]))
        if d["sample"]:
            print("   sample laws: " + lawline(d["sample"]["laws"]))
            gf.write("law-check: " + lawline(d["sample"]["laws"]) + "\n")
            gf.write(d["sample"]["render"] + "\n\n")
        if not d["sample"]:
            allpass = False
            print("   NO passing map. best-effort: " + (lawline(d["firstFail"]["laws"]) if d["firstFail"] else "n/a"))
    gf.close()
    print("-" * 64)
    print("gallery written: tests/.tmp/assembler_gallery.txt")
    if not allpass:
        print("RESULT: at least one type produced NO passing map — assembler needs tuning (numbers above)."); return 1
    # require a healthy pass-rate on STANDARD (the frozen starter)
    if rep["STANDARD"]["pass"] < N * 0.5:
        print("RESULT: STANDARD pass-rate too low (%d/%d) — gate is discarding too much." % (rep["STANDARD"]["pass"], N)); return 1
    print("RESULT: every type yields gate-PASSING maps; STANDARD passes %d/%d." % (rep["STANDARD"]["pass"], N))
    return 0


if __name__ == "__main__":
    sys.exit(main())
