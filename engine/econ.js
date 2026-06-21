// Tourist Dungeon — TD_ECON: the town ECONOMY core (buy/sell, vault, posted tariffs, frictionful
// selling). PURE + DOM-free so it tests headless. Coins are weight (25/lb, via TD_BURDEN); value
// differs by denomination (1 gold = 10 silver = 100 copper). Spending/crediting RE-MINTS the purse
// greedily into the largest coins — so change comes back efficient (and lightest), and selling for
// copper genuinely weighs more than holding gold.
//
// TAX-AGNOSTIC by design: every price passes through applyReaction(price, reaction), which TODAY is
// the identity. The future INFATUATION TAX (a per-NPC swoon that bends a price) wires in THERE and
// nowhere else — no swoon logic is built now; the hook is reserved. (Directive PIN.)
//
// PRICES + BUYBACK + SERVICES are PLACEHOLDER, RED-PEN TUNABLE (flagged). The balance-sim calibrates.
"use strict";

var TD_ECON = (function () {
  var COIN = { gold: 100, silver: 10, copper: 1 };   // VALUE per coin (weight is denomination-blind; see TD_BURDEN)

  // ---- posted tariffs (TUNABLE PLACEHOLDER) — base BUY price in copper-equivalent value ----
  var PRICES = {
    // outfitting (descent gear)
    lantern: 60, rope: 24, torch: 6, dagger: 40, club: 28, sling: 30, buckler: 45, sack: 12, waterskin: 14,
    // apothecary (consumables)
    bandage: 16, tincture: 34, antidote: 28, salve: 22,
    // bodega / sundries
    ration: 8, hotdog: 5, biscuit: 4, candle: 3, twine: 5,
    // used-book store (research / lore)
    book: 26, map_scrap: 40, ledger: 55, pamphlet: 9
  };
  // buyback fractions (frictionful selling): a reputable shop pays POORLY; a fence pays WORSE (off-book).
  var BUYBACK = { shop: 0.40, fence: 0.25, bookstore: 0.35 };
  // RLD + civic SERVICES — a flat posted fee, paid at the counter/front (deadpan; no content modelled).
  var SERVICES = {
    rldservice: 35, palmreading: 18, membership: 60, redshop: 22,   // red-light district
    vaultfee: 0                                                      // the bank's vault is free to use (TUNABLE)
  };

  function clampInt(n) { return Math.max(0, Math.round(n || 0)); }

  // ---- purse arithmetic (value <-> coins) ----
  function value(purse) { purse = purse || {}; return (purse.gold || 0) * COIN.gold + (purse.silver || 0) * COIN.silver + (purse.copper || 0) * COIN.copper; }
  function mint(v) { v = clampInt(v); var g = Math.floor(v / 100); v -= g * 100; var s = Math.floor(v / 10); v -= s * 10; return { gold: g, silver: s, copper: v }; }
  function setPurse(purse, v) { var m = mint(v); purse.gold = m.gold; purse.silver = m.silver; purse.copper = m.copper; return purse; }
  function coinCount(purse) { purse = purse || {}; return (purse.gold || 0) + (purse.silver || 0) + (purse.copper || 0); }   // == weight in coin-mass units
  function canAfford(purse, cost) { return value(purse) >= clampInt(cost); }
  // spend: debit `cost` and re-mint; returns true on success, false (purse untouched) if too poor.
  function spend(purse, cost) { cost = clampInt(cost); if (value(purse) < cost) return false; setPurse(purse, value(purse) - cost); return true; }
  function credit(purse, amount) { setPurse(purse, value(purse) + clampInt(amount)); return purse; }

  // ---- RESERVED hook (tax-agnostic): a per-NPC reaction MAY one day bend a price. Identity for now. ----
  function applyReaction(price, reaction) { return clampInt(price); }   // FUTURE: infatuation tax folds in HERE only

  // ---- prices (posted BUY) + buyback (frictionful SELL) ----
  // an item's base value: explicit price > kind in PRICES > a floor of 1 (so loot is never worthless).
  function baseValue(item) {
    if (!item) return 0;
    if (typeof item.price === "number") return clampInt(item.price);
    if (typeof item.value === "number") return clampInt(item.value);
    if (item.kind && typeof PRICES[item.kind] === "number") return PRICES[item.kind];
    if (item.id && typeof PRICES[item.id] === "number") return PRICES[item.id];
    return 1;
  }
  function buyPrice(item, reaction) { return applyReaction(baseValue(item), reaction); }
  function sellPrice(item, where, reaction) {
    var bb = (typeof BUYBACK[where] === "number") ? BUYBACK[where] : BUYBACK.shop;
    return applyReaction(Math.max(1, Math.floor(baseValue(item) * bb)), reaction);
  }
  function servicePrice(id, reaction) { return applyReaction((typeof SERVICES[id] === "number") ? SERVICES[id] : 0, reaction); }

  return {
    COIN: COIN, PRICES: PRICES, BUYBACK: BUYBACK, SERVICES: SERVICES,
    value: value, mint: mint, setPurse: setPurse, coinCount: coinCount, canAfford: canAfford, spend: spend, credit: credit,
    applyReaction: applyReaction, baseValue: baseValue, buyPrice: buyPrice, sellPrice: sellPrice, servicePrice: servicePrice
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_ECON; }
