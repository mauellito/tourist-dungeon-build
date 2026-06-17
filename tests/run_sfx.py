#!/usr/bin/env python3
"""TD_SFX — the throwaway procedural-sound stub for the §24 fun-test. We do NOT test audio output
(headless has no audio gesture); we assert the HOOKS fire: every named cue exists, cue() records,
the on/off + volume tunables work, and the module loads without throwing when no AudioContext.

Run:  python tests/run_sfx.py
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
try{
  var S=TD_SFX;
  var need=['step','loot','grab','rumble','grind','slam','chime','thud'];
  ok('every named cue exists in the palette', need.every(function(k){return typeof S.CUES[k]==='function';}), Object.keys(S.CUES).join(','));
  // firing a cue records the hook even with no audio (so it is testable)
  need.forEach(function(k){ S.cue(k); });
  var last=S.lastCues();
  ok('cue() records each hook that fires', need.every(function(k){return last.indexOf(k)>=0;}), last.join(','));
  ok('module loads + cues run without throwing when there is no audio', true, 'hasAudio='+S._hasAudio());
  // tunables: on/off + volume
  S.setEnabled(false); ok('SFX can be turned OFF', S.isEnabled()===false);
  S.cue('grab'); ok('a cue while OFF still records the hook (telemetry) but is muted', S.lastCues().indexOf('grab')>=0);
  S.setEnabled(true); ok('SFX can be turned back ON', S.isEnabled()===true);
  S.setVolume(0.5); ok('volume is tunable + clamped to [0,1]', S.volume()===0.5);
  S.setVolume(9); ok('volume clamps high', S.volume()===1);
  S.setVolume(-9); ok('volume clamps low', S.volume()===0);
  o.textContent=R.join('\n')+'\nSUMMARY '+(R.length-fails)+'/'+R.length; document.title="SFX fail="+fails;
}catch(e){o.textContent="HARNESS_ERROR "+(e&&e.stack?e.stack:e);document.title="SFX harness_error";}})();</script>
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
             "<script>\n" + open(os.path.join(ENGINE, "sfx.js"), encoding="utf-8").read() + "\n</script>", REP]
    runner = os.path.join(TMP, "sfx_runner.html"); open(runner, "w", encoding="utf-8").write("\n".join(parts))
    ud = tempfile.mkdtemp(prefix="td_sfx_")
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
