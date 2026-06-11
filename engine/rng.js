// Tourist Dungeon engine — seeded PRNG.
// Deterministic so generation is reproducible (tests pin seeds). Classic
// script: assigns the global TD_RNG. Norman remains the game's only TRUE
// random (bible §4.2); generation is deterministic by seed.
"use strict";

var TD_RNG = (function () {
  // mulberry32 — small, fast, deterministic 32-bit PRNG.
  function make(seed) {
    var a = seed >>> 0;
    function next() {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      // float in [0,1)
      next: next,
      // integer in [lo, hi] inclusive
      int: function (lo, hi) { return lo + Math.floor(next() * (hi - lo + 1)); },
      // true with probability p
      chance: function (p) { return next() < p; },
      // pick one element of arr
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; }
    };
  }
  return { make: make };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_RNG; }
