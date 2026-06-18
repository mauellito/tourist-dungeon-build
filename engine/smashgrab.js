// Tourist Dungeon — TD_SMASHGRAB [v5]: a THROWAWAY §24 fun-test (sibling of TD_CONTRAPTION, NOT
// canon). As of GATE 1 this is a THIN STATEFUL WRAPPER: all the greed / weight / loot / collapse /
// slab / escape RESOLUTION lives in the pure TD_RESOLVE.SG module (engine/resolve.js); this file
// just holds the one live run's state for the browser host (play-map.html) and delegates every
// rule to TD_RESOLVE. The headless balance sim drives TD_RESOLVE.SG directly with its own states.
//
// FIREWALL: placeholder pickups only — no monsters/traps/swimming/secret-doors/economy/real temple.
"use strict";

var TD_SMASHGRAB = (function () {
  var R = TD_RESOLVE.SG;     // the pure resolution core — single source of truth
  var S = R.newState();
  var runs = 0;

  function enter(n) { runs += 1; S = R.newState(); S.active = true; S.runs = runs; return { tell: R.tell(n) }; }
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
