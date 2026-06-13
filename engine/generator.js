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

  // v19 R2 — REMOTE UNLOCKS ON THE LATTICE. Each is a state-conditional edge: a
  // placed MECHANISM node (visiting it grants a STATIC condition flag) and a placed
  // LOCKED node (a door that requires that flag), both two-way to the level hub, and
  // an omen that telegraphs the door (graded by its tell — draft = faint, hollow =
  // nearer, rhyme = a legible clue). The flag is pure lattice topology, exactly like
  // the depth-unlocks-breadth token; NOTHING here keys to the calendar, economy, or a
  // permit/horoscope SYSTEM — those stay firewalled. The flavours that NAME such
  // systems (permit, exact-change, horoscope) read their condition off a placed node
  // you visit, with the real system left as a FUTURE HOOK (see the divination canon).
  // `tell` is a key into TD_VAULTS.TELLS — the one tell vocabulary; never invent one.
  var UNLOCKS = [
    { key: "closet",    tell: "hollow",
      mechTitle: "A Maintenance Recess", mechDesc: "A recess with a numbered hook and a key that is, against all municipal odds, present. You pocket it.",
      doorTitle: "The Impenetrable Closet", doorDesc: "The closet that would not open now obliges, the borrowed key turning with a grudge.",
      omen: "Your knuckles find a hollow note in a closet door three corridors back." },
    { key: "lever",     tell: "rhyme",
      mechTitle: "The Lever Room", mechDesc: "A lever, helpfully labelled for a door it does not adjoin. You throw it; something distant gives.",
      doorTitle: "The Lever-Sprung Door", doorDesc: "The door the far lever governs, now sprung ajar and faintly resentful about it.",
      omen: "A scratched couplet by the stair rhymes a lever with a door it cannot see." },
    { key: "ghost",     tell: "draft",
      mechTitle: "A Witnessed Vigil", mechDesc: "A cold spot, a register of names, and the expectation that you sign. Witnessed, the cold relents.",
      doorTitle: "The Ghost Door", doorDesc: "A door that was only ever shut by a draft; witnessed, the draft has gone elsewhere.",
      omen: "A cold draft slides from a door that the map swears is solid." },
    { key: "well",      tell: "draft",
      mechTitle: "The Overpaid Well", mechDesc: "A wishing-well with a posted minimum and a grateful echo for anyone who exceeds it. You overpay.",
      doorTitle: "The Well-Obliged Grate", doorDesc: "A grate that opens, the notice says, only to the conspicuously generous. You qualified.",
      omen: "Air moves, coin-cold, from a grate near the overpaid well." },
    { key: "permit",    tell: "rhyme",
      mechTitle: "The Permit Counter", mechDesc: "A counter, a stamp, and a form already three-quarters complete. Stamped, it is suddenly a credential.",
      doorTitle: "The Permit Door", doorDesc: "The door that admits only the permitted. Your stamp, fresh, is grudgingly accepted.",
      omen: "A scratched line by the door cites a permit number you have only just earned." },
    { key: "change",    tell: "hollow",
      mechTitle: "The Change Machine", mechDesc: "A machine that makes change and, with a hollow clunk, a particular exact-change you did not know you needed.",
      doorTitle: "The Exact-Change Door", doorDesc: "A turnstile insisting on exact change. You have, improbably, exact change.",
      omen: "A hollow clunk answers your knock on the exact-change door." },
    { key: "horoscope", tell: "rhyme",
      mechTitle: "The Posted Horoscope", mechDesc: "A horoscope, posted and undated, whose reading happens to concern a door. You read it; it reads back.",
      doorTitle: "The Horoscope Door", doorDesc: "A door the posted reading favours. (The calendar that would truly govern it is not yet wired.)",
      omen: "A scratched couplet under the horoscope rhymes your sign with a nearby door." },
    { key: "patron",    tell: "draft",
      mechTitle: "A Patron's Confidence", mechDesc: "A patron, leaning, who tells you a thing about a door in exchange for nothing you will miss.",
      doorTitle: "The Tipped-Off Door", doorDesc: "The door the patron meant — you would never have found it, and now cannot un-know it.",
      omen: "A draft, and a patron's muttered hint, point the same way at once." },
    { key: "scratched", tell: "rhyme",
      mechTitle: "The Scratched Name", mechDesc: "A name scratched into the plaster, and the strong sense it is a password as much as a memorial.",
      doorTitle: "The Scratched-Name Door", doorDesc: "A door that answers to a name. You have, lately, learned the name.",
      omen: "A scratched name by the lintel rhymes, unmistakably, with this door." }
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

    // ---- vault splice (DCSS conceit): hand-authored rooms hung off a
    // revisitable hub by a two-way edge — obligation-safe BY CONSTRUCTION (the
    // same shape as the side loops). When the checker is loaded, it RULES the
    // result: a splice that would fail any of the six obligations is rejected
    // and placement retried (bounded), then skipped. --------------------------
    var vaultsOn = (opts.vaults !== false) && (typeof TD_VAULTS !== "undefined");
    var vaultChance = opts.vault_chance != null ? opts.vault_chance : 0.6;
    function curWorld() { return { start: "entrance", year_length: 365, arrival_day: arrivalDay, meta: { seed: 0 }, nodes: nodes, edges: edges, signals: signals }; }
    function pickVault(pool) {
      var total = pool.reduce(function (s, v) { return s + (v.rarity || 0.5); }, 0);
      var r = rng.next() * total;
      for (var i = 0; i < pool.length; i++) { r -= (pool[i].rarity || 0.5); if (r <= 0) return pool[i]; }
      return pool[pool.length - 1];
    }
    // A vault is hung off a revisitable hub by a two-way edge — the same shape
    // as the side loops, which are obligation-safe BY CONSTRUCTION (reachable,
    // escapable, optional, no requires/grants/windows on the splice edges). So we
    // do NOT pay a full six-obligation verify per splice (that proof is costly
    // with the calendar/flag search). Instead the checker RULES THE RESULT once,
    // at the end: if the finished dungeon would fail any obligation, every vault
    // is rolled back (the dungeon ships clean). In practice the rollback never
    // fires; the per-seed obligation tests prove it.
    function placeVault(v, L, idx) {
      var nid = "vault_" + L + "_" + idx, hub = "hub_" + L;
      if (!nodes[hub] || nodes[nid]) return false;
      node(nid, { level: L, title: v.title, vault: v.id, tags: (v.tags || []).slice(), required: !!v.required,
        desc: "A spliced room: " + v.title + "." });
      edge({ id: "e_vin_" + nid, from: hub, to: nid, label: "Step into " + v.title + "." });
      edge({ id: "e_vout_" + nid, from: nid, to: hub, label: "Leave " + v.title + ", back to the concourse." });
      return true;
    }
    function rollbackVaults() {
      Object.keys(nodes).forEach(function (n) { if (nodes[n].vault) delete nodes[n]; });
      edges = edges.filter(function (e) { return !/^e_v(in|out)_/.test(e.id); });
    }
    if (vaultsOn) {
      var placed = 0;
      for (var VL = 1; VL <= depth; VL++) {
        var pool = TD_VAULTS.forLevel(VL);
        if (!pool.length) continue;
        // v18 R3 (outcome #4): a vault EVERY level. Guarantee one per level
        // (was a per-level coin-flip, so levels often had none); a second is
        // still rolled for. Splices are obligation-safe by construction (a
        // two-way hub annex), and the end-of-build checker rules the result.
        var howMany = 1 + (rng.chance(vaultChance) ? 1 : 0);
        for (var vk = 0; vk < howMany; vk++) {
          if (placeVault(pickVault(pool), VL, placed)) placed++;
        }
      }
      // the checker rules the result: one verify for the finished dungeon
      if (placed && !opts.skip_vault_check && typeof TD_CHECK !== "undefined" && !TD_CHECK.verify(curWorld()).pass) rollbackVaults();
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

    // ---- v19 R2 — REMOTE UNLOCKS: one state-conditional unlock per dungeon level.
    // The mechanism node grants a STATIC condition flag; the locked door requires it;
    // an omen telegraphs the (consequential) locked edge so no signal is orphaned and
    // no door is untelegraphed. The Phase 5.5 irrelevant-flag collapse keeps these
    // cheap — each cond_* gates only its own optional, two-way closet.
    var unlockFlavours = [];                          // for meta/render: per-level flavour + edges
    for (var UL = 1; UL <= depth; UL++) {
      var uf = UNLOCKS[((seed >>> 0) + UL) % UNLOCKS.length];
      var cond = "cond_" + uf.key + "_" + UL;
      var mechId = "unlock_" + uf.key + "_" + UL, lockId = "locked_" + uf.key + "_" + UL;
      node(mechId, { level: UL, region: "discontinued", title: "Level " + UL + " — " + uf.mechTitle, desc: uf.mechDesc });
      node(lockId, { level: UL, region: "discontinued", title: "Level " + UL + " — " + uf.doorTitle, desc: uf.doorDesc });
      edge({ id: "e_mech_in_" + uf.key + "_" + UL, from: "hub_" + UL, to: mechId, grants: [cond],
        label: "See to " + uf.mechTitle + " (the condition for a door elsewhere on this level)." });
      edge({ id: "e_mech_out_" + uf.key + "_" + UL, from: mechId, to: "hub_" + UL, label: "Back to the Level " + UL + " concourse." });
      var lockEdge = "e_lock_in_" + uf.key + "_" + UL;
      edge({ id: lockEdge, from: "hub_" + UL, to: lockId, requires: [cond],
        label: "Open " + uf.doorTitle + " — its condition is now met." });
      edge({ id: "e_lock_out_" + uf.key + "_" + UL, from: lockId, to: "hub_" + UL, label: "Leave " + uf.doorTitle + "." });
      signals["sig_unlock_" + uf.key + "_" + UL] = { channel: "OBJ", telegraphs: lockEdge, text: uf.omen, tell: uf.tell };
      unlockFlavours.push({ level: UL, key: uf.key, locked_edge: lockEdge, mech_edge: "e_mech_in_" + uf.key + "_" + UL, tell: uf.tell });
    }

    // ---- v20 R1 — DMZ VAULTS: one SALOON per level (a one-way swinging door from the
    // hub leads IN; a back door leaves — so every path is always offered a refuge) plus
    // one dungeon CAFETERIA. Demilitarised: no hostile action resolves inside (a runtime
    // invariant enforced in mapmode, asserted by the map suite). Bartender + patron are
    // STATIC sign-text occupants — no voice runtime, no calendar/economy. Entry
    // announces by node title (the play-map banner). The one-way strands nothing: the
    // back door returns to the hub, so reachability and no_unsignaled_unwinnable hold.
    var SALOON_SIGN = "Posted in three languages and a fourth that is only underlining: NO DISPUTES PAST THIS THRESHOLD. The management is not asking.";
    var SALOONS = [
      { name: "The Wary Tap-Room",
        bartender: "The barkeep wipes a glass he has wiped before, and will wipe again, and allows that you may sit.",
        patron: "A regular, not looking up: “In here nobody wants nothing from nobody. That is the entire point of the place.”" },
      { name: "The Last Civil Word",
        bartender: "The proprietor sets down a coaster the way another would set down terms.",
        patron: "Someone in the corner: “You leave it at the door or you leave. Those are the two doors.”" },
      { name: "The Disinterested Party",
        bartender: "The bartender has heard it, whatever it is, and pours regardless.",
        patron: "A patron, mildly: “Take the weight off. Take the grudge off too, it does not drink for free.”" },
      { name: "The Demilitarised Lounge",
        bartender: "A steward in a clean apron, neutral as Switzerland and twice as well-pressed.",
        patron: "An old hand: “Everybody is somebody's trouble out there. Not in here. In here you are just thirsty.”" },
      { name: "The Truce on Tap",
        bartender: "The keeper nods at the rule on the wall, then at you, in that order.",
        patron: "A drinker, comfortable: “Best-run room on the level. Nothing happens. That is the amenity.”" }
    ];
    for (var SL = 1; SL <= depth; SL++) {
      var sf = SALOONS[((seed >>> 0) + SL) % SALOONS.length];
      var sid = "saloon_" + SL;
      node(sid, { level: SL, dmz: "saloon", region: "discontinued", title: "Level " + SL + " — " + sf.name,
        desc: sf.bartender + " " + sf.patron + " " + SALOON_SIGN });
      edge({ id: "e_saloon_in_" + SL, from: "hub_" + SL, to: sid, one_way: true,
        label: "Push through the swinging door into " + sf.name + " (it does not swing back)." });
      edge({ id: "e_saloon_out_" + SL, from: sid, to: "hub_" + SL,
        label: "Leave by the back, onto the Level " + SL + " concourse." });
    }
    node("cafeteria", { level: depth, dmz: "cafeteria", region: "discontinued", title: "The Subterranean Cafeteria",
      desc: "Trays, a steam-table, and a hush with no edge to it. A dinner-lady presides over the only warm food in the dungeon. " +
            "Posted by the trays: SEATING IS NEUTRAL GROUND. SETTLE NOTHING AT THE TABLES. " + SALOON_SIGN });
    edge({ id: "e_caf_in", from: "hub_" + depth, to: "cafeteria", one_way: true,
      label: "Duck into the Cafeteria (the door sighs shut behind you)." });
    edge({ id: "e_caf_out", from: "cafeteria", to: "hub_" + depth, label: "Leave the Cafeteria, back to the concourse." });

    // ---- v19 R1 — STAIR LATTICE: the legible SPINE vs the DISCONTINUED regions,
    // and one Bureau OFFICE per level (static set dressing — door, sign, a posted
    // closure notice as FIXED flavour; calendar-driven closure stays firewalled). -
    function regionOf(id) {
      if (id === "entrance" || /^vestibule_/.test(id) || /^hub_/.test(id) || /^goal_/.test(id)) return "spine";
      return "discontinued";                                // pockets, annexes, loops, vaults, portal, offices — off the spine
    }
    Object.keys(nodes).forEach(function (n) { if (nodes[n].region == null) nodes[n].region = regionOf(n); });
    // one advertised office per dungeon level, in the discontinued region, reachable
    // from the hub on FIRST ARRIVAL (a plain two-way edge — no key, no descent).
    // Almost always CLOSED, with a specific STATIC reason (no calendar logic).
    var CLOSURE = [
      "Out to lunch. (Undated.)",
      "Closed DUE to inspection.",
      "Closed for bereavement; consult the obituary register.",
      "Back shortly. The notice declines to say from when.",
      "Closed pending the outcome of a prior closure."
    ];
    for (var OL = 1; OL <= depth; OL++) {
      var oid = "office_" + OL;
      node(oid, { level: OL, office: true, region: "discontinued",
        title: "Level " + OL + " — the Bureau Office",
        desc: "The level's Office, as advertised — a door, a sign, and posted upon it: “" + CLOSURE[(OL - 1) % CLOSURE.length] + "”" });
      edge({ id: "e_office_in_" + OL, from: "hub_" + OL, to: oid, label: "Step off the main way to the Level " + OL + " Office." });
      edge({ id: "e_office_out_" + OL, from: oid, to: "hub_" + OL, label: "Leave the Office, back to the concourse." });
    }
    nodes.entrance.desc = (nodes.entrance.desc || "") + " A posted notice: “For your convenience, an Office is maintained on every level.”";

    var world = {
      start: "entrance",
      year_length: 365,
      arrival_day: arrivalDay,
      meta: { seed: (seed >>> 0) || 1, depth: depth, express: !!(withExpress && depth >= 2),
        vestibule_fork: !!withVestibuleFork, portal: !!withPortal, side_loops: sideLoops,
        offices: depth, unlocks: unlockFlavours, dmz: { saloons: depth, cafeteria: true }, generator: "TD_GEN/0.2-lattice" },
      nodes: nodes,
      edges: edges,
      signals: signals
    };
    return world;
  }

  return { generate: generate };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_GEN; }
