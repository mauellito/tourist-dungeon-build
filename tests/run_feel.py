#!/usr/bin/env python3
"""TD_FEEL — the game-feel layer. Asserts each fundamental action fires its feel HOOKS,
that idle produces NO animation (the stillness guard), that effects schedule + expire,
that "juice off" disables visual effects, and that a sound layer can subscribe.

Run:  python tests/run_feel.py
"""
import html, os, re, shutil, subprocess, sys, tempfile
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, "engine")
TMPDIR = os.path.join(ROOT, "tests", ".tmp")
ENGINE_FILES = ["feel.js"]
CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]
REPORTER = r"""
<script>
(function(){
  var out=document.getElementById('out'); var R=[],fails=0;
  function ok(n,c,d){ R.push((c?'PASS ':'FAIL ')+n+(d?('  ::  '+d):'')); if(!c)fails++; }
  function has(arr,x){ return arr.indexOf(x)>=0; }
  try {
    var F=TD_FEEL;
    // ---- feelFor: each action -> its hooks ----
    var atk=F.feelFor({attacked:true});
    ok('BUMP-ATTACK fires shake+flash+float', has(atk,'shake:soft')&&has(atk,'flash:target')&&has(atk,'float:hit'), atk.join(','));
    var kill=F.feelFor({killed:true});
    ok('KILL fires shake+flash+float:kill', has(kill,'flash:target')&&has(kill,'float:kill'), kill.join(','));
    var crit=F.feelFor({killed:true,crit:true});
    ok('CRIT kill escalates to hard shake + float:crit', has(crit,'shake:hard')&&has(crit,'float:crit'), crit.join(','));
    var got=F.feelFor({got:true});
    ok('PICK-UP fires pop+flash:self+float:item', has(got,'pop')&&has(got,'flash:self')&&has(got,'float:item'), got.join(','));
    var desc=F.feelFor({descended:true});
    ok('DESCEND fires shimmer:descend', has(desc,'shimmer:descend'), desc.join(','));
    var hurt=F.feelFor({tookDamage:true});
    ok('TAKE-DAMAGE fires vignette+shake+float:hurt', has(hurt,'vignette')&&has(hurt,'shake:soft')&&has(hurt,'float:hurt'), hurt.join(','));
    var dead=F.feelFor({dead:true});
    ok('DEATH fires shimmer:death+vignette+shake+float:death', has(dead,'shimmer:death')&&has(dead,'vignette')&&has(dead,'float:death')&&has(dead,'shake:hard'), dead.join(','));
    var mv=F.feelFor({moved:true});
    ok('MOVE fires a subtle step ease', has(mv,'step'), mv.join(','));
    // ---- IDLE STILLNESS: no action -> no hooks -> nothing active -> no animation ----
    var idle=F.feelFor({});
    ok('IDLE fires NO hooks (motion = signal)', idle.length===0, '['+idle.join(',')+']');
    F.clear();
    ok('IDLE has nothing active at any time', !F.hasActive(0) && !F.hasActive(99999), 'effects='+F._effects().length);

    // ---- scheduling + expiry (the stillness guard over time) ----
    F.clear(); F.setEnabled(true);
    var hooks=F.apply({attacked:true,target:{x:3,y:4},self:{x:2,y:4}}, 1000, 0);
    ok('apply returns the fired hooks', hooks.length>=3, hooks.join(','));
    ok('effects ACTIVE right after the action', F.hasActive(1000), 'active='+F.active(1000).length);
    ok('a flash effect carries the target tile', F.active(1010).some(function(e){return e.kind==='flash'&&e.tile&&e.tile.x===3;}), '');
    ok('effects EXPIRE -> idle again (still screen)', !F.hasActive(1000+5000), 'after 5s');
    F.prune(1000+5000); ok('prune drops expired effects', F._effects().filter(function(e){return e.kind!=='float';}).length===0, 'left='+F._effects().length);

    // ---- shake decays to ~0 by the end ----
    F.clear(); F.apply({killed:true,target:{x:1,y:1}}, 2000, 0);
    var s0=F.shakeOffset(2000), s1=F.shakeOffset(2000+F.DUR.shake-1);
    ok('shake has magnitude at the start', Math.abs(s0.dx)+Math.abs(s0.dy) > 0.5, 'm0='+(Math.abs(s0.dx)+Math.abs(s0.dy)).toFixed(2));
    ok('shake decays toward zero by the end', (Math.abs(s1.dx)+Math.abs(s1.dy)) < (Math.abs(s0.dx)+Math.abs(s0.dy)), 'm1<m0');

    // ---- JUICE OFF: hooks still reported (telemetry) but NO visual effects scheduled ----
    F.clear(); F.setEnabled(false);
    var offHooks=F.apply({attacked:true,target:{x:1,y:1}}, 3000, 0);
    ok('"juice off" still reports the hooks', offHooks.length>=3, offHooks.join(','));
    ok('"juice off" schedules NO visual effects', !F.hasActive(3000) && F._effects().length===0, 'effects='+F._effects().length);
    F.setEnabled(true);

    // ---- sound layer can subscribe (drops in later; absent -> no-op) ----
    var beeps=[]; F.onSound(function(h){ beeps.push(h); }); F.clear();
    F.apply({attacked:true,target:{x:1,y:1}}, 4000, 0);
    ok('a sound layer receives a cue per hook', beeps.length>=3, beeps.join(','));
    F.onSound(null);

    // ---- onomatopoeia is in the municipal register (not generic POW) ----
    var word=F.ono('kill',0);
    ok('onomatopoeia is institutional/death-verb register', /VOIDED|STRUCK|DISCONTINUED|CONCLUDED|EXPUNGED/.test(word), word);

    out.textContent=R.join('\n')+'\nSUMMARY '+(R.length-fails)+'/'+R.length;
    document.title='FEEL fail='+fails;
  } catch(e){ out.textContent='HARNESS_ERROR '+(e&&e.stack?e.stack:e); document.title='FEEL harness_error'; }
})();
</script>
"""


