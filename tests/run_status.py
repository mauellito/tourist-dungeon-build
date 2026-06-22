#!/usr/bin/env python3
"""TD_STATUS — the generic status-effect engine. Verifies: apply/refresh/has/clear; per-turn tick
fires DoT (poison/bleed via ctx.hurt) and regen (via ctx.heal), decrements, expires at 0; antidote
clears CURABLE only (poison, not bleed); fear is a flinch status (no DoT); surface = feel-words.
Pure, no DOM.

Run:  python tests/run_status.py
"""
import html, os, re, shutil, subprocess, sys, tempfile
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, "engine"); TMP = os.path.join(ROOT, "tests", ".tmp")
CH = [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
      r"C:\Program Files\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"]
REP = r"""
<script>(function(){var o=document.getElementById('out');var R=[],fails=0;
function ok(n,c,d){R.push((c?'PASS ':'FAIL ')+n+(d?('  ::  '+d):''));if(!c)fails++;}
var S=TD_STATUS;
try{
  // ---- apply / has / refresh ----
  var p={};
  S.apply(p,'poison',5);
  ok('apply adds a status', S.has(p,'poison') && S.find(p,'poison').turns===5);
  S.apply(p,'poison',3); ok('re-apply refreshes to the MAX turns (no stacking down)', S.find(p,'poison').turns===5);
  S.apply(p,'poison',8); ok('a stronger re-apply extends', S.find(p,'poison').turns===8);
  ok('apply ignores unknown ids', S.apply(p,'banana',5)===null && !S.has(p,'banana'));

  // ---- TICK: poison DoT via ctx.hurt, decrement, expire ----
  var q={}, dmg=0, hurts=0; S.apply(q,'poison',3);
  for(var i=0;i<3;i++){ S.tick(q,{hurt:function(a){dmg+=a;hurts++;}}); }
  ok('poison ticks DoT each turn (ctx.hurt) then EXPIRES', hurts===3 && dmg===3*S.DEFS.poison.dot && !S.has(q,'poison'), 'hurts='+hurts+' dmg='+dmg);

  // ---- bleed is a DoT too (different amount) ----
  var b={}, bd=0; S.apply(b,'bleed',2); S.tick(b,{hurt:function(a){bd+=a;}}); ok('bleed deals its own DoT', bd===S.DEFS.bleed.dot && S.DEFS.bleed.dot!==S.DEFS.poison.dot);

  // ---- regen heals via ctx.heal ----
  var t={}, healed=0; S.apply(t,'regen',3); S.tick(t,{heal:function(a){healed+=a;}}); ok('regen heals each turn (ctx.heal)', healed===S.DEFS.regen.regen);

  // ---- fear is a flinch status, NOT a DoT ----
  ok('fear is a flinch status (no DoT, has a flinch chance)', !S.DEFS.fear.dot && S.DEFS.fear.flinch>0);

  // ---- antidote clears CURABLE only (poison), leaves bleed/fear ----
  var c={}; S.apply(c,'poison',5); S.apply(c,'bleed',5); S.apply(c,'fear',5);
  var cleared=S.clearCurable(c);
  ok('clearCurable removes poison (curable) but NOT bleed/fear', cleared===1 && !S.has(c,'poison') && S.has(c,'bleed') && S.has(c,'fear'), 'cleared='+cleared);

  // ---- surface = feel-words (no numbers) ----
  var w=S.surface(c); ok('surface gives feel-WORDS (no digit)', w.length>0 && !/[0-9]/.test(w.join(' ')), w.join(','));

  // ---- expandable: a new status drops in via DEFS, no engine change ----
  S.DEFS.test_haste={word:'hastened',curable:false}; var h={}; S.apply(h,'test_haste',2);
  ok('a NEW status added to DEFS just works (expandable)', S.has(h,'test_haste') && S.surface(h)[0]==='hastened');

  o.textContent=R.join('\n')+'\nSUMMARY '+(R.length-fails)+'/'+R.length; document.title="STATUS fail="+fails;
}catch(e){o.textContent="HARNESS_ERROR "+(e&&e.stack?e.stack:e);document.title="STATUS harness_error";}})();</script>
"""


def find_chrome():
    for p in CH:
        if os.path.exists(p):
            return p
    return None


def main():
    chrome = find_chrome()
    if not chrome:
        sys.exit("no chrome")
    os.makedirs(TMP, exist_ok=True)
    parts = ['<!doctype html><meta charset=utf-8><title>p</title><pre id="out">p</pre>',
             "<script>\n" + open(os.path.join(ENGINE, "status.js"), encoding="utf-8").read() + "\n</script>", REP]
    runner = os.path.join(TMP, "status_runner.html"); open(runner, "w", encoding="utf-8").write("\n".join(parts))
    ud = tempfile.mkdtemp(prefix="td_status_")
    try:
        pr = subprocess.run([chrome, "--headless", "--disable-gpu", "--no-sandbox", "--user-data-dir=" + ud, "--dump-dom", "file:///" + runner.replace("\\", "/")], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=120)
    finally:
        shutil.rmtree(ud, ignore_errors=True)
    dom = pr.stdout.decode("utf-8", "replace")
    title = (re.search(r"<title>(.*?)</title>", dom, re.DOTALL) or [None, ""])[1]
    m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.DOTALL)
    print(html.unescape(m.group(1)) if m else "(no output)\n" + dom[:1200])
    print("-" * 60)
    fm = re.search(r"fail=(\d+)", title)
    if "harness_error" in title or not fm:
        print("RESULT: HARNESS ERROR"); return 2
    fails = int(fm.group(1)); print("RESULT: {} failed".format(fails)); return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
