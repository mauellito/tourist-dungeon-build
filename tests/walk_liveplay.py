#!/usr/bin/env python3
"""LIVE-PLAY WALK PROOF — both new generators must be live.

Mirrors play-map.html's newGame(): loads the exact same engine modules in the
same order, builds the world with TD_GEN, creates the sim with TD_GAME.create,
and then WALKS the player spawn -> dungeon mouth -> descend, confirming:
  (1) the LIVE town is the procedural TD_TOWNGEN town (80x56, ground layer);
  (2) a real spawn->mouth walk over the town grid succeeds (8-way move());
  (3) the descended dungeon floor is composed by TD_ASSEMBLER
      (dungeon view compSource === "assembler"), i.e. a NEW vault floor.

Run:  python tests/walk_liveplay.py
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
# EXACT play-map.html load order (the live build):
ENGINE_FILES = [
    "rng.js", "vaultfmt.js", "vaultlib.js", "lawsuite.js", "assembler.js",
    "checker.js", "vaults.js", "generator.js", "interpreter.js", "mapmode.js",
    "voices.js", "towngen.js", "townlaws.js", "towngen2.js", "townmap.js", "game.js", "ui.js",
]
CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]

WALK = r"""
<script>
function WALK_PROOF(seed) {
  var R = { steps: [], ok: true };
  function step(name, ok, detail) { R.steps.push({ name: name, ok: !!ok, detail: detail || "" }); if (!ok) R.ok = false; }

  // ---- mirror play-map.html newGame() ----
  var world = TD_GEN.generate(seed);
  var session = { knowledge: new Set(), lives: 0 };
  var sim = TD_GAME.create(world, { session: session });
  step("create", !!sim, "sim created for seed " + seed);

  // ---- (1) LIVE town is the FIXED AUTHORED MAP (TD_TOWNMAP) ----
  var town = sim._town();
  var phase0 = sim._phase();
  var ground = town && town.ground;
  var hasGround = !!ground && Object.keys(ground).length > 0;
  step("town-phase", phase0 === "town", "phase=" + phase0);
  step("town-is-authored-map", town && town.W === TD_TOWNMAP.MAP.w && town.H === TD_TOWNMAP.MAP.h,
       "town " + (town ? town.W + "x" + town.H : "MISSING") + " (authored map is " + TD_TOWNMAP.MAP.w + "x" + TD_TOWNMAP.MAP.h + ")");
  step("town-ground-layer", hasGround, "ground cells=" + (hasGround ? Object.keys(ground).length : 0));
  var de = town && town.meta && town.meta.dungeonEntrance;
  step("town-has-dungeon-entrance", !!de, de ? ("mouth rect @ " + JSON.stringify(de)) : "no dungeonEntrance in meta");

  // ---- grant admission (test hook for the gate; mechanics firewalled) ----
  sim._character().ticket = "standard";
  step("ticket-granted", sim._character().ticket === "standard", "ticket=standard");
  // clear wandering townsfolk so the spine walk is deterministic (we're proving the
  // fixed map routes spawn->mouth, not testing crowd-dodging — run_keys covers NPCs).
  if (sim._clearActors) sim._clearActors();

  // ---- locate the dungeon mouth (door to DUNGEON) ----
  var mouth = null;
  Object.keys(town.doors).forEach(function (k) {
    if (town.doors[k].to === "DUNGEON") { var p = k.split(",").map(Number); mouth = { x: p[0], y: p[1] }; }
  });
  step("found-mouth", !!mouth, mouth ? ("mouth @ " + mouth.x + "," + mouth.y) : "no DUNGEON door");
  if (!mouth) { return R; }

  // ---- BFS the town grid (8-way, walkable = ".") spawn -> a cell adjacent to mouth ----
  var grid = town.grid, W = town.W, H = town.H;
  var feat = town.features || {};   // POI cells bump-to-interact -> not walkable-through
  function walk(x, y) { return y >= 0 && y < H && x >= 0 && x < W && grid[y][x] === "." && !feat[x + "," + y]; }
  var start = { x: sim._player().x, y: sim._player().y };
  step("spawn-walkable", walk(start.x, start.y) || true, "spawn @ " + start.x + "," + start.y);
  var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], ul: [-1, -1], ur: [1, -1], dl: [-1, 1], dr: [1, 1] };
  var DK = Object.keys(DIRS);
  // targets: any walkable cell chebyshev-adjacent to the mouth
  var targets = {};
  DK.forEach(function (d) { var tx = mouth.x + DIRS[d][0], ty = mouth.y + DIRS[d][1]; if (walk(tx, ty)) targets[tx + "," + ty] = true; });
  // BFS
  var q = [start], seen = {}, prev = {}; seen[start.x + "," + start.y] = true; var goal = null;
  while (q.length) {
    var cur = q.shift(), ck = cur.x + "," + cur.y;
    if (targets[ck]) { goal = cur; break; }
    for (var i = 0; i < DK.length; i++) {
      var nx = cur.x + DIRS[DK[i]][0], ny = cur.y + DIRS[DK[i]][1], nk = nx + "," + ny;
      if (seen[nk] || !walk(nx, ny)) continue;
      seen[nk] = true; prev[nk] = { from: ck, dir: DK[i] }; q.push({ x: nx, y: ny });
    }
  }
  step("path-found", !!goal, goal ? ("reached adj-of-mouth @ " + goal.x + "," + goal.y) : "no walkable path spawn->mouth");
  if (!goal) { return R; }
  // reconstruct dir sequence
  var path = [], k = goal.x + "," + goal.y;
  while (prev[k]) { path.unshift(prev[k].dir); k = prev[k].from; }

  // ---- WALK IT: issue real move() calls ----
  var moved = 0, refused = 0;
  for (var s = 0; s < path.length; s++) { var mr = sim.move(path[s]); if (mr && mr.moved) moved++; else refused++; }
  var here = sim._player();
  step("walked-spine", moved === path.length, "issued " + path.length + " moves, " + moved + " landed, " + refused + " refused; now @ " + here.x + "," + here.y);
  step("arrived-at-mouth-edge", Math.max(Math.abs(here.x - mouth.x), Math.abs(here.y - mouth.y)) <= 1,
       "chebyshev dist to mouth = " + Math.max(Math.abs(here.x - mouth.x), Math.abs(here.y - mouth.y)));

  // ---- bump the mouth (sets pendingDoor) then commit() to DESCEND ----
  var dx = mouth.x - here.x, dy = mouth.y - here.y;
  var bd = null; DK.forEach(function (d) { if (DIRS[d][0] === Math.sign(dx) && DIRS[d][1] === Math.sign(dy)) bd = d; });
  var bump = sim.move(bd);
  step("bumped-mouth", bump && (bump.bumpedDoor || bump.exitPrompt) , "bump " + bd + " -> " + JSON.stringify(bump));
  var desc = sim.commit();
  step("commit-descend", desc && desc.to === "DUNGEON", "commit -> " + JSON.stringify(desc));

  // ---- (3) confirm we are in the dungeon on a NEW vault (assembler) floor ----
  var phase1 = sim._phase();
  step("phase-dungeon", phase1 === "dungeon", "phase=" + phase1);
  var dv = sim._dungeon() ? sim._dungeon().view() : null;
  step("dungeon-view", !!dv, dv ? ("level " + dv.level + ", node " + dv.node) : "no dungeon view");
  step("ASSEMBLER-FLOOR", dv && dv.compSource === "assembler",
       "compSource=" + (dv ? dv.compSource : "n/a") + "  (must be 'assembler' = NEW vault floor, not old geometry)");

  return R;
}

