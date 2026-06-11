# Tourist Dungeon — Playable Build

The playable build of **Tourist Dungeon**, a knowledge-game roguelike (clear
local action, opaque global consequence). This is a public mirror of the build
only — it contains the runnable game and its tests, and **no design documents**.

## Play (no install, no server — just open a file)
Open in a browser by double-clicking:

- **`engine/play-map.html`** — the visual map mode (the main way to play).
- `engine/play.html` — a text mode.
- `prototype/tourist-dungeon-p1.html` — the original P1 text instrument.

### Controls (play-map.html)
- **Move:** arrow keys, or **W A S D**
- **Diagonals:** **Q E** (up-left / up-right), **Z C** (down-left / down-right)
- **Open a door / use a building:** **Enter**  (walk into a door to *see* it;
  Enter opens it)
- **Fight:** walk into a creature
- **Debug overlay:** **~**

Start in the harbour, walk into a building (Enter to go inside) to buy a ticket,
then walk to the gate (Enter) to descend. Find every required sight in one life
to complete the run; die and the Bureau will explain why.

## Tests
Requires **Python 3** and **Chrome or Edge** (no Node needed — the tests run the
real engine in headless Chrome):

    python tests/run_build.py

This runs the P1 instrument tests, the visual map mode tests, the town/forks
tests, and a **real-keypress end-to-end playthrough** of `engine/play-map.html`.
