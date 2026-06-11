// Tourist Dungeon engine — TD_VOICES: the data-driven NPC voice system.
// One voice spec per speaking NPC: a VOICE BIBLE (register, rhythm, one verbal
// tic, a never-says list, an ACCENT) and a LINE POOL keyed by trigger. The
// engine picks a line by trigger + player state; a line used this session is
// RETIRED (no repeats). Every emitted line declares its CHANNEL (senses) and
// OBJ/SUBJ (Channel Law). ACCENT LAW (CLAUDE.md): accent is written through word
// choice, idiom and rhythm ONLY — never phonetic spelling, never dropped
// letters; all speech stays under the municipal translated-brochure register.
//
// This is the mirror-safe RUNTIME table; the JSON Schema + authoring copies live
// in /design/voices/ (private). Line pools are drafted to budget for the
// operator's red pen; thin triggers are flagged in the session summary, not
// padded with weak lines.
"use strict";

var TD_VOICES = (function () {
  // trigger -> default channel/obj for lines that don't override
  var TRIG = {
    greeting:  { ch: "senses", kind: "said", obj: "SUBJ" },
    pitch:     { ch: "senses", kind: "said", obj: "SUBJ" },
    accept:    { ch: "senses", kind: "said", obj: "OBJ" },
    decline:   { ch: "senses", kind: "said", obj: "SUBJ" },
    smalltalk: { ch: "senses", kind: "said", obj: "SUBJ" },
    reaction:  { ch: "senses", kind: "said", obj: "OBJ" }
  };

  // A line is a string (uses the trigger default) or [text, obj] to override.
  var SPECS = {
    // ----- KIOSK — terse municipal clerk (accent: mixed/clipped) ------------
    kiosk: {
      name: "the Admission Kiosk", role: "ticket clerk", accent: "mixed",
      bible: { register: "clipped municipal notice", rhythm: "short. flat. final.", tic: "states the obvious as policy", neverSays: ["please", "enjoy", "wonderful"] },
      lines: {
        greeting: ["Kiosk. Self-service.", "Tickets. One per visitor.", "State your business or move along.", "Admission is free. It is not, however, an occasion."],
        pitch: ["Standard Admission. All areas. No frills, no refunds.", "Grey ticket. Valid everywhere a grey ticket is valid.", "Take it or do not. The queue is theoretical.", "It opens the gate. That is the whole of its talent."],
        accept: [["A Standard Admission. All areas, as printed.", "OBJ"], ["Stamped. Keep it where you can find it.", "OBJ"], ["Done. The gate will know it.", "OBJ"], ["One ticket, dispensed. Next.", "OBJ"]],
        decline: ["Suit yourself.", "The slot will wait. It has nothing else.", "No sale. No matter.", "Come back when you mean it."],
        smalltalk: ["The weather is municipal.", "Complaints go in the box. The box is also theoretical.", "I have stamped worse than you.", "Lost-and-Found is down the hall and behind the point."],
        reaction: {
          starving: [["You look hollowed out. Eat before the gate, not after.", "OBJ"]],
          wounded: [["You are bleeding on the counter. It is municipal property.", "OBJ"]],
          famous: [["You again. The register remembers, even when I would rather not.", "OBJ"]],
          comfortable: [["You smell expensive. The ticket costs the same.", "OBJ"]],
          ticketed: [["You already hold admission. One is the limit.", "OBJ"]],
          fresh: [["New face. The dungeon files those alphabetically.", "OBJ"]],
          fatigued: [["You are dead on your feet. Sit, or do not. Policy is neutral.", "OBJ"]],
          fed: [["Well fed, for now. The gate does not cater.", "OBJ"]]
        }
      }
    },
    // ----- AGENCY — posh oversell (accent: posh English) -------------------
    agency: {
      name: "the Tour Agency", role: "tour clerk", accent: "posh",
      bible: { register: "brochure superlative", rhythm: "expansive, gilded, breathless", tic: "promises everything, delivers a zone", neverSays: ["no", "cannot", "small"] },
      lines: {
        greeting: ["Welcome, welcome — to the very best of everything!", "Ah, a discerning visitor; one sees it at once.", "You have come to the right desk; there is no other worth the name.", "Step in, step in — the Guided life awaits."],
        pitch: ["This pass gets you everywhere worth going!", "Guided, safe, premium — our guides are famously ruthful.", "Why wander, when one may be conducted?", "Everywhere worth seeing, and nothing one would rather not."],
        accept: [["A Guided Package — valid in all Guided Zones, as the small print sings.", "OBJ"], ["Marvellous choice. The Zones are yours.", "OBJ"], ["Stamped with our compliments. Mind the Zones.", "OBJ"], ["Welcome to the Guided life; it is the only life worth guiding.", "OBJ"]],
        decline: ["A pity — but the door remains, as ever, open.", "One reconsiders; one always reconsiders.", "The unguided life is a story one tells once.", "We shall be here, gleaming, when you return."],
        smalltalk: ["Our brochures are printed on the finest available stock.", "The graveyard view is, between us, the premium aspect.", "One does not visit; one is curated.", "We have never lost a guest we were prepared to admit losing."],
        reaction: {
          starving: [["You look famished — the Guided itinerary includes a sit-down, you know.", "OBJ"]],
          wounded: [["Goodness, you are marked. Our guides would never have permitted it.", "OBJ"]],
          famous: [["Your reputation precedes you; several of them do.", "OBJ"]],
          comfortable: [["You have the bearing of a premium guest. We adore the bearing.", "OBJ"]],
          ticketed: [["You are already provisioned. One package per discerning soul.", "OBJ"]],
          fresh: [["A new face! How we cherish a clean slate to itemise.", "OBJ"]],
          fatigued: [["You seem weary; the Guided pace is, naturally, gentler.", "OBJ"]],
          fed: [["Well fed and well met — half of touring is the appetite for it.", "OBJ"]]
        }
      }
    },
    // ----- CONCIERGE / HOTEL — posh condescension --------------------------
    hotel: {
      name: "the Gilded Kraken", role: "concierge", accent: "posh",
      bible: { register: "velvet discouragement", rhythm: "unhurried, faintly bored", tic: "calls you 'dear' to keep you small", neverSays: ["adventure", "down there", "hurry"] },
      lines: {
        greeting: ["A room, dear? Of course there is a room.", "You have the look of someone who would rather be lying down.", "The Gilded Kraken; mind the name, mind the prices.", "Come in out of the plot, dear."],
        pitch: ["Nothing down there worth roughing it for, dear.", "Stay. The bed is the only honest destination.", "Let the dungeon keep its appointments. You keep the suite.", "One night here is worth three of whatever you were planning."],
        accept: [["The night is yours; you wake restored, as the restored do.", "OBJ"], ["Suite's made up. Do try not to return marked.", "OBJ"], ["Rest, dear. The world will still be disappointing tomorrow.", "OBJ"], ["A perfumed night. You will leave announced.", "OBJ"]],
        decline: ["Off you go, then, to be uncomfortable on purpose.", "The bed will keep. It is very good at keeping.", "As you like, dear; martyrdom is a kind of holiday.", "Do mind the draught on your way to the regret."],
        smalltalk: ["The Rusty Anchor? We do not speak of the Rusty Anchor.", "Our towels have a thread count one does not discuss with guests.", "Comfort, dear, is a destination in itself.", "We launder reputations as a courtesy."],
        reaction: {
          starving: [["You are positively gaunt, dear; ring for something before you faint in the lobby.", "OBJ"]],
          wounded: [["You are dripping on the marble. We have people for that, and a fee.", "OBJ"]],
          famous: [["So many arrivals, all of them you. The staff keep a tally.", "OBJ"]],
          comfortable: [["You wear comfort well, dear. It suits the marble.", "OBJ"]],
          ticketed: [["A ticket already? How quaint. The bed asks no ticket.", "OBJ"]],
          fresh: [["A fresh guest. We do so enjoy a guest who has not yet learned better.", "OBJ"]],
          fatigued: [["You can barely stand, dear. The lift is just there. So is sense.", "OBJ"]],
          fed: [["Fed and upright. You will undo both downstairs, of course.", "OBJ"]]
        }
      }
    },
    // ----- SPA — posh flattery --------------------------------------------
    spa: {
      name: "the Spa", role: "attendant", accent: "posh",
      bible: { register: "soft flattery with a barb", rhythm: "low, slow, lulling", tic: "promises you will be 'announced'", neverSays: ["cheap", "rush", "ordinary"] },
      lines: {
        greeting: ["You have arrived precisely when you needed to.", "Such tension. We can see it from here.", "Welcome; you are already improving.", "Lie back. The improvements will find you."],
        pitch: ["Emerge improved. Emerge, regrettably, announced.", "You will leave with soft hands and a perfume that enters rooms first.", "An hour here undoes a week of the dungeon.", "Let us make you someone worth recognising."],
        accept: [["The treatment is done; you are improved, and unmistakably scented.", "OBJ"], ["Soft hands, dear visitor — the dungeon will smell you coming.", "OBJ"], ["You are remade, and announced for it.", "OBJ"], ["A perfume that precedes you into every room.", "OBJ"]],
        decline: ["The tension will keep you company, then.", "We will be here, warm and patient, when the knots win.", "As you wish; one cannot improve the unwilling.", "Go un-scented; the dungeon has a nose all the same."],
        smalltalk: ["Scent is a passport one cannot surrender.", "We have improved guests who did not survive the improvement.", "Relaxation is a discipline, and we are strict.", "The doorman dislikes our work; the doorman dislikes work."],
        reaction: {
          starving: [["You are running on fumes — we cannot massage an empty larder.", "OBJ"]],
          wounded: [["Those wounds will not take the oils. Mend first, glow later.", "OBJ"]],
          famous: [["So many lives, and each one leaves with our perfume.", "OBJ"]],
          comfortable: [["Already so well-kept. We merely turn the dial further.", "OBJ"]],
          ticketed: [["Ticketed and tense — admission first, serenity never, it seems.", "OBJ"]],
          fresh: [["A fresh canvas. We do our finest work on the unmarked.", "OBJ"]],
          fatigued: [["You are exhausted; an hour here and you will at least be exhausted beautifully.", "OBJ"]],
          fed: [["Fed and willing — the ideal state for improvement.", "OBJ"]]
        }
      }
    },
    // ----- DOORMAN — barely speaks (accent: brooklyn) — FLAVOR budget ------
    doorman: {
      name: "the Rusty Anchor", role: "doorman", accent: "brooklyn", flavor: true,
      bible: { register: "monosyllabic gatekeeping", rhythm: "few words, fewer wasted", tic: "judges by nose", neverSays: ["welcome", "sir", "lovely"] },
      lines: {
        greeting: ["Yeah.", "We are open. Do not make it a thing.", "You drinking, or looking?"],
        decline: ["Door is that way.", "Come back when you are carrying less.", "Not tonight."],
        smalltalk: ["The place is a dive. That is the amenity.", "The hotel upstairs hates us. It is mutual."],
        reaction: {
          comfortable: [["You smell like the Gilded Kraken. Not your kind of place.", "OBJ"]],
          starving: [["You look half-starved. The bar food is honest, at least.", "OBJ"]],
          wounded: [["You are bleeding. Take it to a stool, not my floor.", "OBJ"]],
          famous: [["I have seen you die a few times. Buys you nothing here.", "OBJ"]]
        }
      }
    },
    // ----- HOT DOG VENDOR — the best voice: street patter vs municipal form -
    vendor: {
      name: "the Hot Dog Vendor", role: "mobile vendor", accent: "brooklyn",
      bible: { register: "street barker forced through a municipal permit", rhythm: "fast, looping, all-caps energy in lowercase", tic: "quotes his own (invented) Bureau permit number", neverSays: ["perhaps", "regrettably", "moderation"] },
      lines: {
        greeting: ["Hey, hey — the cart finds the hungry. That is a guarantee. Look it up.", "There he is: a visitor with the good sense to be standing near me.", "Step right up. Permit eleven-and-three-quarters, fully municipal, I assure you.", "You just walked into the best decision of your afternoon."],
        pitch: ["One dog, dressed how you like, climbs you right up the hunger ladder. That is nutrition. That is policy.", "Bureau-approved, street-perfected: the only honest meal between here and the turnstile.", "Look, a dog is a dog, but my dog is an itinerary. You eat, you ascend.", "Two dollars of joy, today priced at one smile. The economy is still in committee."],
        accept: [["One hot dog, hot as promised. Carry it. Eat it when the dark gets long.", "OBJ"], ["There she is, wrapped and yours. Climbs you a full rung, easy.", "OBJ"], ["Enjoy it, champ. Permit eleven-and-three-quarters stands behind every bite.", "OBJ"], ["A dog for the road. The road is worse without it.", "OBJ"]],
        decline: ["Your loss — and I mean that with municipal warmth.", "The cart moves on. The cart always moves on.", "Walk away hungry. It is a free country and a fee dungeon.", "I will be around. I am always around. Ask the streets."],
        smalltalk: ["I have a route, see, and the route has me. We are partners.", "The posh places will not sell you a real meal, even if you bled for it.", "This cart has seen more of this town than the mayor, and it tips better.", "Mustard is a condiment. My mustard is a civic service."],
        reaction: {
          starving: [["Whoa, whoa — you are STARVING. Sit. Eat. The Bureau can wait; your stomach cannot.", "OBJ"]],
          wounded: [["You are all banged up, friend. A dog will not stitch you, but it will not judge you either.", "OBJ"]],
          famous: [["I know you. You are the one who keeps coming back. Loyalty discount: also a smile.", "OBJ"]],
          comfortable: [["Look at you, all spa-fresh, slumming it at the cart. I respect it.", "OBJ"]],
          ticketed: [["You have your ticket. Good. Now get your lunch: a gate is no good on an empty tank.", "OBJ"]],
          fresh: [["New blood. The first dog is the one you remember. That is a fact, basically.", "OBJ"]],
          fatigued: [["You are dragging, champ. Carbohydrates are a kind of rest. Ask any cart.", "OBJ"]],
          fed: [["Full already? Take one for the pocket. Future-you sends thanks.", "OBJ"]]
        }
      }
    }
  };

  // dungeon cast — reserved voices, NO lines yet (canon arrives as design data)
  var DUNGEON_CAST = ["janitor", "elevator_operator", "oracle", "bookie"];
  DUNGEON_CAST.forEach(function (id) { SPECS[id] = { name: id, role: "dungeon NPC", accent: "mixed", placeholder: true, bible: { register: "TBD", rhythm: "TBD", tic: "TBD", neverSays: [] }, lines: {} }; });

  function expand(line, trig) {
    var t = (typeof line === "string") ? line : line[0];
    var obj = (typeof line === "string") ? (TRIG[trig] || TRIG.smalltalk).obj : line[1];
    var d = TRIG[trig] || TRIG.smalltalk;
    return { text: t, ch: d.ch, kind: d.kind, obj: obj };
  }

  // A session-scoped voice: picks an unused line by trigger (+ state for
  // reactions); a used line is retired. Returns {text, ch, kind, obj} or null.
  function box(specId) {
    var spec = SPECS[specId];
    var used = {};
    function pickFrom(arr, trig) {
      if (!arr || !arr.length) return null;
      for (var i = 0; i < arr.length; i++) {
        var ex = expand(arr[i], trig);
        if (!used[ex.text]) { used[ex.text] = 1; return ex; }
      }
      return null;   // pool exhausted this session
    }
    return {
      spec: spec,
      say: function (trigger, state) {
        if (!spec || !spec.lines) return null;
        if (trigger === "reaction") {
          var r = spec.lines.reaction || {};
          var arr = (state && r[state]) ? r[state] : null;
          return pickFrom(arr, "reaction");
        }
        return pickFrom(spec.lines[trigger], trigger);
      },
      // a non-retiring peek (tests / fallbacks)
      _all: function (trigger, state) {
        if (!spec || !spec.lines) return [];
        var arr = trigger === "reaction" ? ((spec.lines.reaction || {})[state] || []) : (spec.lines[trigger] || []);
        return arr.map(function (l) { return expand(l, trigger); });
      }
    };
  }

  function byId(id) { return SPECS[id] || null; }
  return { SPECS: SPECS, DUNGEON_CAST: DUNGEON_CAST, box: box, byId: byId, _trig: TRIG, _expand: expand };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_VOICES; }