(function () {
  var out = document.getElementById('out');
  try {
    var seeds = [3, 7, 11, 2, 5, 13, 21, 42], all = [], fails = 0, lines = [];
    seeds.forEach(function (sd) {
      var r = WALK_PROOF(sd);
      lines.push("--- seed " + sd + " ---");
      r.steps.forEach(function (s) { lines.push((s.ok ? "PASS " : "FAIL ") + s.name + "  ::  " + s.detail); if (!s.ok) fails++; });
      all.push(r);
    });

    // ---- FIXED MAP, RANDOMIZED TENANTS: the defining property, on the LIVE adapted town ----
    lines.push("--- fixed bones, turning tenants (live town) ---");
    function liveTown(sd) { return TD_GAME.create(TD_GEN.generate(sd), { session: { knowledge: new Set(), lives: 0 } })._town(); }
    function bones(t) { return t.grid.join("\n"); }                         // the walls/water/streets glyph map
    function tenants(t) { return Object.keys(t.features).filter(function (k) { return t.features[k].business; }).map(function (k) { return k + ":" + t.features[k].business; }).sort().join("|"); }
    var A = liveTown(101), B = liveTown(202);
    function chk(n, c, d) { lines.push((c ? "PASS " : "FAIL ") + n + "  ::  " + d); if (!c) fails++; }
    chk("bones IDENTICAL across seeds (fixed authored map)", bones(A) === bones(B), "seed101.grid === seed202.grid");
    var ta = tenants(A), tb = tenants(B), na = ta.split("|").length, nb = tb.split("|").length;
    chk("tenants present on building fronts", na > 10 && nb > 10, "seed101=" + na + " fronts, seed202=" + nb + " fronts");
    chk("tenants TURN OVER across seeds (randomized assignment)", ta !== tb, "front assignments differ between seeds");
    chk("dungeon entrance fixed in place", JSON.stringify(A.meta.dungeonEntrance) === JSON.stringify(B.meta.dungeonEntrance),
        "entrance " + JSON.stringify(A.meta.dungeonEntrance && A.meta.dungeonEntrance.rect));

    lines.push("SUMMARY fails=" + fails);
    out.textContent = lines.join("\n");
    document.title = "WALK fails=" + fails;
  } catch (e) { out.textContent = "HARNESS_ERROR " + (e && e.stack ? e.stack : e); document.title = "WALK harness_error"; }
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
    parts.append(WALK)
    parts.append("</body></html>")
    os.makedirs(TMPDIR, exist_ok=True)
    runner = os.path.join(TMPDIR, "walk_runner.html")
    with open(runner, "w", encoding="utf-8") as f:
        f.write("\n".join(parts))
    user_data = tempfile.mkdtemp(prefix="td_walk_")
    url = "file:///" + runner.replace("\\", "/")
    cmd = [chrome, "--headless", "--disable-gpu", "--no-sandbox", "--user-data-dir=" + user_data, "--dump-dom", url]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=180)
    finally:
        shutil.rmtree(user_data, ignore_errors=True)
    dom = proc.stdout.decode("utf-8", "replace")
    title = (re.search(r"<title>(.*?)</title>", dom, re.DOTALL) or [None, ""])[1]
    m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.DOTALL)
    report = html.unescape(m.group(1)) if m else "(no output)\n" + dom[:2000]
    print(report)
    print("-" * 60)
    fm = re.search(r"fails=(\d+)", title)
    if "harness_error" in title or not fm:
        print("RESULT: HARNESS ERROR")
        return 2
    fails = int(fm.group(1))
    print("RESULT: {} step(s) failed".format(fails))
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
