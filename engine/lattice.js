"use strict";
// Tourist Dungeon — TD_LATTICE: the DESCENT SPINE + optional BRANCHES (operator ruled).
//
// CANON: the descent has ONE TRUE STAIR PATH through the levels (the spine). SOME levels carry an ADDITIONAL
// separate stair opening a BRANCH: a short chain (1-3 sublevels) off the spine. Most branches DEAD-END; some
// are OPTIONAL QUEST-ROUTE branches (terminate for now — flagged for later content, NO content built here).
// Stairs are HONEST and NEVER labelled (which stair is the true descent is the player's to read).
//
// This is a POST-PROCESS on an existing world graph (TD_GEN.generate): the spine is the world's existing
// level-1..depth nodes (unchanged; each keys to sublevel "L"+level). addBranches() hangs branch sublevels
// (distinct `sub` ids, deeper `level` for danger-band, branch-marked edges) off a tunable fraction of levels.
// Same-level connectivity stays Model A. NOTHING here builds quest content, connectors, cipher glyphs, doom
// doors, the Ascent, elevators, portals, cross-edges, or false levels — all reserved.
//
// Classic script: assigns global TD_LATTICE. Deterministic per (seed).
var TD_LATTICE = (function () {
  var RNG = (typeof TD_RNG !== "undefined") ? TD_RNG : (typeof require !== "undefined" ? require("./rng.js") : null);

  // ---- TUNABLE KNOBS (FLAG: operator-tunable) ----
  var BRANCH_FRACTION = 1 / 3;   // ~1 in 3 spine levels get one extra stair -> a branch (FLAG)
  var BRANCH_MIN = 1, BRANCH_MAX = 3;   // a branch chain is 1..3 sublevels long (FLAG)
  var QUEST_ROUTE_CHANCE = 0.4;   // a branch is a QUEST_ROUTE (else a DEAD_END); both terminate for now (FLAG)
  var RICH_DEADEND_LOOT = true;   // FLAG (optional): a terminal DEAD_END floor draws one loot band richer, so
  //                                exploration isn't pure loss. Flag only — the loot band is read by the floor
  //                                composer/loot pass; this sets richLoot:true on the terminal node.

  // add branch sublevels to `world` (mutates + returns it). Deterministic per seed.
  function addBranches(world, seed, opts) {
    opts = opts || {};
    if (!world || !world.nodes || !world.edges || !RNG) return world;
    var rng = RNG.make(((seed >>> 0) ^ 0x1a7771ce) >>> 0 || 1);
    var frac = (opts.branchFraction != null) ? opts.branchFraction : BRANCH_FRACTION;
    var depth = 0; Object.keys(world.nodes).forEach(function (id) { depth = Math.max(depth, world.nodes[id].level || 0); });
    var branches = [];
    // an ANCHOR at level L: prefer the concourse hub_L; else the first ORDINARY (roomy, non-region, non-set-piece)
    // node at that level. Branches hang off the SPINE only.
    function anchorAt(L) {
      if (world.nodes["hub_" + L]) return "hub_" + L;
      var cands = Object.keys(world.nodes).filter(function (id) { var m = world.nodes[id]; return m.level === L && !m.sub && !m.nodeType && !m.dmz && !m.region && !m.vault; });
      return cands.length ? cands[0] : null;
    }
    for (var L = 1; L < depth; L++) {   // no branch off the deepest level (nothing deeper to branch toward)
      if (!rng.chance(frac)) continue;
      var anchor = anchorAt(L); if (!anchor) continue;
      // a branch goes DEEPER than its anchor but stays WITHIN the spine's depth range (it never runs past the
      // true bottom): cap the chain so branch levels are L+1..depth. Off the deepest eligible level this is 1.
      var len = Math.max(1, Math.min(rng.int(BRANCH_MIN, BRANCH_MAX), depth - L));
      var quest = rng.chance(QUEST_ROUTE_CHANCE);   // QUEST_ROUTE vs DEAD_END
      var prev = anchor, chain = [];
      for (var i = 1; i <= len; i++) {
        var bid = "branch_" + L + "_" + i, bsub = "br" + L + "_" + i, blevel = L + i;
        var terminal = (i === len);
        var nd = {
          level: blevel, sub: bsub, region: "branch", branchOf: L, branchKind: quest ? "quest" : "dead",
          title: "Level " + blevel + " — " + (quest ? "a Prospective Route" : "a Blind Pocket"),
          desc: quest ? "A stair the Bureau has not yet ruled upon. It goes somewhere; whether it goes anywhere is under review."
                      : "A stair that opens on more of the same, and then on nothing. The Bureau files it under 'amenity, aspirational'."
        };
        if (terminal) {
          nd.deadEnd = true;   // canon: dead-end pockets are FUTURE connector housing (CSRR/CRMC/Otis/Caspar) — FLAG only, no connectors
          if (quest) nd.questRoute = true;   // FLAG for later content (no content built)
          else if (RICH_DEADEND_LOOT) nd.richLoot = true;   // FLAG: terminal dead-ends draw one loot band richer
        }
        world.nodes[bid] = nd;
        // the extra stair OUT to the branch (branch-marked, so classifySublevelEdges realises it as a separate
        // stair at a room centre) + the return up-stair. Honest, unlabelled.
        world.edges.push({ id: "e_br_" + L + "_" + i, from: prev, to: bid, branch: true, label: "a side stair, going down" });
        world.edges.push({ id: "e_br_" + L + "_" + i + "_u", from: bid, to: prev, label: "the stair back" });
        chain.push(bid); prev = bid;
      }
      branches.push({ level: L, anchor: anchor, kind: quest ? "quest" : "dead", length: len, chain: chain });
    }
    world.lattice = { branches: branches, depth: depth, branchFraction: frac };
    return world;
  }

  // the SPINE path (sublevel ids start -> max depth): the true descent, "L"+level for each spine level.
  function spinePath(world) {
    var depth = 0; Object.keys(world.nodes).forEach(function (id) { depth = Math.max(depth, world.nodes[id].level || 0); });
    var path = []; for (var L = 1; L <= depth; L++) path.push("L" + L); return path;
  }

  var API = { addBranches: addBranches, spinePath: spinePath,
    BRANCH_FRACTION: BRANCH_FRACTION, BRANCH_MIN: BRANCH_MIN, BRANCH_MAX: BRANCH_MAX, QUEST_ROUTE_CHANCE: QUEST_ROUTE_CHANCE, RICH_DEADEND_LOOT: RICH_DEADEND_LOOT };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (typeof window !== "undefined") window.TD_LATTICE = API;
  return API;
})();
