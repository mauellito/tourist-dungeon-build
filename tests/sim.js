// Tourist Dungeon — tests/sim.js : the HEADLESS BALANCE SIM (Gate 1). Drives the pure
// TD_RESOLVE core over N runs of the smash-and-grab loop under bracketed POLICIES and prints a
// per-policy distribution: win-rate, time-to-kill, death-cause, loot-per-life. Turns "play an hour
// and guess" into "read the distribution in seconds." It MEASURES the extracted numbers — it does
// not change any of them.
//
// Runtime-agnostic: under Node it `require`s the engine modules and runs as a CLI
// (`node tests/sim.js [N] [seed]`); in a browser / headless-Chrome the engine globals are already
// present (tests/run_sim.py injects them) and it exposes TD_SIM.{runAll,format}.
//
// SIM ASSUMPTIONS (modeling knobs, NOT game tuning): the en-route combat gauntlet — how many foes
// you meet and the player HP pool — is a sim overlay so the combat death-cause is populated; it uses
// the real TD_RESOLVE combat numbers. Documented here so it is never mistaken for balance data.
"use strict";

(function () {
  var R, RNG;
  if (typeof TD_RESOLVE !== "undefined") { R = TD_RESOLVE; RNG = TD_RNG; }
  else { R = require("../engine/resolve.js"); RNG = require("../engine/rng.js"); }

  var SIM = { PLAYER_HP: 100, MAX_FOES: 5, FOE_CHANCE: 0.35 };   // sim overlay (see header)
  var POLICIES = ["greedy", "cautious", "random"];

  // BFS toward the exit avoiding walls/chasm and (live) rubble — recomputed each step as it spreads
  function stepToward(S, tx, ty) {
    var L = R.SG.layout, D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    var q = [[S.player.x, S.player.y]], seen = {}, prev = {}; seen[S.player.x + "," + S.player.y] = 1;
    while (q.length) {
      var c = q.shift();
      if (c[0] === tx && c[1] === ty) { var k = tx + "," + ty; while (prev[k] && prev[k].f !== S.player.x + "," + S.player.y) k = prev[k].f; return prev[k] ? prev[k].d : null; }
      for (var d in D) {
        var nx = c[0] + D[d][0], ny = c[1] + D[d][1], kk = nx + "," + ny, ch = L.baseTile(nx, ny);
        if (seen[kk] || ch === "#" || ch === "~" || R.SG.rubble(S, nx, ny)) continue;
        seen[kk] = 1; prev[kk] = { f: c[0] + "," + c[1], d: d }; q.push([nx, ny]);
      }
    }
    return null;   // boxed in by rubble
  }
  function flee(S) {
    var L = R.SG.layout, guard = 0;
    while (!R.SG.over(S) && guard++ < 400) {
      var dir = stepToward(S, L.EXIT.x, L.EXIT.y);
      if (!dir) { S.dead = true; S.swallowed = true; break; }   // the collapse boxed you in
      R.SG.move(S, dir);
    }
  }

  // one run under a policy: loot -> grab artifact (trip) -> fight the gauntlet (costs time) -> flee
  function oneRun(rng, policy) {
    var S = R.SG.newState(); S.active = true; var T = R.SG.TUNE;
    var treas = S.treas.slice().sort(function (a, b) { return b.value - a.value; });
    var chosen;
    if (policy === "greedy") chosen = treas;
    else if (policy === "cautious") chosen = treas.slice(0, Math.floor(T.SPRINT_THRESHOLD / T.WEIGHT_PER_TREASURE));  // grab only while sprint stays safe
    else chosen = treas.filter(function () { return rng.chance(0.5); });   // random
    chosen.forEach(function (t) { S.player.x = t.x; S.player.y = t.y; R.SG.get(S); });
    var a = S.arts[0]; S.player.x = a.x; S.player.y = a.y; R.SG.get(S);   // grab the artifact -> trips collapse + slab

    // en-route combat gauntlet (faithful TD_RESOLVE math; sim decides how many foes)
    var kinds = Object.keys(R.COMBAT.CREATURES), n = 0, rounds = 0, hpLost = 0, kills = 0;
    for (var i = 0; i < SIM.MAX_FOES; i++) if (rng.chance(SIM.FOE_CHANCE)) n++;
    for (var c = 0; c < n; c++) {
      var cr = R.COMBAT.CREATURES[rng.pick(kinds)];
      var rk = R.ttk(cr.hp, R.COMBAT.PLAYER_DMG);     // turns to kill at fixed player damage
      rounds += rk; hpLost += (rk - 1) * cr.dmg; kills++;   // it lands (rk-1) blows before you finish it
    }
    var cause, loot = 0;
    if (hpLost >= SIM.PLAYER_HP) { cause = "combat"; }      // the gauntlet killed you
    else {
      S.doorClosed += rounds;                               // time spent fighting lets both threats gain
      flee(S);
      cause = S.escaped ? "escape" : (S.swallowed ? "collapse" : "slab");
      if (S.escaped) loot = S.score;
    }
    return { cause: cause, loot: loot, kills: kills, rounds: rounds, ttk: kills ? rounds / kills : null };
  }

  function median(xs) { if (!xs.length) return 0; var s = xs.slice().sort(function (a, b) { return a - b; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function mean(xs) { return xs.length ? xs.reduce(function (a, b) { return a + b; }, 0) / xs.length : 0; }

  function runPolicy(policy, N, seed) {
    var rng = RNG.make(seed), runs = [];
    for (var i = 0; i < N; i++) runs.push(oneRun(rng, policy));
    var wins = runs.filter(function (r) { return r.cause === "escape"; }).length;
    var ttks = runs.filter(function (r) { return r.ttk != null; }).map(function (r) { return r.ttk; });
    var cause = { collapse: 0, slab: 0, combat: 0 };
    runs.forEach(function (r) { if (r.cause !== "escape") cause[r.cause]++; });
    return {
      policy: policy, N: N, wins: wins, winRate: wins / N,
      ttkMean: mean(ttks), ttkMedian: median(ttks),
      death: cause, lootPerLife: mean(runs.map(function (r) { return r.loot; }))
    };
  }

  function runAll(opts) {
    opts = opts || {}; var N = opts.N || 1000, seed = (opts.seed == null ? 1234 : opts.seed) >>> 0;
    var byPolicy = {}; POLICIES.forEach(function (p) { byPolicy[p] = runPolicy(p, N, seed); });
    return { N: N, seed: seed, sim: SIM, policies: byPolicy, flags: flagsFor(byPolicy) };
  }

  // R3: expose the numbers, don't judge — auto-flag degenerate signals
  function flagsFor(bp) {
    var f = [];
    POLICIES.forEach(function (p) {
      var r = bp[p];
      if (r.winRate > 0.95) f.push(p + ": win-rate " + pct(r.winRate) + " > 95% (trivial)");
      if (r.winRate < 0.05) f.push(p + ": win-rate " + pct(r.winRate) + " < 5% (unwinnable)");
      var deaths = r.N - r.wins;
      if (deaths > 0) ["collapse", "slab", "combat"].forEach(function (k) {
        if (r.death[k] / deaths > 0.70) f.push(p + ": " + pct(r.death[k] / deaths) + " of deaths are " + k + " (>70%, one-note)");
      });
    });
    var g = bp.greedy, c = bp.cautious;
    if (Math.abs(g.winRate - c.winRate) < 0.05 && Math.abs(g.lootPerLife - c.lootPerLife) < 0.05 * (c.lootPerLife || 1))
      f.push("greed-doesn't-matter: greedy ≈ cautious (win-rate & loot within 5%)");
    return f;
  }

  function pct(x) { return (x * 100).toFixed(1) + "%"; }
  function pad(s, n) { s = "" + s; while (s.length < n) s += " "; return s; }
  function padL(s, n) { s = "" + s; while (s.length < n) s = " " + s; return s; }

  function format(res) {
    var L = [];
    L.push("TOURIST DUNGEON — headless balance sim   (N=" + res.N + " per policy, seed=" + res.seed + ")");
    L.push("sim overlay: PLAYER_HP=" + res.sim.PLAYER_HP + "  foes 0.." + res.sim.MAX_FOES + " @ p=" + res.sim.FOE_CHANCE + "  (combat uses real TD_RESOLVE numbers)");
    L.push("");
    L.push(pad("policy", 10) + padL("win%", 8) + padL("TTK(md)", 9) + padL("collapse", 10) + padL("slab", 8) + padL("combat", 8) + padL("loot/life", 11));
    L.push(new Array(64).join("-"));
    POLICIES.forEach(function (p) {
      var r = res.policies[p], deaths = r.N - r.wins || 1;
      L.push(pad(p, 10) + padL(pct(r.winRate), 8) + padL(r.ttkMedian.toFixed(1), 9)
        + padL(pct(r.death.collapse / deaths), 10) + padL(pct(r.death.slab / deaths), 8)
        + padL(pct(r.death.combat / deaths), 8) + padL("$" + r.lootPerLife.toFixed(1), 11));
    });
    L.push(new Array(64).join("-"));
    L.push("(collapse/slab/combat are shares of that policy's DEATHS; loot/life averages over all runs)");
    L.push("");
    if (res.flags.length) { L.push("DEGENERACY FLAGS:"); res.flags.forEach(function (x) { L.push("  ⚑ " + x); }); }
    else L.push("DEGENERACY FLAGS: none — distribution looks non-degenerate.");
    return L.join("\n");
  }

  var API = { runAll: runAll, runPolicy: runPolicy, format: format, flagsFor: flagsFor, POLICIES: POLICIES, SIM: SIM };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (typeof window !== "undefined") window.TD_SIM = API;

  // Node CLI: node tests/sim.js [N] [seed]
  if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
    var N = parseInt(process.argv[2], 10) || 1000, seed = parseInt(process.argv[3], 10); if (isNaN(seed)) seed = 1234;
    console.log(format(runAll({ N: N, seed: seed })));
  }
})();