def find_chrome():
    for p in CHROME_CANDIDATES:
        if os.path.exists(p):
            return p
    for n in ("chrome", "chrome.exe", "msedge", "msedge.exe"):
        f = shutil.which(n)
        if f:
            return f
    return None


def main():
    chrome = find_chrome()
    if not chrome:
        sys.exit("FATAL: no Chrome/Edge found.")
    parts = ['<!doctype html><html><head><meta charset="utf-8"><title>pending</title></head>', '<body><pre id="out">pending</pre>']
    for fn in ENGINE_FILES:
        with open(os.path.join(ENGINE, fn), "r", encoding="utf-8") as f:
            parts.append("<script>\n" + f.read() + "\n</script>")
    parts.append(REPORTER)
    parts.append("</body></html>")
    os.makedirs(TMPDIR, exist_ok=True)
    runner = os.path.join(TMPDIR, "feel_runner.html")
    with open(runner, "w", encoding="utf-8") as f:
        f.write("\n".join(parts))
    user_data = tempfile.mkdtemp(prefix="td_feel_")
    url = "file:///" + runner.replace("\\", "/")
    cmd = [chrome, "--headless", "--disable-gpu", "--no-sandbox", "--user-data-dir=" + user_data, "--dump-dom", url]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=120)
    finally:
        shutil.rmtree(user_data, ignore_errors=True)
    dom = proc.stdout.decode("utf-8", "replace")
    title = (re.search(r"<title>(.*?)</title>", dom, re.DOTALL) or [None, ""])[1]
    m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.DOTALL)
    print(html.unescape(m.group(1)) if m else "(no output)\n" + dom[:1500])
    print("-" * 60)
    fm = re.search(r"fail=(\d+)", title)
    if "harness_error" in title or not fm:
        print("RESULT: HARNESS ERROR")
        return 2
    fails = int(fm.group(1))
    print("RESULT: {} failed".format(fails))
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
