// Tourist Dungeon — TD_BURDEN: PURE encumbrance + coin-weight (combat track, burden pass).
// Computes carried WEIGHT + BULK against caps, returns the canon BAND as a FEEL-WORD (the player
// sees "you are Strained," never the numbers). Consumes the item weight/bulk fields already on
// weapons/armour (TD_RESOLVE.GEAR) and the Might->carry derived effect (TD_STATS). Coins carry
// weight at 25/lb, denomination-blind — so all-gold is the lightest way to hold a given value.
//
// PURE MODULE ONLY this pass — NO descent-controller / play-map wiring (that seam is GATED). Non-
// canon VALUES are PLACEHOLDER (the balance-sim calibrates). Canon: bands at 50/75/100% of cap;
// coins 25/lb; Type dimension DEFERRED (weight + bulk only). Assigns global TD_BURDEN.
"use strict";

var TD_BURDEN = (function () {
  // ---- canon constants ----
  var COINS_PER_LB = 25;                 // canon: 25 coins per pound, any denomination (equal weight)
  var COIN_VALUE = { copper: 1, silver: 10, gold: 100 };   // 1 gold = 10 silver = 100 copper (value, not weight)
  // bands at 50/75/100% of cap (canon §4); speeds ride the energy model (PLACEHOLDER magnitudes)
  var BANDS = [
    { key: "unencumbered", word: "Unencumbered", maxFrac: 0.50, speed: 100 },
    { key: "laden",        word: "Laden",        maxFrac: 0.75, speed: 85 },
    { key: "strained",     word: "Strained",     maxFrac: 1.00, speed: 70 },   // senses dulled (Intuition tie)
    { key: "overloaded",   word: "Overloaded",   maxFrac: Infinity, speed: 50 } // combat penalties
  ];
  var BULK_CAP = 40;                     // PLACEHOLDER pack-space cap (extension tiers — bandolier/pack/frame — DEFERRED)

  // ---- coins (denomination-blind weight; value differs) ----
  function purseCoins(p) { p = p || {}; return (p.copper || 0) + (p.silver || 0) + (p.gold || 0); }
  function purseWeight(p) { return purseCoins(p) / COINS_PER_LB; }                 // lbs
  function purseValue(p) { p = p || {}; return (p.copper || 0) * COIN_VALUE.copper + (p.silver || 0) * COIN_VALUE.silver + (p.gold || 0) * COIN_VALUE.gold; }
  function coinWeight(nCoins) { return (nCoins || 0) / COINS_PER_LB; }

  // ---- the WEIGHT READOUT (object mass is numeric-OK; the burden BAND stays a feel-word). The coin is
  // the in-world unit of MASS: 25 coins = 1 lb, so a 1-lb dagger reads "25". One derivation — massCoins —
  // feeds BOTH per-item and running-total figures; the purse weighs itself by the very same rule
  // (N coins weigh N/25 lb -> massCoins == N, so a purse reads its own count). 1 stone = 350 coins = 14 lb.
  var COINS_PER_STONE = 350;
  function massCoins(lb) { return Math.round((lb || 0) * COINS_PER_LB); }          // weight (lb) -> coin-mass (THE derivation)
  function itemMassCoins(it) { return massCoins((it && it.weight) || 0); }
  // format a coin-mass figure for the dossier: LEAD WITH STONE at >= 1 stone ("4 stone, 25"); under a
  // stone, bare coins ("25"). Plain digits (the glyph-numeral styling is a PINNED future pass).
  function massLabel(coins) {
    coins = Math.round(coins || 0);
    if (coins >= COINS_PER_STONE) { var st = Math.floor(coins / COINS_PER_STONE), rem = coins - st * COINS_PER_STONE; return rem ? (st + " stone, " + rem) : (st + " stone"); }
    return "" + coins;
  }

  // ---- caps ----
  function carryCap(stats) {              // lbs, from Might (canon: Might -> carry); floored to avoid /0 at low Might
    var c = (typeof TD_STATS !== "undefined") ? TD_STATS.DERIVED.carry(stats) : 100;
    return Math.max(1, c);
  }

  // ---- totals from items (weapons/armour carry weight + bulk) + a purse ----
  function carriedWeight(items, purse) { var w = 0; (items || []).forEach(function (it) { w += (it.weight || 0); }); return w + purseWeight(purse); }
  function carriedBulk(items) { var b = 0; (items || []).forEach(function (it) { b += (it.bulk || 0); }); return b; }   // coins have weight, negligible bulk

  function bandFor(frac) { for (var i = 0; i < BANDS.length; i++) if (frac <= BANDS[i].maxFrac) return BANDS[i]; return BANDS[BANDS.length - 1]; }

  // the one call: returns the band (feel-word) + the INTERNAL numbers (never surfaced to the player).
  // WEIGHT is capped by Might; BULK by pack space; the LIMITING dimension drives the band
  // ("light-but-huge fails on bulk"). Deterministic — pure function of its inputs.
  function compute(stats, items, purse, bulkCap) {
    var wCap = carryCap(stats), bCap = bulkCap || BULK_CAP;
    var w = carriedWeight(items, purse), b = carriedBulk(items);
    var wFrac = w / wCap, bFrac = b / bCap, frac = Math.max(wFrac, bFrac);
    var band = bandFor(frac);
    return {
      band: { key: band.key, word: band.word, speed: band.speed },   // the only player-facing part: band.word
      weight: w, weightCap: wCap, weightFrac: wFrac,                  // INTERNAL (never shown)
      bulk: b, bulkCap: bCap, bulkFrac: bFrac,
      frac: frac, limiting: (bFrac > wFrac ? "bulk" : "weight")
    };
  }
  // player surface: the band WORD only (a feel-word; no number leaks).
  function surface(stats, items, purse, bulkCap) { return compute(stats, items, purse, bulkCap).band.word; }

  return {
    COINS_PER_LB: COINS_PER_LB, COIN_VALUE: COIN_VALUE, BANDS: BANDS, BULK_CAP: BULK_CAP,
    COINS_PER_STONE: COINS_PER_STONE, massCoins: massCoins, itemMassCoins: itemMassCoins, massLabel: massLabel,
    purseCoins: purseCoins, purseWeight: purseWeight, purseValue: purseValue, coinWeight: coinWeight,
    carryCap: carryCap, carriedWeight: carriedWeight, carriedBulk: carriedBulk,
    bandFor: bandFor, compute: compute, surface: surface
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_BURDEN; }
