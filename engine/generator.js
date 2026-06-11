// Tourist Dungeon engine — the cyclic dungeon generator.
// Emits the checker's world-graph model directly (the generator->checker
// contract, REQ-09). Builds a layer-cake of levels threaded by cross-level
// cycles whose return arcs ascend into SEALED POCKETS (REQ-02/03), with
// depth-unlocks-breadth tokens (REQ-04), a knowledge-key express shortcut
// (REQ-05), one-way arcs telegraphed by objective signals (REQ-06/LAW-7), and
// an exclusion fork at the (non-revisitable) entrance (REQ-01: exclusion tree
// over cyclic space). Structure guarantees all six obligations BY
// CONSTRUCTION; tests verify it on every seed.
//
// Classic script: assigns the global TD_GEN. Requires TD_RNG.
"use strict";

var TD_GEN = (function () {

  // Bureau-voice flavor pools (badly-translated municipal). Display only.
  var VESTIBULE_NAMES = ["the Left Cloakroom", "the Right Cloakroom", "the Damp Antechamber", "the Lost-and-Fond"];
  var POCKET_NAMES = ["a Sealed Oratory", "a Forgotten Mezzanine", "a Walled Pantry", "an Unlisted Vault"];
  var GOAL_NAMES = ["the Stamping Office", "the Hall of Mild Peril", "the Sub-Registry", "the Deeper Interior"];
  var DRAFT_LINES = [
    "A cold draft slides from a seam in the wall.",
    "Air moves where the map insists there is only stone.",
    "Somewhere above, a door you cannot see is breathing."
  ];

  function generate(seed, opts) {
    opts = opts || {};
    var rng = TD_RNG.make((seed >>> 0) || 1);

    // ---- tunable parameters (Phase 3 surface) -----------------------------
    var depth = opts.depth || rng.int(3, 4);             // number of levels
    var arrivalDay = opts.arrival_day || rng.int(1, 365);
    var withExpress = opts.express != null ? opts.express : rng.chance(0.6);   // knowledge key
    var annexChance = opts.annex_chance != null ? opts.annex_chance : 0.5;     // depth-unlocks-breadth
    var withVestibuleFork = opts.vestibule_fork != null ? opts.vestibule_fork : true; // exclusion root
    var withPortal = opts.portal != null ? opts.portal : rng.chance(0.25);     // calendar window
    var sideLoops = opts.side_loops != null ? opts.side_loops : 0;             // intra-level loops (loop-feel)
    var sideLoopChance = opts.side_loop_chance != null ? opts.side_loop_chance : 0.5;

    var nodes = {};
    var edges = [];
    var signals = {};

    function node(id, o) { nodes[id] = o || {}; }
    function edge(o) { edges.push(o); return o; }
    function objSignal(id, edgeId, text) { signals[id] = { channel: "OBJ", telegraphs: edgeId, text: text }; }

    // ---- entrance ---------------------------------------------------------
    node("entrance", { level: 0, title: "The Mouth of the Dungeon",
      desc: "A municipal turnstile, a faded brochure rack, and the smell of obligation. Beyond it, the commute begins." });

    // exclusion fork at the entrance (non-revisitable => a genuine world choice)
    var hub1 = "hub_1";
    if (withVestibuleFork) {
      var vaName = rng.pick(VESTIBULE_NAMES);
      var vbName = rng.pick(VESTIBULE_NAMES.filter(function (n) { return n !== vaName; }));
      node("vestibule_a", { level: 1, title: vaName, desc: "One of two cloakrooms. You may take exactly one; the turnstile does not reverse." });
      node("vestibule_b", { level: 1, title: vbName, desc: "The other cloakroom. Choosing it forecloses the first, forever." });
      var eVA = edge({ id: "e_vest_a", from: "entrance", to: "vestibule_a", one_way: true, label: "Take " + vaName + " (one-way).", grants: ["souvenir_left"] });
      var eVB = edge({ id: "e_vest_b", from: "entrance", to: "vestibule_b", one_way: true, label: "Take " + vbName + " (one-way).", grants: ["souvenir_right"] });
      objSignal("sig_vest_a", "e_vest_a", "Behind you the turnstile settles with a click. It will not open from this side.");
      objSignal("sig_vest_b", "e_vest_b", "Behind you the turnstile settles with a click. It will not open from this side.");
      edge({ id: "e_va_hub1", from: "vestibule_a", to: hub1, label: "Proceed onto Level 1." });
      edge({ id: "e_vb_hub1", from: "vestibule_b", to: hub1, label: "Proceed onto Level 1." });
    } else {
      edge({ id: "e_enter", from: "entrance", to: hub1, label: "Step onto Level 1." });
    }

    // ---- levels: hubs, goals -------------------------------------------------
    for (var L = 1; L <= depth; L++) {
      node("hub_" + L, { level: L, title: "Level " + L + " — the Concourse",
        desc: "A junction of corridors, evenly disappointed in all directions." });
      var goalName = GOAL_NAMES[(L - 1) % GOAL_NAMES.length];
      node("goal_" + L, { level: L, required: true, title: "Level " + L + " — " + goalName,
        desc: "The business of this level. A stamp, a sub-registry, a thing to be done." });
      edge({ id: "e_goal_" + L, from: "hub_" + L, to: "goal_" + L, label: "Attend to " + goalName + "." });
    }

    // ---- cross-level cycles: descent, sealed-pocket return, breadth -------
    for (var D = 1; D < depth; D++) {
      var up = D, down = D + 1;
      // descend from this level's goal; descending grants the breadth token
      edge({ id: "e_down_" + up, from: "goal_" + up, to: "hub_" + down,
        grants: ["token_" + up], label: "Descend the shaft to Level " + down + "." });

      // sealed pocket on the UPPER level, reachable only from below (one-way up)
      var pocketName = POCKET_NAMES[(up - 1) % POCKET_NAMES.length];
      node("pocket_" + up, { level: up, required: true, title: "Level " + up + " — " + pocketName,
        desc: "A pocket of the level above, sealed from its own floor. You arrived from beneath it." });
      var eRet = edge({ id: "e_return_" + up, from: "hub_" + down, to: "pocket_" + up, one_way: true,
        label: "Follow the cold draft up a hidden stair (one-way).", desc: "The stair only goes up, and only once." });
      objSignal("sig_draft_" + up, "e_return_" + up, rng.pick(DRAFT_LINES));
      edge({ id: "e_pocket_out_" + up, from: "pocket_" + up, to: "hub_" + up,
        label: "Climb back down to the Level " + up + " concourse." });

      // depth-unlocks-breadth: an upper annex gated by the token from going deeper
      if (rng.chance(annexChance)) {
        node("annex_" + up, { level: up, title: "Level " + up + " — a Newly-Pertinent Annex",
          desc: "A door that meant nothing until you had been deeper. Now it opens." });
        edge({ id: "e_breadth_" + up, from: "hub_" + up, to: "annex_" + up, requires: ["token_" + up],
          label: "Open the annex (needs what the depths granted)." });
      }
    }

    // ---- intra-level side loops (optional spatial loops; loop-feel only) ---
    // Two-way, optional, attached to a revisitable hub: adds genuine cycles
    // without adding required content or stranding anything.
    for (var SL = 1; SL <= depth; SL++) {
      for (var si = 0; si < sideLoops; si++) {
        if (!rng.chance(sideLoopChance)) continue;
        var la = "loop_" + SL + "_" + si + "_a", lb = "loop_" + SL + "_" + si + "_b";
        node(la, { level: SL, title: "Level " + SL + " — a Looping Gallery", desc: "A corridor that returns to where it began, eventually." });
        node(lb, { level: SL, title: "Level " + SL + " — the Far Turn", desc: "The far side of the loop, where something might be behind you." });
        edge({ id: "e_" + la, from: "hub_" + SL, to: la, label: "Wander the looping gallery." });
        edge({ id: "e_" + la + "_b", from: la, to: lb, label: "Round the far turn." });
        edge({ id: "e_" + lb + "_hub", from: lb, to: "hub_" + SL, label: "Return to the concourse." });
      }
    }

    // ---- knowledge-key express shortcut (always-open; informational gate) --
    if (withExpress && depth >= 2) {
      var k = rng.int(2, depth);
      edge({ id: "e_express", from: "entrance", to: "hub_" + k,
        label: "Order the right drink and take the express to Level " + k + ".",
        desc: "The route always existed. Knowing the order is the key (a knowledge key — it crosses the grave)." });
    }

    // ---- optional calendar portal (windowed, with an idle/wait self-arc) ---
    if (withPortal) {
      var lo = Math.min(arrivalDay + 2, 364);
      var hi = Math.min(lo + 5, 365);
      node("portal", { level: 1, title: "Level 1 — a Once-in-a-While Portal",
        desc: "A door that is only a door on the right days." });
      edge({ id: "e_wait", from: "hub_1", to: "hub_1", label: "Wait a day at the concourse." });
      edge({ id: "e_portal", from: "hub_1", to: "portal", window: [lo, hi],
        label: "Step through the portal (only open days " + lo + "–" + hi + ").",
        desc: "Calendar omens permitting." });
    }

    var world = {
      start: "entrance",
      year_length: 365,
      arrival_day: arrivalDay,
      meta: { seed: (seed >>> 0) || 1, depth: depth, express: !!(withExpress && depth >= 2),
        vestibule_fork: !!withVestibuleFork, portal: !!withPortal, side_loops: sideLoops,
        generator: "TD_GEN/0.1" },
      nodes: nodes,
      edges: edges,
      signals: signals
    };
    return world;
  }

  return { generate: generate };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_GEN; }
