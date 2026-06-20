// Tourist Dungeon — TD_STATS: the TEN-STAT SPINE (combat track, build phase 1, R2).
// Pure, deterministic given a TD_RNG. Stats are stored INTERNALLY on a 1..1000 bell-curved scale
// (the Richter law: a human can be strong only relative to other humans) and are surfaced to the
// player as FEEL-WORDS ONLY — a threshold crossing emits a word; a number NEVER leaks (Disco
// Elysium law). Combat reads the DERIVED registry (internal numbers); the player never sees them.
//
// ALL MAGNITUDES ARE PLACEHOLDER — calibration is a later balance-sim pass. Do NOT hand-tune here.
// Structure ratified by character-canon-v1.3.md (the ten lanes, Lucky linear-from-neutral, the
// two-stage read, the stat->combat derived table); only the VALUES remain calibration-pending.
"use strict";

var TD_STATS = (function () {
  // the ten — Str renamed to MIGHT; GRIT is the 10th (mental resilience: fear/courage, illusion,
  // compulsion, madness — it resolves the old Willpower slot).
  var STATS = ["might", "dex", "con", "int", "per", "lucky", "intuition", "appearance", "charm", "grit"];
  var NAMES = {
    might: "Might", dex: "Dexterity", con: "Constitution", int: "Intellect", per: "Perception",
    lucky: "Lucky", intuition: "Intuition", appearance: "Appearance", charm: "Charm", grit: "Grit"
  };

  // ---- internal scale: 1..1000, bell-curved around ~500 (human range) ----
  function bell(rng) { var s = 0, n = 3; for (var i = 0; i < n; i++) s += rng.next(); return Math.max(1, Math.min(1000, Math.round((s / n) * 1000))); }
  // GATE 4 R1 — a rolled character needs a real SPREAD: peaks and valleys, not a uniform middle. The
  // 3-sample bell clusters ~340-660 (every stat reads "sturdy/strong"); STRETCH it around 500 so stats
  // span the feel range and a build's strengths/weaknesses are legible. Still a bell around 500 (canon),
  // just wider. SPREAD is what makes Dex/Might/Con visibly DECIDE combat.
  var SPREAD = 1.7;
  function roll(rng) { return Math.max(1, Math.min(1000, Math.round(500 + (bell(rng) - 500) * SPREAD))); }
  function create(rng) { var st = {}; for (var i = 0; i < STATS.length; i++) st[STATS[i]] = roll(rng); return st; }
  function clamp(v) { return Math.max(1, Math.min(1000, v)); }

  // ---- FEEL-WORDS (player surface). Six tiers; thresholds PLACEHOLDER on 1..1000. ----
  var BANDS = [1, 170, 330, 500, 670, 840];                 // tier i = highest band <= value
  function tier(v) { var t = 0; for (var i = 0; i < BANDS.length; i++) if (v >= BANDS[i]) t = i; return t; }
  var FEEL = {
    might:      ["feeble", "slight", "sturdy", "strong", "powerful", "titanic"],
    dex:        ["clumsy", "stiff", "steady", "nimble", "deft", "uncanny"],
    con:        ["frail", "delicate", "hale", "tough", "hardy", "ironclad"],
    int:        ["dim", "plain", "sharp", "clever", "brilliant", "luminous"],
    per:        ["oblivious", "dull", "attentive", "keen", "piercing", "all-seeing"],
    lucky:      ["cursed", "unlucky", "even", "fortunate", "blessed", "fated"],
    intuition:  ["clueless", "uncertain", "sensible", "intuitive", "prescient", "oracular"],
    appearance: ["wretched", "plain", "presentable", "handsome", "striking", "resplendent"],
    charm:      ["off-putting", "awkward", "affable", "charming", "magnetic", "mesmerizing"],
    grit:       ["fragile", "timid", "composed", "steadfast", "unshakable", "adamant"]
  };
  // the ONLY player-facing read of a stat — a word, never a number.
  function feel(stat, value) { var f = FEEL[stat] || FEEL.might; return f[Math.min(f.length - 1, tier(value))]; }
  // a whole-sheet surface: feel-words only (used by the UI; a test asserts it leaks no digit).
  function surface(stats) { var out = []; for (var i = 0; i < STATS.length; i++) { var k = STATS[i]; out.push({ stat: k, name: NAMES[k], word: feel(k, stats[k]) }); } return out; }
  // did a value change cross a feel-word threshold? (growth-by-deeds emits a word, not a number)
  function crossed(stat, oldV, newV) { var a = tier(oldV), b = tier(newV); return a === b ? null : feel(stat, newV); }

  // ---- LUCKY: the universal thumb on EVERY roll. Human range is bounded to +/-10%; a supernatural
  // overflow (a blessing/curse beyond the human ceiling) may exceed it via the `overflow` term. ----
  function luckyThumb(stats, overflow) {
    var human = ((stats.lucky - 500) / 500) * 0.10;          // lucky 1..1000 -> [-0.10, +0.10]
    human = Math.max(-0.10, Math.min(0.10, human));
    return human + (overflow || 0);                          // supernatural overflow rides on top
  }

  // ---- DERIVED-EFFECT REGISTRY (INTERNAL numbers; never shown). PLACEHOLDER formulas. ----
  // Each is a pure function of the stat block. Combat (TD_RESOLVE) reads these.
  var DERIVED = {
    damageBonus: function (s) { return Math.round((s.might - 500) / 60); },     // Might -> damage
    carry:       function (s) { return 100 + Math.round((s.might - 500) / 5); },// Might -> carry (lbs, stub)
    accuracy:    function (s) { return Math.round((s.dex - 500) / 25); },       // Dex -> accuracy
    evasion:     function (s) { return Math.round((s.dex - 500) / 30); },       // Dex -> evasion
    hpMax:       function (s) { return 100 + Math.round((s.con - 500) / 8); },  // Con -> HP
    resilience:  function (s) { return Math.round((s.con - 500) / 40); },       // Con -> physical resilience
    mindResist:  function (s) { return Math.round((s.grit - 500) / 20); },      // Grit -> fear/illusion/compulsion resist
    perceive:    function (s) { return s.per; },                                // Per -> what is delivered to senses
    interpret:   function (s) { return s.intuition; },                          // Intuition -> how it is read (SUBJ)
    learn:       function (s) { return Math.round((s.int - 500) / 30); },       // Int -> learning/arcana (stub)
    rapport:     function (s) { return Math.round((s.charm - 500) / 25); },     // Charm -> transactions/talk-outs (stub)
    regard:      function (s) { return Math.round((s.appearance - 500) / 25); } // Appearance -> first impressions (stub)
  };
  function derive(stats) { var d = {}; for (var k in DERIVED) d[k] = DERIVED[k](stats); return d; }

  // ---- GROWTH-BY-DEEDS (scaffold only; no XP bar; realized on REST). PLACEHOLDER. ----
  function newProgress() { return {}; }
  function recordDeed(prog, stat, amount) { if (STATS.indexOf(stat) >= 0) prog[stat] = (prog[stat] || 0) + (amount || 1); return prog; }
  // realize accumulated deeds into the stats on rest; returns any feel-words that were crossed.
  function realizeOnRest(stats, prog, capPerStat) {
    var cap = capPerStat || 8, words = [];                   // PLACEHOLDER growth rate
    for (var k in prog) { if (STATS.indexOf(k) < 0) continue; var gain = Math.min(cap, Math.round(prog[k]));
      if (gain > 0) { var ov = stats[k]; stats[k] = clamp(stats[k] + gain); var w = crossed(k, ov, stats[k]); if (w) words.push({ stat: k, word: w }); } }
    return words;                                            // emit words, never numbers
  }

  return {
    STATS: STATS, NAMES: NAMES, BANDS: BANDS, FEEL: FEEL,
    create: create, bell: bell, tier: tier, feel: feel, surface: surface, crossed: crossed,
    luckyThumb: luckyThumb, DERIVED: DERIVED, derive: derive,
    newProgress: newProgress, recordDeed: recordDeed, realizeOnRest: realizeOnRest
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_STATS; }
