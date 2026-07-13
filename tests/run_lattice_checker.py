#!/usr/bin/env python3
"""LATTICE round 3 — the CHECKER (hard bars, no loosening).

Over >=200 seeded lattice worlds (TD_GEN.generate + TD_LATTICE.addBranches), proves the operator canon on the
SUBLEVEL GRAPH (subs = spine "L1".."Ldepth" + branch subs; edges = the stairs between them):
  A. EXACTLY ONE spine path start -> max depth: only the spine reaches the true bottom; branches never do.
  B. Every branch BOUNDED: the down-graph is a DAG (no cycle strands progress), every branch chain terminates
     in a dead-end sublevel, and there are NO orphaned sublevels (every sub reachable from the start).
  C. ONE TRUE RUN across the whole graph: from the start, a brute-force walk (any stairs, up or down) can
     ALWAYS reach max depth from EVERY reachable sublevel (a branch never strands you off the true path).
And, composing the real gen2 floors over a sample of worlds (every sublevel):
  D. every stair lands in-bounds on WALKABLE floor (branch stairs at a room centre); every floor stays ONE
     contiguous region; the strand guard is green — every stair is reachable from the floor's arrival cell.

No existing lock is re-baselined. Private suite. Run:  python tests/run_lattice_checker.py
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
    "rng.js", "resolve.js", "stats.js", "burden.js", "vaultfmt.js", "vaultlib.js", "lawsuite.js", "assembler.js",
    "checker.js", "vaults.js", "generator.js", "lattice.js", "interpreter.js", "gen2.js", "sg_vault.js", "mapmode.js",
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
  try {
    function subOf(w, id) { var m = w.nodes[id] || {}; return m.sub || ("L" + (m.level || 0)); }
    // build the SUBLEVEL GRAPH: subs -> {level, down:{}, up:{}, deadEnd}. SET-PIECE nodes excluded (portal,
    // separately proven). Edges classified by depth (deeper=down, shallower=up).
    function subGraph(w) {
      var subs = {}, spineDepth = 0;
      Object.keys(w.nodes).forEach(function (id) { var m = w.nodes[id]; if (m.nodeType === "SET-PIECE") return; var s = subOf(w, id); if (!subs[s]) subs[s] = { id: s, level: m.level, down: {}, up: {}, deadEnd: false }; if (m.deadEnd) subs[s].deadEnd = true; if (m.region !== "branch") spineDepth = Math.max(spineDepth, m.level || 0); });   // TRUE bottom = deepest SPINE (non-branch) level
      (w.edges || []).forEach(function (e) { if (!w.nodes[e.from] || !w.nodes[e.to]) return; if (w.nodes[e.to].nodeType === "SET-PIECE" || w.nodes[e.from].nodeType === "SET-PIECE") return; var fs = subOf(w, e.from), ts = subOf(w, e.to); if (fs === ts || !subs[fs] || !subs[ts]) return; var fl = w.nodes[e.from].level, tl = w.nodes[e.to].level; if (tl > fl) subs[fs].down[ts] = 1; else if (tl < fl) subs[fs].up[ts] = 1; });
      return { subs: subs, depth: spineDepth };
    }
    // reachable set following a chosen adjacency (down / down+up)
    function reach(subs, start, useUp) { var seen = {}, q = [start]; seen[start] = 1; while (q.length) { var s = q.shift(); var nb = subs[s]; if (!nb) continue; Object.keys(nb.down).forEach(function (t) { if (!seen[t]) { seen[t] = 1; q.push(t); } }); if (useUp) Object.keys(nb.up).forEach(function (t) { if (!seen[t]) { seen[t] = 1; q.push(t); } }); } return seen; }
    // does a DOWN-only DFS from `s` reach `target`? (memoised per call)
    function canReachDown(subs, s, target, memo) { if (s === target) return true; if (memo[s] != null) return memo[s]; memo[s] = false; var nb = subs[s]; if (nb) { var keys = Object.keys(nb.down); for (var i = 0; i < keys.length; i++) { if (canReachDown(subs, keys[i], target, memo)) { memo[s] = true; break; } } } return memo[s]; }
    // detect a DOWN cycle (down-graph must be a DAG)
    function hasDownCycle(subs) { var state = {}; var bad = false; function dfs(s) { state[s] = 1; Object.keys(subs[s].down).forEach(function (t) { if (!subs[t]) return; if (state[t] === 1) bad = true; else if (state[t] == null) dfs(t); }); state[s] = 2; } Object.keys(subs).forEach(function (s) { if (state[s] == null) dfs(s); }); return bad; }

    var SEEDS = 240, aBad = [], bBad = [], cBad = [], depthSum = 0, branchSum = 0;
    for (var sd = 1; sd <= SEEDS; sd++) {
      var w = TD_LATTICE.addBranches(TD_GEN.generate(sd, { depth: 6 }), sd);
      var G = subGraph(w), subs = G.subs, depth = G.depth, bottom = "L" + depth, startSub = subOf(w, w.start);
      depthSum += depth; branchSum += (w.lattice ? w.lattice.branches.length : 0);
      // A — exactly one spine path to max depth: ONLY spine subs can reach the true bottom (branches dead-end).
      var spineOk = true;
      for (var L = 1; L <= depth; L++) { if (!subs["L" + L]) spineOk = false; else if (L < depth && !subs["L" + L].down["L" + (L + 1)]) spineOk = false; }
      var reachBottom = Object.keys(subs).filter(function (s) { return canReachDown(subs, s, bottom, {}); });
      // the subs that can still descend to the bottom must be EXACTLY the spine subs (L1..Ldepth)
      var nonSpineReachingBottom = reachBottom.filter(function (s) { return !/^L\d+$/.test(s); });
      if (!spineOk || nonSpineReachingBottom.length) aBad.push("seed " + sd + (spineOk ? "" : " brokenSpine") + (nonSpineReachingBottom.length ? " branchReachesBottom:" + nonSpineReachingBottom.slice(0, 2) : ""));
      // B — bounded: down-graph is a DAG, every branch terminal dead-ends (no down), no orphans (all reachable
      // from L1 via up+down).
      if (hasDownCycle(subs)) bBad.push("seed " + sd + " down-cycle");
      var reachAll = reach(subs, startSub, true);
      var orphans = Object.keys(subs).filter(function (s) { return !reachAll[s]; });
      if (orphans.length) bBad.push("seed " + sd + " orphans:" + orphans.slice(0, 2));
      var termBad = Object.keys(subs).filter(function (s) { return !/^L\d+$/.test(s) && Object.keys(subs[s].down).length === 0 && !subs[s].deadEnd; });
      if (termBad.length) bBad.push("seed " + sd + " branch-terminal-not-deadEnd:" + termBad.slice(0, 2));
      // C — One True Run: from EVERY reachable sub, a walk (up+down) can reach the bottom (never stranded).
      var stranded = Object.keys(reachAll).filter(function (s) { return !reach(subs, s, true)[bottom]; });
      if (stranded.length) cBad.push("seed " + sd + " stranded:" + stranded.slice(0, 2));
    }
    note("checked " + SEEDS + " worlds (avg depth " + (depthSum / SEEDS).toFixed(1) + ", " + (branchSum / SEEDS).toFixed(1) + " branches/world)");
    ok("A. EXACTLY ONE spine path start -> max depth (only the spine reaches the true bottom; branches never do)", aBad.length === 0, aBad.slice(0, 3).join(" | ") || (SEEDS + " worlds, one spine each"));
    ok("B. every branch BOUNDED (down-graph is a DAG; branch terminals dead-end; no orphaned sublevels)", bBad.length === 0, bBad.slice(0, 3).join(" | ") || "all bounded");
    ok("C. ONE TRUE RUN — from every reachable sublevel a walk always reaches max depth (never stranded)", cBad.length === 0, cBad.slice(0, 3).join(" | ") || "always reachable");

    // D — compose the real floors over a sample; stair placement + region + strand invariants.
    var SAMPLE = 40, dBad = [], subsComposed = 0, stairsChecked = 0;
    var DV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    function reachCells(g, sx, sy) { var H = g.length, W = g[0].length, seen = {}, q = [[sx, sy]]; seen[sx + "," + sy] = 1; while (q.length) { var c = q.shift(); for (var d in DV) { var nx = c[0] + DV[d][0], ny = c[1] + DV[d][1], k = nx + "," + ny; if (!seen[k] && ny >= 0 && ny < H && nx >= 0 && nx < W && (g[ny][nx] === "." || g[ny][nx] === "~")) { seen[k] = 1; q.push([nx, ny]); } } } return seen; }
    for (var s2 = 1; s2 <= SAMPLE; s2++) {
      var w2 = TD_LATTICE.addBranches(TD_GEN.generate(s2, { depth: 6 }), s2);
      var G2 = subGraph(w2);
      Object.keys(G2.subs).forEach(function (sub) {
        var comp = TD_MAP.composeSublevelLive(w2, s2, sub);
        if (!comp) { dBad.push("seed " + s2 + " sub " + sub + " no compose"); return; }
        subsComposed++;
        var g = comp.grid, m = TD_GEN2.measure(g);
        if (m.regions !== 1 || m.leaks !== 0) dBad.push("seed " + s2 + " " + sub + " regions=" + m.regions + " leaks=" + m.leaks);
        var arrival = comp.spawn || (comp.upStair) || { x: comp.comX | 0, y: comp.comY | 0 };
        var seen = reachCells(g, arrival.x, arrival.y);
        (comp.sublevelStairs || []).forEach(function (st) {
          stairsChecked++;
          var onFloor = st.y >= 0 && st.y < g.length && st.x >= 0 && st.x < g[0].length && (g[st.y][st.x] === "." || g[st.y][st.x] === "~");
          if (!onFloor) dBad.push("seed " + s2 + " " + sub + " stair off-floor @" + st.x + "," + st.y);
          else if (!seen[st.x + "," + st.y]) dBad.push("seed " + s2 + " " + sub + " stair STRANDED @" + st.x + "," + st.y);
          if (st.branch && !(comp.rooms || []).some(function (r) { return r.cx === st.x && r.cy === st.y; })) dBad.push("seed " + s2 + " " + sub + " branch stair not room-centre");
        });
      });
    }
    note("composed " + subsComposed + " real floors across " + SAMPLE + " worlds, checked " + stairsChecked + " stairs");
    ok("D. every stair on WALKABLE floor + reachable from arrival (strand guard) + one region; branch stairs at room centres", dBad.length === 0, dBad.slice(0, 3).join(" | ") || (stairsChecked + " stairs all valid"));
  } catch (e) { document.getElementById("out").textContent = "HARNESS_ERROR " + (e && e.stack ? e.stack : e); document.title = "lattice3 harness_error"; return; }
  document.getElementById("out").textContent = R.join("\n") + "\nSUMMARY fails=" + fails;
  document.title = "lattice3 fails=" + fails;
})();
</script>
"""


def build_page():
    parts = ["<!doctype html><html><head><meta charset='utf-8'><title>pending</title></head><body>"]
    for f in ENGINE_FILES:
        parts.append("<script>\n" + open(os.path.join(ENGINE, f), encoding="utf-8").read() + "\n</script>")
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
    runner = os.path.join(TMPDIR, "lattice_checker_runner.html")
    with open(runner, "w", encoding="utf-8") as f:
        f.write(build_page())
    user_data = tempfile.mkdtemp(prefix="td_lat3_")
    url = "file:///" + runner.replace("\\", "/")
    cmd = [chrome, "--headless=new", "--disable-gpu", "--no-sandbox", "--allow-file-access-from-files",
           "--virtual-time-budget=90000", "--user-data-dir=" + user_data, "--dump-dom", url]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=400)
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
