#!/usr/bin/env python3
"""STARTING LOADOUT — the coin purse + outfitting proof (round 3).

Rolls 500 characters across every background (visa) and asserts:
  - every purse lands in [min+bonus, max+bonus] for its background (the tunable table's range);
  - the roll is DETERMINISTIC per character seed (same seed+background -> identical purse);
  - moneyed backgrounds roll fatter, hard-luck ones lean (the modifier direction holds);
  - the outfitter posts a BASIC weapon + BASIC armour + rations, and a MEDIAN purse affords
    weapon+2 rations OR armour+2 rations at posted prices, but NOT the whole kit — a real
    both-not-all choice.
Reads the REAL posted prices + purse table from the engine. Private suite.
Run:  python tests/run_starting_loadout.py
"""
import html
import os
import re
import shutil
import subprocess
import sys
import tempfile

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, "engine")
TMPDIR = os.path.join(ROOT, "tests", ".tmp")
ENGINE_FILES = [
    "rng.js", "resolve.js", "stats.js", "charsys.js", "burden.js", "econ.js", "status.js", "bestiary.js",
    "sfx.js", "feel.js", "metrics.js", "vaultfmt.js", "vaultlib.js", "lawsuite.js", "assembler.js", "checker.js",
    "vaults.js", "interpreter.js", "gen2.js", "sg_vault.js", "mapmode.js", "voices.js", "townlaws.js",
    "towngen.js", "towngen2.js", "townmap.js", "generator.js", "ui.js", "game.js",
]
CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]

PROOF = r"""
<div id="out">pending</div>
<script>
(function () {
  var R = [], fails = 0;
  function ok(n, c, d) { R.push((c ? "PASS " : "FAIL ") + n + (d ? ("  ::  " + d) : "")); if (!c) fails++; }
  function note(s) { R.push("    " + s); }
  function median(xs) { var s = xs.slice().sort(function (a, b) { return a - b; }); var m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  try {
    var world = TD_GEN.generate(1, { depth: 6 });
    var sim = TD_GAME.create(world, { session: { knowledge: new Set(), lives: 0 } });
    var T = sim._startingPurseTable();
    var visas = Object.keys(TD_CHARSYS.VISAS);
    note("backgrounds (visas): " + visas.join(", "));
    note("BASE_PURSE = {min:" + T.base.min + ", max:" + T.base.max + "}; modifiers: " + visas.map(function (v) { var m = T.byVisa[v] || { bonus: 0, mult: 1 }; return v + "(" + (m.bonus >= 0 ? "+" : "") + m.bonus + ")"; }).join(" "));

    // ---------- roll 500 characters across backgrounds; range + determinism ----------
    var N = 500, perVisa = {}, rangeBad = [], detBad = 0, all = [];
    for (var i = 0; i < N; i++) {
      var seed = 1000 + i, visa = visas[i % visas.length];
      var v1 = sim._computeStartingPurse(seed, visa), v2 = sim._computeStartingPurse(seed, visa);
      if (v1 !== v2) detBad++;
      var m = T.byVisa[visa] || { bonus: 0, mult: 1 };
      var lo = Math.round(T.base.min * (m.mult || 1) + (m.bonus || 0)), hi = Math.round(T.base.max * (m.mult || 1) + (m.bonus || 0));
      if (v1 < lo || v1 > hi) rangeBad.push(visa + ":" + v1 + " not in [" + lo + "," + hi + "]");
      (perVisa[visa] = perVisa[visa] || []).push(v1); all.push(v1);
    }
    ok("every purse lands in [min+bonus, max+bonus] for its background (500 rolls)", rangeBad.length === 0, rangeBad.length ? rangeBad.slice(0, 4).join(" | ") : (N + " rolls all in range"));
    ok("the purse roll is DETERMINISTIC per character seed (same seed+background -> identical)", detBad === 0, detBad + " mismatches");
    note("per-background median purse: " + visas.map(function (v) { return v + "=" + median(perVisa[v]); }).join(" "));

    // modifier direction: moneyed > plain > hard-luck (same seed, deterministic)
    var mon = sim._computeStartingPurse(7, "tourist"), plain = sim._computeStartingPurse(7, "scholar"), lean = sim._computeStartingPurse(7, "pilgrim");
    ok("moneyed background rolls FATTER, hard-luck rolls LEANER (same seed)", mon > plain && plain > lean, "tourist=" + mon + " > scholar=" + plain + " > pilgrim=" + lean);

    // ---------- outfitter stock + posted prices ----------
    var stock = sim._shopStock("store");
    var hasWeapon = stock.indexOf("out_dagger") >= 0, hasArmour = stock.indexOf("out_jerkin") >= 0;
    var wPrice = sim._postedPrice("out_dagger"), aPrice = sim._postedPrice("out_jerkin"), rPrice = sim._postedPrice("ration");
    // 'ration' lives at the bodega; posted price is the same TD_ECON.buyPrice regardless of counter
    note("outfitter posts: dagger " + wPrice + "c, padded jerkin " + aPrice + "c; ration " + rPrice + "c (bodega)");
    ok("the outfitter offers a BASIC weapon + BASIC armour (a playable starter spread)", hasWeapon && hasArmour && wPrice > 0 && aPrice > 0, "weapon@" + wPrice + " armour@" + aPrice + " (stock: " + stock.join(",") + ")");
    ok("rations are cheap and available (a few affordable on top of one gear piece)", rPrice > 0 && rPrice <= 15, "ration=" + rPrice);

    // ---------- the both-not-all CHOICE at posted prices ----------
    var med = median(all);
    var weaponKit = wPrice + 2 * rPrice, armourKit = aPrice + 2 * rPrice, wholeKit = wPrice + aPrice + 2 * rPrice;
    note("MEDIAN purse = " + med + "c.  weapon+2 rations = " + weaponKit + "c · armour+2 rations = " + armourKit + "c · whole kit (both+2 rations) = " + wholeKit + "c");
    ok("MEDIAN purse affords weapon+2 rations", med >= weaponKit, med + " >= " + weaponKit);
    ok("MEDIAN purse affords armour+2 rations", med >= armourKit, med + " >= " + armourKit);
    ok("MEDIAN purse does NOT afford the WHOLE kit (weapon+armour+2 rations) — a real both-not-all choice", med < wholeKit, med + " < " + wholeKit);

    // ---------- minimal kit at spawn (you outfit yourself) ----------
    var q = TD_GAME.create(world, { session: { knowledge: new Set(), lives: 0 } });
    var eqp = q._character().equipment;
    ok("a fresh character spawns with a MINIMAL kit (unarmed + unarmoured) and a coin purse", !eqp.rightHand && !eqp.body && q._purseValue() > 0, "weapon=" + (eqp.rightHand ? eqp.rightHand.name : "none") + " armour=" + (eqp.body ? "yes" : "none") + " purse=" + q._purseValue());
  } catch (e) { document.getElementById("out").textContent = "HARNESS_ERROR " + (e && e.stack ? e.stack : e); document.title = "loadout harness_error"; return; }
  document.getElementById("out").textContent = R.join("\n") + "\nSUMMARY fails=" + fails;
  document.title = "loadout fails=" + fails;
})();
</script>
"""


