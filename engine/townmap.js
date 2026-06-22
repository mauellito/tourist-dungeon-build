// Tourist Dungeon — TD_TOWNMAP: the town as a FIXED AUTHORED MAP with RANDOMISED
// TENANTS. The LAYOUT is fixed (same crescent, river, bridges, districts, streets,
// and dungeon entrance every run); only the ASSIGNMENT of businesses to building
// SLOTS is dealt per seed, within district + size constraints. Landmarks (church,
// dungeon mouth, graveyard, gate, bridges, piers, kiosk) are FIXED, never shuffled.
//
// NOTE: MAP below is a PLACEHOLDER — a frozen snapshot of one gated TD_TOWNGEN
// output, standing in until the operator's hand-drawn city is pasted in. To install
// the real city, REPLACE MAP.rows / MAP.districts / MAP.redlight with the operator's
// map in this same one-char-per-tag glyph format (legend = GLYPH below). No code
// changes needed; the tenant pass + the live wire-in are format-stable.
// Classic script: assigns global TD_TOWNMAP.
"use strict";

var TD_TOWNMAP = (function () {
  var MAP = {
  "w": 132,
  "h": 62,
  "rows": [
  "####################################################################################################################################",
  "#................................G.........................................,,~~........................................~####++++++##",
  "#.###.###.####.####.,,,,.#####.######.#####.###.####.####.####.##########..,,~~...########...###.###########.#####..##.~####++++++##",
  "#.###.###.####.####.,~~,.#####.######.#####.###.####.####.####.##########..,,~~...########.#####.##########..#####..##.~####++++++##",
  "#.###.###.####.####.,,,,.#####.######.#####.###.####.####.####.##########..,,~~...##........####.##.....###.#####..###~~####++++++##",
  "#...........................................................................bbbb..#########.####.###.######.######.##~~#####++++++##",
  "#...........................................................................bbbb..#######...####.....###............#~######++++++##",
  "#.###.###.####.####.####.#####.######.#####.###.,,,,.####.####.####.#####..,,~~...######..#####..###.##..##.###.###.~~#######+++++##",
  "#.###.###.####.####.####.#####.######.#####.###.,~~,.####.####.####.#####..,~~~...######.######.####....###.###.####~###,####+++++##",
  "#.###.###.####.####.####.#####.######.#####.###.,,,,.####.####.####.#####..,~~~......##.......#.#######.###...#.###~~##,,####+++++##",
  "#.###.###..................................................................,~~~~..##....#######..######..######..##~##,,,######,++##",
  "#........................................................................,,,~~~~..##############..######.#######.##~#,,,,######,++##",
  "#..######.#########.##########.############.########.########..,,,,,,,,,,,,~~~~~.................................bbb,,,,,,,,,,,,++##",
  "#..######.#########.##########.############.########.########..,,,,,,,,,,,~~~~~~~.....#####.#######.####.######..~~##,,,,######,++##",
  "#.#######.#########.##########.############.########.########...,,,,,,,,,~~~~~~~~.....#####.#######.####.######..~###,,,,######,++##",
  "#..######.#########.##########.############.########.########...,,,,,,,,~~~~~~~~~~....#####.#######.####.######..~####,,,######+++##",
  "#............................#.######...........................,,,~~~~~~~~~~~~~~~....#####.#######.####.######.~~#####,,#####++++##",
  "#...#####..######..#######...................######.#####.....,,,~~~~~~~~~~~~~~~~~....##################.######.~#######,#####++++##",
  "#...#####..######..#######.............#####.######.#####....,,~~~~~~~~~~~~~~~~~~~~...##################.######.~~############++++##",
  "#...#####..######..#######.....,,,,,,..#####.######.#####....,~~~~~~~~~~~~~~~~~~===...##################.........~###########+++++##",
  "#..............................,,,,,,..#####.######.#####..,,~~~~~~~~~~~~~~~~~~~~~~...########....#######..###...~~##########++~++##",
  "#..........................,,,.CCCC,,..#####.######.#####.,,~~~~~~~~~~~~~~~~~~~~===.......####.##....####..###....~##########+++++##",
  "#...#####..,,,,##..\"\"\"\"\",,.,,,.CCCC,,........######.#####.,,~~~~~~~~~~~~~~~~~~~~~~~...#######..#####.####..###....~~#########+++++##",
  "#...#####..,~~,##..\"\"\"\"\",,.,~,.CCCC,,.....................,,~~~~~~~~~~~~~~~~~~~====...#######.##.###.####...........~##########++###",
  "#...#####..,,,,##..\"\"\"\"\",,.,,,.CCCC,,........######.#####.,~~~~~~~~~~~~~~~~~~~~~~~~...#######.#......####..###..###..~##############",
  "...........................,,,.CCCC,,..#####.######.#####.,~~~~~~~~~~~~~~~~~~~~====...#######.##.#.######..###..###...~~############",
  "...............................,,,,,,..#####.######.......,,,~~~~~~~~~~~~~~~~~~~~~~...#######.####.######..###..###....~~~##########",
  "#...#####..######..###.###.....,,,,,,..#####.######.......,,,~~~~~~~~~~~~~~~~~~~===...#######..###.######................~~~~#######",
  "#...#####..######..###.###...............................,,,~~~~~~~~~~~~~~~~~~~~~~~.......####...#...####..###..###.........~~######",
  "#...#####..######..###.###....#######..#####.######..\"\"\",,~~~~~~~~~~~~~~~~~~~~~====...#######..#####.####..###..###...#####..~####L#",
  "#.............................#######..#####.######..\"\"\",~~~~~~~~~~~~~~~~~~~~~~~~~~...#######.##.###.####..###..###...#####..~~#####",
  "#.............................#######..#####.######..\"\",,~~~~~~~~~~~~~~~~~~~~~~~===...#######.##..#..####.............######..~~####",
  "#...####..####..#####..####...###\"\"##..#####.######..\"\",~~~~~~~~~~~~~~~~~~~~~~~~~~~...#######.###...#####..###..###...######...~~~~#",
  "#...####..####..#####..####...###>\"..........######..,,~~~~~~~~~~~~~~~~~~~~~~~~~===...#######.####.###.....###..###...##.....#.....#",
  "#...####..####..#####..####...###k\"..................,~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~............##..##.....###..###...#..#..#####..#",
  "#...####..####..#####..####...###\"\"##..#####..\"\"\"\"\"\"\",~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...#######.###..###................###.###....#",
  "#...####..####..#####..####...#######..#####..\"\"\"\"\",,~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..######..####.###.######.####..######.##.##.#",
  "#.............................#######..#####..\"\"k\",,~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~==..##########...###.######.####..###.#..#####.#",
  "#...####..#####.#####..#####..................\"\"\"\",~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..#####......#####.######.####..##..#.######.#",
  "#...####..#####.#####..#####..................\"\"\",,~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~==..#####.####.k####........####..###.#......#.#",
  "#...####..#####.#####..#####..................\",,,,~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..################.#####..####..##..##..##...#",
  "#...####..#####.#####..######..#######.###....\",,,,~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~==....##############.#####..####.....####.####.#",
  "#...####..#####.#####..######..#######.###....\",,,,~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..################.#####........#..####.###..#",
  "#...####..#####.#####..######..#######.###..,,,~,,~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~===..################.#####..####..##....#.###.##",
  "#...........................................,~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~=......................##..####..####....###..#",
  "#..........................................,,~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...................#####..####..####.##.##.#.#",
  "#...####.######.######..#####..######.,,,,,,~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....##############.#####..####..##...##.#....#",
  "#...####.######.######..#####..######.,,,,,~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...##############.#####........#..####...##.#",
  "#...####.######.######..#####..####...,,,~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...##############.#####..####..#..####.######",
  "#...####.######.######..#####..####...,,,~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~................#####..####..##...##.######",
  "#...####.######.######..#####.........,,~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~=~~.....#######........####.....####.######",
  "#........................####........,,~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~=~~=~...#######.#####..####..######...##..#",
  "#........................####....,,,,,~~~~~~~~~~~~~~~~~~~~~~~~~~....~~~~~~~~~~~~~~~~~~~~~=~~=~=~.........#####..####..#####..#....##",
  "#.,,,,,,,,,,,,,,,,,,,,,..####...,,~~~~~~~~~~~~~~~~~~~~~~~~~~~~........~~~~~~~~~~~~~~~~~~~=~~=~=~~=..####...###........####..#####..#",
  "#.,,,,,,,,,,,,,,,,,,,,,........,,~~~~~~~~~~~~~~~~~~~~~~~~~~~~.........~~~~~~~~~~~~~~~~~~~~~~~~~~~=~..###.#####..####.......#######.#",
  "#.,,,k\"\"\",,,,,,,,,,,,,,.......,,~~~~~~~~~~~~~~~~~~~~~~~~~........###...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~=....#####..####..####..######.#",
  "#.,,,\"\"\"~~~,,,,,,,,,,,,.,,,,,,,~~~~~~~~~~~~~~~~~~~~~~~~........#####.....~~~~~~~~~~~~~~~~~~~~~~~~~~~=....#####..####..#####.######.#",
  "#.,,,,,,,,,,,,,,,,,,,,,,,~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~......###L++###....~~~~~~~~~~~~~~~~~~~~~~~~~~=~=.........####......~~.......#",
  "#.,,,,,,,,,,,,,~~~~~~,,~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~......#####~##.......~~~~~~~~~~~~~~~~~~~~~~~~~~=~=~......####..~~~~~~~~~~~~~#",
  "#.,,,,,,,~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.........###........~~~~~~~~~~~~~~~~~~~~~~~~~~~~~=~~==~==......~~~~~~~~~~~~~#",
  "#~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.............~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~==~==~~~~~~~~~~~~~~~~~~~#",
  "####################################################################################################################################"
  ],
  "districts": [
  {
  "role": "warehouse",
  "streetLogic": "grown",
  "x0": 116,
  "y0": 1,
  "x1": 126,
  "y1": 11
  },
  {
  "role": "warehouse",
  "streetLogic": "grown",
  "x0": 113,
  "y0": 1,
  "x1": 130,
  "y1": 31
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 2,
  "y0": 2,
  "x1": 4,
  "y1": 4
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 6,
  "y0": 2,
  "x1": 8,
  "y1": 4
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 10,
  "y0": 2,
  "x1": 13,
  "y1": 4
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 15,
  "y0": 2,
  "x1": 18,
  "y1": 4
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 25,
  "y0": 2,
  "x1": 29,
  "y1": 4
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 31,
  "y0": 2,
  "x1": 36,
  "y1": 4
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 38,
  "y0": 2,
  "x1": 42,
  "y1": 4
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 44,
  "y0": 2,
  "x1": 46,
  "y1": 4
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 48,
  "y0": 2,
  "x1": 51,
  "y1": 4
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 53,
  "y0": 2,
  "x1": 56,
  "y1": 4
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 58,
  "y0": 2,
  "x1": 61,
  "y1": 4
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 63,
  "y0": 2,
  "x1": 72,
  "y1": 4
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 82,
  "y0": 2,
  "x1": 90,
  "y1": 9
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 82,
  "y0": 2,
  "x1": 95,
  "y1": 11
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 97,
  "y0": 2,
  "x1": 107,
  "y1": 7
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 108,
  "y0": 2,
  "x1": 113,
  "y1": 5
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 115,
  "y0": 2,
  "x1": 117,
  "y1": 6
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 2,
  "y0": 7,
  "x1": 4,
  "y1": 10
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 6,
  "y0": 7,
  "x1": 8,
  "y1": 10
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 10,
  "y0": 7,
  "x1": 13,
  "y1": 9
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 15,
  "y0": 7,
  "x1": 18,
  "y1": 9
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 20,
  "y0": 7,
  "x1": 23,
  "y1": 9
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 25,
  "y0": 7,
  "x1": 29,
  "y1": 9
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 31,
  "y0": 7,
  "x1": 36,
  "y1": 9
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 38,
  "y0": 7,
  "x1": 42,
  "y1": 9
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 44,
  "y0": 7,
  "x1": 46,
  "y1": 9
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 53,
  "y0": 7,
  "x1": 56,
  "y1": 9
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 58,
  "y0": 7,
  "x1": 61,
  "y1": 9
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 63,
  "y0": 7,
  "x1": 66,
  "y1": 9
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 68,
  "y0": 7,
  "x1": 72,
  "y1": 9
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 96,
  "y0": 7,
  "x1": 103,
  "y1": 11
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 104,
  "y0": 7,
  "x1": 111,
  "y1": 11
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 112,
  "y0": 7,
  "x1": 115,
  "y1": 11
  },
  {
  "role": "civic",
  "streetLogic": "planned",
  "x0": 2,
  "y0": 12,
  "x1": 8,
  "y1": 15
  },
  {
  "role": "civic",
  "streetLogic": "planned",
  "x0": 10,
  "y0": 12,
  "x1": 18,
  "y1": 15
  },
  {
  "role": "civic",
  "streetLogic": "planned",
  "x0": 20,
  "y0": 12,
  "x1": 29,
  "y1": 16
  },
  {
  "role": "civic",
  "streetLogic": "planned",
  "x0": 31,
  "y0": 12,
  "x1": 42,
  "y1": 16
  },
  {
  "role": "civic",
  "streetLogic": "planned",
  "x0": 44,
  "y0": 12,
  "x1": 51,
  "y1": 15
  },
  {
  "role": "civic",
  "streetLogic": "planned",
  "x0": 53,
  "y0": 12,
  "x1": 60,
  "y1": 15
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 86,
  "y0": 13,
  "x1": 104,
  "y1": 33
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 105,
  "y0": 13,
  "x1": 110,
  "y1": 18
  },
  {
  "role": "civic",
  "streetLogic": "planned",
  "x0": 4,
  "y0": 17,
  "x1": 8,
  "y1": 19
  },
  {
  "role": "civic",
  "streetLogic": "planned",
  "x0": 11,
  "y0": 17,
  "x1": 16,
  "y1": 19
  },
  {
  "role": "civic",
  "streetLogic": "planned",
  "x0": 19,
  "y0": 17,
  "x1": 25,
  "y1": 19
  },
  {
  "role": "civic",
  "streetLogic": "planned",
  "x0": 45,
  "y0": 17,
  "x1": 50,
  "y1": 22
  },
  {
  "role": "civic",
  "streetLogic": "planned",
  "x0": 52,
  "y0": 17,
  "x1": 56,
  "y1": 22
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 39,
  "y0": 18,
  "x1": 43,
  "y1": 21
  },
  {
  "role": "redlight",
  "streetLogic": "grown",
  "x0": 91,
  "y0": 18,
  "x1": 100,
  "y1": 33
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 107,
  "y0": 20,
  "x1": 109,
  "y1": 22
  },
  {
  "role": "redlight",
  "streetLogic": "grown",
  "x0": 91,
  "y0": 21,
  "x1": 100,
  "y1": 41
  },
  {
  "role": "civic",
  "streetLogic": "planned",
  "x0": 4,
  "y0": 22,
  "x1": 8,
  "y1": 24
  },
  {
  "role": "civic",
  "streetLogic": "planned",
  "x0": 15,
  "y0": 22,
  "x1": 16,
  "y1": 24
  },
  {
  "role": "civic",
  "streetLogic": "planned",
  "x0": 45,
  "y0": 24,
  "x1": 50,
  "y1": 27
  },
  {
  "role": "civic",
  "streetLogic": "planned",
  "x0": 52,
  "y0": 24,
  "x1": 56,
  "y1": 25
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 107,
  "y0": 24,
  "x1": 109,
  "y1": 26
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 112,
  "y0": 24,
  "x1": 114,
  "y1": 26
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 39,
  "y0": 25,
  "x1": 43,
  "y1": 27
  },
  {
  "role": "redlight",
  "streetLogic": "grown",
  "x0": 99,
  "y0": 25,
  "x1": 100,
  "y1": 27
  },
  {
  "role": "civic",
  "streetLogic": "planned",
  "x0": 4,
  "y0": 27,
  "x1": 8,
  "y1": 29
  },
  {
  "role": "civic",
  "streetLogic": "planned",
  "x0": 11,
  "y0": 27,
  "x1": 16,
  "y1": 29
  },
  {
  "role": "civic",
  "streetLogic": "planned",
  "x0": 19,
  "y0": 27,
  "x1": 21,
  "y1": 29
  },
  {
  "role": "civic",
  "streetLogic": "planned",
  "x0": 23,
  "y0": 27,
  "x1": 25,
  "y1": 29
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 107,
  "y0": 28,
  "x1": 109,
  "y1": 30
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 112,
  "y0": 28,
  "x1": 114,
  "y1": 30
  },
  {
  "role": "civic",
  "streetLogic": "planned",
  "x0": 30,
  "y0": 29,
  "x1": 36,
  "y1": 37
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 39,
  "y0": 29,
  "x1": 43,
  "y1": 32
  },
  {
  "role": "civic",
  "streetLogic": "planned",
  "x0": 45,
  "y0": 29,
  "x1": 50,
  "y1": 33
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 118,
  "y0": 29,
  "x1": 123,
  "y1": 34
  },
  {
  "role": "civic",
  "streetLogic": "planned",
  "x0": 4,
  "y0": 32,
  "x1": 7,
  "y1": 36
  },
  {
  "role": "civic",
  "streetLogic": "planned",
  "x0": 10,
  "y0": 32,
  "x1": 13,
  "y1": 36
  },
  {
  "role": "civic",
  "streetLogic": "planned",
  "x0": 16,
  "y0": 32,
  "x1": 20,
  "y1": 36
  },
  {
  "role": "civic",
  "streetLogic": "planned",
  "x0": 23,
  "y0": 32,
  "x1": 26,
  "y1": 36
  },
  {
  "role": "redlight",
  "streetLogic": "grown",
  "x0": 99,
  "y0": 32,
  "x1": 101,
  "y1": 34
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 107,
  "y0": 32,
  "x1": 109,
  "y1": 34
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 112,
  "y0": 32,
  "x1": 114,
  "y1": 34
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 124,
  "y0": 33,
  "x1": 129,
  "y1": 39
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 118,
  "y0": 34,
  "x1": 124,
  "y1": 43
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 39,
  "y0": 35,
  "x1": 43,
  "y1": 37
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 88,
  "y0": 35,
  "x1": 103,
  "y1": 43
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 105,
  "y0": 36,
  "x1": 110,
  "y1": 38
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 112,
  "y0": 36,
  "x1": 115,
  "y1": 41
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 4,
  "y0": 38,
  "x1": 7,
  "y1": 43
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 10,
  "y0": 38,
  "x1": 14,
  "y1": 43
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 16,
  "y0": 38,
  "x1": 20,
  "y1": 43
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 23,
  "y0": 38,
  "x1": 28,
  "y1": 43
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 105,
  "y0": 40,
  "x1": 109,
  "y1": 49
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 126,
  "y0": 40,
  "x1": 129,
  "y1": 46
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 31,
  "y0": 41,
  "x1": 37,
  "y1": 43
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 39,
  "y0": 41,
  "x1": 41,
  "y1": 43
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 118,
  "y0": 42,
  "x1": 121,
  "y1": 49
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 112,
  "y0": 43,
  "x1": 115,
  "y1": 46
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 118,
  "y0": 45,
  "x1": 124,
  "y1": 53
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 4,
  "y0": 46,
  "x1": 7,
  "y1": 50
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 9,
  "y0": 46,
  "x1": 14,
  "y1": 50
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 16,
  "y0": 46,
  "x1": 21,
  "y1": 50
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 24,
  "y0": 46,
  "x1": 28,
  "y1": 53
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 31,
  "y0": 46,
  "x1": 36,
  "y1": 49
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 90,
  "y0": 46,
  "x1": 103,
  "y1": 48
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 126,
  "y0": 47,
  "x1": 130,
  "y1": 51
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 112,
  "y0": 48,
  "x1": 115,
  "y1": 52
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 97,
  "y0": 50,
  "x1": 103,
  "y1": 51
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 105,
  "y0": 51,
  "x1": 109,
  "y1": 56
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 123,
  "y0": 52,
  "x1": 129,
  "y1": 56
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 100,
  "y0": 53,
  "x1": 103,
  "y1": 54
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 112,
  "y0": 54,
  "x1": 115,
  "y1": 58
  },
  {
  "role": "warehouse",
  "streetLogic": "grown",
  "x0": 61,
  "y0": 55,
  "x1": 69,
  "y1": 59
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 118,
  "y0": 55,
  "x1": 122,
  "y1": 56
  }
  ],
  "redlight": {
  "x0": 91,
  "y0": 18,
  "x1": 101,
  "y1": 41,
  "entrance": [
  91,
  18
  ]
  }
  };

  var GLYPH = { water: "~", pier: "=", bridge: "b", street: ".", plaza: ",", park: "\"", graveyard: "+", fence: "f", building: "#", gate: "G", church: "C", dungeon: ">", alley: ":", landmark: "L", townsecret: "s", notice: "n", vendor: "v", npc: "p", kiosk: "k" };
  var FROM = {}; for (var g in GLYPH) FROM[GLYPH[g]] = g;   // '#' -> building (wall reads the same)

  // ===== TENANT POOL (data; dealt to building SLOTS per seed) =====
  // cat -> colour category (storefront/civic/lodging/faith/vice, via TD_UI.buildingColor).
  // size: smallest slot class it needs. where: eligible district roles. unique: <=1 per town.
  var TENANTS = [
    { id: "coffee",     label: "a coffee shop",          glyph: "e", cat: "commerce", size: "small",  where: ["housing", "market", "civic"], weight: 6 },
    { id: "bakery",     label: "a bakery",               glyph: "q", cat: "commerce", size: "small",  where: ["housing", "market", "civic"], weight: 5 },
    { id: "grocer",     label: "a grocer",               glyph: "g", cat: "commerce", size: "small",  where: ["housing", "market"], weight: 5 },
    { id: "barber",     label: "a barber",               glyph: "y", cat: "commerce", size: "small",  where: ["housing", "market"], weight: 4 },
    { id: "tattoo",     label: "a tattoo parlour",       glyph: "z", cat: "commerce", size: "small",  where: ["market", "civic"], weight: 3 },
    { id: "tailor",     label: "a tailor",               glyph: "u", cat: "commerce", size: "small",  where: ["housing", "market"], weight: 3 },
    { id: "cobbler",    label: "a cobbler",              glyph: "j", cat: "commerce", size: "small",  where: ["housing", "market"], weight: 3 },
    // GATE FIX R3 — the TRANSACTING shops are CAPPED at one canonical each (unique); generic flavour fills the rest.
    { id: "apothecary", label: "an apothecary",          glyph: "a", cat: "commerce", size: "small",  where: ["market", "civic"], unique: true, weight: 3 },
    { id: "store",      label: "the Outfitter",          glyph: "o", cat: "commerce", size: "small",  where: ["housing", "market", "civic"], unique: true, weight: 8 },
    { id: "spa",        label: "a spa",                  glyph: "m", cat: "commerce", size: "medium", where: ["civic", "market", "housing"], weight: 3 },
    { id: "tavern",     label: "a tavern",               glyph: "Y", cat: "commerce", size: "medium", where: ["market", "housing", "civic"], weight: 4 },
    // GATE FIX R4 — WIRE the previously-defined-but-never-placed interiors as flavour tenants, so no spec is
    // an orphan. Acts already handled in act(): food/rest/flavor/tim/boat. (tim + boat are DEFERRED-feature
    // stubs — their interiors deliberately read "Closed / goes nowhere"; FLAGGED, kept reachable as texture.)
    { id: "saloon",     label: "a saloon",               glyph: "S", cat: "commerce", size: "medium", where: ["market", "housing", "civic"], weight: 3 },
    { id: "restaurant", label: "a restaurant",           glyph: "E", cat: "commerce", size: "medium", where: ["civic", "market"], weight: 3 },
    { id: "chinese",    label: "a takeout window",       glyph: "N", cat: "commerce", size: "small",  where: ["market", "housing"], weight: 3 },
    { id: "clamshack",  label: "a clam shack",           glyph: "F", cat: "commerce", size: "small",  where: ["warehouse"], weight: 3 },
    { id: "motel",      label: "a motel",                glyph: "M", cat: "lodging",  size: "medium", where: ["market", "housing"], weight: 2 },
    { id: "blacksmith", label: "a blacksmith",           glyph: "L", cat: "commerce", size: "small",  where: ["market", "warehouse"], weight: 3 },
    { id: "gift1",      label: "a souvenir shop",        glyph: "1", cat: "commerce", size: "small",  where: ["market", "civic"], weight: 2 },
    { id: "gift2",      label: "a rival souvenir shop",  glyph: "2", cat: "commerce", size: "small",  where: ["market", "civic"], weight: 2 },
    { id: "tim",        label: "a shuttered hint desk",  glyph: "G", cat: "civic",    size: "small",  where: ["civic", "market"], weight: 1 },   // FLAG: hints DEFERRED (closed gag)
    { id: "boat",       label: "a boat rental",          glyph: "U", cat: "civic",    size: "small",  where: ["warehouse", "market"], weight: 1 },   // FLAG: goes nowhere yet
    { id: "bank",       label: "the bank",               glyph: "B", cat: "civic",    size: "large",  where: ["civic", "market"], unique: true, weight: 2 },
    // GATE FIX — the Tour Agency: GUARANTEED civic venue (unique -> always places). Its front (glyph "A",
    // act "agency") is the in-world door to the staged creation flow (startIntake); without it that flow
    // was unreachable in normal play.
    { id: "agency",     label: "the Tour Agency",        glyph: "A", cat: "civic",    size: "medium", where: ["civic", "market"], unique: true, weight: 2 },
    { id: "hotel",      label: "the Gilded Kraken Hotel", glyph: "H", cat: "lodging", size: "large",  where: ["civic", "market", "housing"], unique: true, weight: 2 },
    { id: "warehouse",  label: "a warehouse",            glyph: "W", cat: "commerce", size: "large",  where: ["warehouse"], weight: 6 },
    { id: "chandlery",  label: "a ship chandlery",       glyph: "d", cat: "commerce", size: "medium", where: ["warehouse"], weight: 4 },
    { id: "customs",    label: "the customs house",      glyph: "X", cat: "civic",    size: "medium", where: ["warehouse"], unique: true, weight: 2 },
    { id: "redlit",     label: "a members' club",        glyph: "%", cat: "vice",     size: "medium", where: ["redlight"], weight: 3 },
    { id: "redshop",    label: "a red-lit parlour",      glyph: "&", cat: "vice",     size: "small",  where: ["redlight"], weight: 4 },
    { id: "palmreader", label: "a palm-reader",          glyph: "@", cat: "vice",     size: "small",  where: ["redlight"], weight: 3 },
    // GATE 4 — a corner store is COMMERCE (enterable buy/sell), not vice (FLAG: moved out of the RLD so it can be a shop).
    { id: "bodega",     label: "a bodega",               glyph: "$", cat: "commerce", size: "small",  where: ["market", "housing"], unique: true, weight: 3 },
    // GATE 4 — the used-book store (research/lore, enterable) + the off-book pawnbroker/fence (sell-only). R3: both unique.
    { id: "bookstore",  label: "a used-book store",      glyph: "b", cat: "commerce", size: "small",  where: ["civic", "market"], unique: true, weight: 4 },
    { id: "fence",      label: "a pawnbroker",           glyph: "p", cat: "commerce", size: "small",  where: ["warehouse", "market"], unique: true, weight: 3 }
  ];
  // CANON VENUES (flavor first-pass): a representative handful of businesses get a named front +
  // signage + ONE voice line, in the venue's register (accent law: word choice + rhythm only, never
  // phonetic spelling). Firewall-safe — signage + a bark, NO economy/transacting/mechanics.
  var CANON = {
    tavern: { name: "the Rusty Anchor", sign: "THE RUSTY ANCHOR — ales, alibis, and no tab", bark: "You drinking, or just dripping on my floor? Sit where I can see you.", accent: "brooklyn" },
    bank: { name: "the Bank of the Bureau", sign: "DEPOSITS RECEIVED WITH THE GRAVEST COURTESY", bark: "One does not loiter at the marble. One has business, or one has the door.", accent: "posh" },
    hotel: { name: "the Gilded Kraken", sign: "THE GILDED KRAKEN — rooms, hot water, discretion", bark: "Checking in, or merely admiring? The lobby is not a waiting room, dear.", accent: "posh" },
    spa: { name: "the Vapour Rooms", sign: "STEAM · SALTS · SILENCE", bark: "You are wearing the road, I see. We can lift it off you, for a consideration.", accent: "posh" },
    coffee: { name: "the Third Cup", sign: "COFFEE — SERVED HOT AND WITHOUT OPINION", bark: "Sit anywhere you like. The opinions cost extra and we have run out.", accent: "plain" },
    store: { name: "the Outfitter", sign: "THE OUTFITTER — lanterns, rope, and regret", bark: "Going down, are you? Take a lantern. Take two. Nobody comes back for the refund.", accent: "plain" },
    bodega: { name: "the Corner", sign: "OPEN ALL HOURS THE BUREAU PERMITS", bark: "Whatever you need, I got it, or I know a guy. Mostly I know a guy.", accent: "brooklyn" },
    redlit: { name: "the Members' Room", sign: "MEMBERS ONLY — membership upon quiet enquiry", bark: "Private establishment, sweetheart. The privacy is the whole of the product.", accent: "brooklyn" }
  };
  var CAT_COL = { commerce: "storefront", civic: "civic", lodging: "lodging", faith: "faith", vice: "vice" };
  var SIZE_RANK = { small: 0, medium: 1, large: 2 };
  function slotClass(area) { return area >= 30 ? "large" : (area >= 14 ? "medium" : "small"); }

  // ---- parse the authored rows into a tag grid + detected building SLOTS ----
  function parse() {
    var w = MAP.w, h = MAP.h, tag = [];
    for (var y = 0; y < h; y++) { var row = MAP.rows[y] || "", r = []; for (var x = 0; x < w; x++) r.push(FROM[row[x]] || "street"); tag.push(r); }
    function inb(x, y) { return x >= 0 && y >= 0 && x < w && y < h; }
    function walk(t) { return t === "street" || t === "plaza" || t === "alley" || t === "pier" || t === "bridge"; }
    function roleAt(x, y) { var best = null, ba = 1e9; for (var i = 0; i < MAP.districts.length; i++) { var D = MAP.districts[i]; if (x >= D.x0 && x <= D.x1 && y >= D.y0 && y <= D.y1) { var a = (D.x1 - D.x0) * (D.y1 - D.y0); if (a < ba) { ba = a; best = D.role; } } } return best; }
    var D4 = [[0, -1], [0, 1], [-1, 0], [1, 0]], seen = {}, slots = [];
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (tag[y][x] !== "building" || seen[x + "," + y]) continue;
      var stack = [[x, y]], cells = [], front = null; seen[x + "," + y] = 1;
      while (stack.length) {
        var c = stack.pop(); cells.push(c);
        for (var i = 0; i < 4; i++) {
          var nx = c[0] + D4[i][0], ny = c[1] + D4[i][1]; if (!inb(nx, ny)) continue;
          if (tag[ny][nx] === "building" && !seen[nx + "," + ny]) { seen[nx + "," + ny] = 1; stack.push([nx, ny]); }
          else if (!front && walk(tag[ny][nx])) front = { x: c[0], y: c[1] };
        }
      }
      if (!front) continue;                         // a landlocked block with no street face: not a slot
      var sx = 0, sy = 0; cells.forEach(function (cc) { sx += cc[0]; sy += cc[1]; });
      var role = roleAt(Math.round(sx / cells.length), Math.round(sy / cells.length)) || roleAt(front.x, front.y);
      slots.push({ cells: cells, area: cells.length, front: front, role: role, cls: slotClass(cells.length) });
    }
    return { w: w, h: h, tag: tag, slots: slots };
  }

  // a small deterministic LCG so the deal is seed-stable without coupling to TD_RNG
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function shuffle(arr, rnd) { for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; }

  // ---- generate(seed): FIXED bones + seeded TENANT assignment ----
  function generate(seed) {
    var P = parse(), rnd = rng((seed >>> 0) ^ 0x7d717a00);
    // stable slot identity order (every seed indexes the same slot) — bones never move
    var slots = P.slots.filter(function (s) { return s.role; }).sort(function (a, b) { return (a.front.y - b.front.y) || (a.front.x - b.front.x); });
    var assigned = new Array(slots.length), usedUnique = {};
    // 1) ANCHORS: each unique (bank, hotel, customs) claims the LARGEST free eligible slot,
    //    so the town always HAS them — which big building they occupy turns over per seed.
    shuffle(TENANTS.filter(function (t) { return t.unique; }), rnd).forEach(function (t) {
      var bestI = -1, bestA = -1;
      for (var i = 0; i < slots.length; i++) { if (assigned[i]) continue; var s = slots[i]; if (t.where.indexOf(s.role) < 0) continue; if (s.area > bestA) { bestA = s.area; bestI = i; } }
      if (bestI >= 0) { assigned[bestI] = t; usedUnique[t.id] = 1; }
    });
    // 2) deal the remaining slots from the weighted general pool (shuffled for fair spread)
    var rest = []; for (var i = 0; i < slots.length; i++) if (!assigned[i]) rest.push(i);
    shuffle(rest, rnd).forEach(function (si) {
      var slot = slots[si];
      var pool = TENANTS.filter(function (t) { return !t.unique && t.where.indexOf(slot.role) >= 0 && SIZE_RANK[slot.cls] >= SIZE_RANK[t.size]; });
      if (!pool.length) pool = TENANTS.filter(function (t) { return !t.unique && t.where.indexOf(slot.role) >= 0; });
      if (!pool.length) return;
      var tot = 0; pool.forEach(function (t) { tot += t.weight || 1; });
      var r = rnd() * tot, pick = pool[0];
      for (var k = 0; k < pool.length; k++) { r -= pool[k].weight || 1; if (r <= 0) { pick = pool[k]; break; } }
      assigned[si] = pick;
    });
    // 3) emit fronts in stable slot order
    var fronts = [];
    for (var i = 0; i < slots.length; i++) {
      var pick = assigned[i]; if (!pick) continue; var slot = slots[i];
      var canon = CANON[pick.id] || null;
      fronts.push({ x: slot.front.x, y: slot.front.y, business: pick.id, label: canon ? canon.name : pick.label, cat: pick.cat,
        col: CAT_COL[pick.cat] || "storefront", glyph: pick.glyph, role: slot.role, cells: slot.cells, slotId: i,   // TOWN — the building MASS cells (for category tinting) + a stable slot id (shade variance)
        text: canon ? canon.sign : ("The front of " + pick.label + ". (Going inside arrives with the interiors pass.)"),
        bark: canon ? canon.bark : null, accent: canon ? canon.accent : null });
    }
    var grid = []; for (var y = 0; y < P.h; y++) { var s = ""; for (var x = 0; x < P.w; x++) s += (GLYPH[P.tag[y][x]] || "?"); grid.push(s); }
    var meta = { districts: MAP.districts, redlight: MAP.redlight, source: "townmap", authored: true, authored: true, authored: true, pois: { tenants: fronts.length } };
    return { w: P.w, h: P.h, tag: P.tag, grid: grid, meta: meta, fronts: fronts, seed: seed, source: "townmap" };
  }

  return { generate: generate, parse: parse, MAP: MAP, TENANTS: TENANTS, GLYPH: GLYPH };
})();
if (typeof module !== "undefined" && module.exports) { module.exports = TD_TOWNMAP; }
