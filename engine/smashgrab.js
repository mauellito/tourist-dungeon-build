// Tourist Dungeon — TD_SMASHGRAB [v5]: the host wrapper for the §24 CHASM SET-PIECE (now CANON, not a
// throwaway). A THIN STATEFUL WRAPPER: all the greed / weight / loot / collapse / slab / escape RESOLUTION
// lives in the pure TD_RESOLVE.SG module (engine/resolve.js); this file holds the one live run's state for
// the browser host (play-map.html) and delegates every rule to TD_RESOLVE. enter() flips the per-state
// set-piece footrace rate (S.setpiece) — the dramatic chase. The headless balance sim drives TD_RESOLVE.SG
// directly with its own (generic-rate) states.
//
// SCOPE: pedestals + loot + the collapse/slab footrace + the A/B pedestal CHOICE hook (the doom-door layer
// reads sgChoice). Monsters/traps inside the floor stay firewalled until ruled.
"use strict";

var TD_SMASHGRAB = (function () {
  var R = TD_RESOLVE.SG;     // the pure resolution core — single source of truth
  var S = R.newState();
  var runs = 0;

  function enter(n) { runs += 1; S = R.newState(); S.active = true; S.runs = runs; S.setpiece = true; return { tell: R.tell(n) }; }   // CANON SET-PIECE: the live §24 uses the strong footrace rate (the calibrated sim harness keeps the generic rate)
  function leave() { if (S) S.active = false; }
  function active() { return !!(S && S.active); }
  function over() { return R.over(S); }

  return {
    TUNE: R.TUNE,            // same object the sim/tests tune (single source of truth)
    enter: enter, leave: leave, active: active, over: over,
    move: function (dir) { return R.move(S, dir); },
    get: function () { return R.get(S); },
    trip: function () { return R.trip(S); },
    view: function () { return R.view(S); },
    _state: function () { return S; }
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_SMASHGRAB; }