def build_page():
    parts = ["<!doctype html><html><head><meta charset='utf-8'><title>pending</title></head><body>"]
    for f in ENGINE_FILES:
        p = os.path.join(ENGINE, f)
        if os.path.exists(p):
            parts.append("<script>\n" + open(p, encoding="utf-8").read() + "\n</script>")
    parts.append(PROOF)
    parts.append("</body></html>")
    return "\n".join(parts)


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
    os.makedirs(TMPDIR, exist_ok=True)
    runner = os.path.join(TMPDIR, "starting_loadout_runner.html")
    with open(runner, "w", encoding="utf-8") as f:
        f.write(build_page())
    user_data = tempfile.mkdtemp(prefix="td_loadout_")
    url = "file:///" + runner.replace("\\", "/")
    cmd = [chrome, "--headless=new", "--disable-gpu", "--no-sandbox", "--allow-file-access-from-files",
           "--virtual-time-budget=20000", "--user-data-dir=" + user_data, "--dump-dom", url]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=180)
    finally:
        shutil.rmtree(user_data, ignore_errors=True)
    dom = proc.stdout.decode("utf-8", "replace")
    title = (re.search(r"<title>(.*?)</title>", dom, re.DOTALL) or [None, ""])[1]
    m = re.search(r'<div id="out">(.*?)</div>', dom, re.DOTALL)
    report = html.unescape(m.group(1)) if m else "(no output)\n" + dom[:2000]
    print(report)
    print("-" * 60)
    if "harness_error" in title:
        print("RESULT: HARNESS ERROR")
        return 2
    fm = re.search(r"fails=(\d+)", title)
    fails = int(fm.group(1)) if fm else -1
    print("RESULT: {} failed".format(fails))
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
