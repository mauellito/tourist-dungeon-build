// Tourist Dungeon — TD_CONTRAPTION: a THROWAWAY core-loop prototype (narrow firewall waiver,
// this round only). NOT canon, NOT the quest engine — expect it ripped out when the quest engine
// + canon arrive. One self-contained flag+timer answering ONE question: is trip -> manage ->
// progress fun in the hand? A lever by the dungeon mouth must be THROWN to open the descent; doing
// so opens a turn-WINDOW (the manageable consequence — race to the mouth before it re-seals) and
// prints one Bureau tell. No dependency on any other module. Classic script: assigns TD_CONTRAPTION.
"use strict";

var TD_CONTRAPTION = (function () {
  var ARM_TURNS = 22;                                   // the wicket stays open this many turns after a pull
  var state = { armed: false, armedAt: -1, pulls: 0 };
  function reset() { state.armed = false; state.armedAt = -1; state.pulls = 0; }
  function pull(turn) {                                  // throw the lever -> open the descent window, return the tell
    state.armed = true; state.armedAt = turn; state.pulls += 1;
    return "THE CONTRAPTION ENGAGES with a municipal clang. DESCENT AUTHORISED — the wicket holds open " + ARM_TURNS + " turns. Mind the interval.";
  }
  function open(turn) { return state.armed && (turn - state.armedAt) <= ARM_TURNS; }   // is the descent currently open?
  function remaining(turn) { return state.armed ? Math.max(0, ARM_TURNS - (turn - state.armedAt)) : 0; }
  function tick(turn) { if (state.armed && (turn - state.armedAt) > ARM_TURNS) { state.armed = false; state.armedAt = -1; return true; } return false; }   // true on the turn it re-seals
  return { ARM_TURNS: ARM_TURNS, reset: reset, pull: pull, open: open, remaining: remaining, tick: tick, armed: function () { return state.armed; }, _state: function () { return state; } };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_CONTRAPTION; }
