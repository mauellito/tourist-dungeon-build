#!/usr/bin/env python3
"""TD_SMASHGRAB — the throwaway §24 fun-test prototype. Drives the self-contained module through
the whole loop: enter (rigged TELL) -> grab ONE artifact (trip the collapse + Tremor) -> the
un-taken artifact FALLS (recovery stub) -> race the escape clock -> ESCAPE or be VOIDED.

Run:  python tests/run_smashgrab.py
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
function go(dir){return TD_SMASHGRAB.move(dir);}
function path(seq){ for(var i=0;i<seq.length;i++){ var r=go(seq[i]); } }
try{
  var SG=TD_SMASHGRAB;
  // ---- R1: enter shows a rigged TELL; two artifacts + an exit present; not yet tripped ----
  var e=SG.enter(1); var v=SG.view();
  ok('entering the vault telegraphs a rigged TELL (voice channel, not a popup)', !!(e && e.tell) && /draft|rhyme|hollow/i.test(e.tell), e?e.tell:'(none)');
  ok('two placeholder artifacts + an exit are present', v.arts.length===2 && !!v.exit && !v.tripped, v.arts.length+" arts");
  // walk to artifact A (left col), grab it -> trips the collapse (Tremor)
  var A=v.arts.filter(function(a){return a.id==='A';})[0];
  // route: left to A's column, up to A's row (avoid the centre crevasse)
  var p=v.player;
  while(SG.view().player.x>A.x) go('left');
  while(SG.view().player.y>A.y) go('up');
  ok('reached artifact A by walking (grid movement works, walls block)', SG.view().player.x===A.x && SG.view().player.y===A.y, JSON.stringify(SG.view().player));
  var g=SG.get();
  ok('R1 grabbing an artifact LIGHTS THE COLLAPSE (trip + Tremor)', g.got && g.ev && g.ev.tremor && /EXPEDITED EGRESS|VOIDED/i.test(g.ev.float||''), g.ev?g.ev.float:'(no ev)');
  ok('the Tremor carries a shake severity for the juice', g.ev && (g.ev.severity==='hard'||g.ev.severity==='med'||g.ev.severity==='soft'), g.ev?g.ev.severity:'-');
  var v2=SG.view();
  ok('R2 the escape clock starts on the trip (N turns)', v2.tripped && v2.clock>0 && v2.clock<=SG.TUNE.ESCAPE_TURNS, "clock="+v2.clock);
  // ---- R3: only ONE carried; the un-taken artifact FELL; recovery flag stubbed ----
  ok('R3 exactly one artifact is carried', !!v2.carried && (v2.carried.id==='A'), v2.carried?v2.carried.id:'none');
  var fellB=v2.arts.filter(function(a){return a.id==='B';})[0];
  ok('R3 the un-taken artifact visibly FELL (not destroyed)', fellB && fellB.fallen===true, fellB?('B fallen='+fellB.fallen):'?');
  ok('R3 the fall is reported as an in-world event', g.ev && (g.ev.lines||[]).join(' ').toLowerCase().indexOf('crevasse')>=0, (g.ev.lines||[]).join(' | '));
  ok('R3 a recovery flag is stubbed (fallen artifact pending at depth)', !!v2.fallenPending && v2.fallenPending.depth>=1, JSON.stringify(v2.fallenPending));
  ok('R3 cannot grab a second artifact through the collapse', (function(){ var r=SG.get(); return !r.got; })(), 'one-carry enforced');

  // ---- R2 WIN PATH: reach the exit before the clock expires -> ESCAPE (relief) ----
  var ex=SG.view().exit;
  while(SG.view().player.y>ex.y && !SG.over()) go('up');
  while(SG.view().player.x<ex.x && !SG.over()) go('right');
  while(SG.view().player.x>ex.x && !SG.over()) go('left');
  var vw=SG.view();
  ok('R2 WIN: reaching the exit in time ESCAPES (peril ends, relief beat)', vw.escaped===true && !vw.dead, "escaped="+vw.escaped+" clock="+vw.clock);

  // ---- R2 LOSE PATH: trip again, run out the clock -> SUMMARILY VOIDED ----
  SG.enter(2);
  var a2=SG.view().arts.filter(function(a){return a.id==='A';})[0];
  while(SG.view().player.x>a2.x) go('left');
  while(SG.view().player.y>a2.y) go('up');
  var gd=SG.get(); var lastFloat="";
  for(var t=0;t<SG.TUNE.ESCAPE_TURNS+3 && !SG.over();t++){ var r=(t%2)?go('left'):go('right'); if(r&&r.float)lastFloat=r.float; }
  var vd=SG.view();
  ok('R2 LOSE: the clock expiring CRUSHES you (SUMMARILY VOIDED)', vd.dead===true && /VOIDED/i.test(lastFloat), "dead="+vd.dead+" float="+lastFloat);
  ok('tunables (N, severity) are surfaced on the module', typeof SG.TUNE.ESCAPE_TURNS==='number' && !!SG.TUNE.TREMOR, "N="+SG.TUNE.ESCAPE_TURNS+" tremor="+SG.TUNE.TREMOR);

  o.textContent=R.join('\n')+'\nSUMMARY '+(R.length-fails)+'/'+R.length; document.title="SG fail="+fails;
}catch(e){o.textContent="HARNESS_ERROR "+(e&&e.stack?e.stack:e);document.title="SG harness_error";}})();</script>
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
             "<script>\n" + open(os.path.join(ENGINE, "smashgrab.js"), encoding="utf-8").read() + "\n</script>", REP]
    runner = os.path.join(TMP, "smashgrab_runner.html"); open(runner, "w", encoding="utf-8").write("\n".join(parts))
    ud = tempfile.mkdtemp(prefix="td_sg_")
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
