# hamiltonian-paths-game

Create and solve Hamiltonian path and Hamiltonian loop puzzles in the browser. Built for phones first; works with touch, pen and mouse.

- **Path puzzles:** fill every open tile with one path that never crosses itself or forms a loop.
- **Loop puzzles:** fill every open tile with one closed loop that never crosses itself.

Black tiles are skipped, and the path can't cross black walls between tiles.

## Running it

```sh
npm install
npm run dev          # open the printed http://localhost:5173
npm run dev:phone    # same, but reachable from your phone on the same Wi-Fi (use the "Network" URL)
npm test             # solver, rules, codec and storage tests
npm run build        # static site in dist/ (works from any sub-path, e.g. GitHub Pages)
```

## Playing

The app opens on a sample puzzle in the **Play** tab.

- **Drag** from an empty tile to draw: segments are added along the drag. A drag never switches between drawing and erasing — where it starts decides.
- **Erase** by starting a drag on a line, or on a tile that has lines: segments are removed along the drag. Tapping a line where it crosses a border erases it; tapping the centre of a tile erases all lines touching it. Starting on the end of a path is decided by your first move: back along the path erases, anywhere else extends the path.
- **Tap an empty border** between two tiles to mark it with an X (the path does not go there). Tap again to clear it. Right-click toggles an X with a mouse.
- Segments can't enter black tiles or cross walls. Loops and branches are allowed while you work; they are highlighted in red.
- **Undo / Redo** (or Ctrl+Z / Ctrl+Shift+Z).
- **Reset** (the circular-arrow button, tap twice) empties the board and restarts the timer, hints and checks.
- **Check** tells you whether all the lines you've drawn so far are part of a solution — nothing more.
- **Hint** shows the simplest logical next step for your board — the tile is shaded and the suggested lines or X marks are drawn in amber — with a sentence explaining why. It uses the same rules as the editor's Logic helper, simplest first, and says so if none apply or if your board has a mistake. Hints are shown, not drawn for you.
- The board turns green when the puzzle is solved, and a **Solved!** sheet shows your time and your past times for that puzzle (fastest first), each with the hints and checks used. **Play again** starts a fresh attempt; **Another puzzle** opens the library to pick a new one. The time is tracked from when the puzzle is loaded, only while Play is on screen; it isn't shown while you play unless you turn on **Show timer** in Settings.

## Creating (Create tab)

- **Tiles:** tap or drag over tiles. Starting on a white tile makes tiles black along the drag; starting on a black tile clears them.
- **Walls:** tap or drag along borders. Starting on an empty border adds walls along the drag; starting on a wall removes them.
- **Ends:** tap a dot on the frame outside the grid to place the entrance, then the exit. Each is drawn as a black stub through the frame: the entrance ends in the arrow's tail, the exit in its head. Tap an end again to remove it. Ends can only go on the frame; for a fixed tile inside the grid, use checkpoints. With ends or checkpoints it is a **path** puzzle; with neither it is a **loop** puzzle. If only one end is placed, Play asks for the second first.
- **Checkpoints:** tap tiles to place numbered circles 1, 2, 3… in order. The path must start at 1, pass through every number in order and finish at the highest one, while filling every tile. Tap a number to remove it (higher numbers move down). A puzzle uses either ends or checkpoints, not both — placing one kind removes the other. Play needs at least two checkpoints.
- **Width × height** pickers (1 to 30), and buttons to **rotate left / right** and **flip horizontally / vertically**. Black tiles, walls, ends and checkpoints all move with the grid, and each change can be undone.
- **Logic:** a helper that shows how far simple reasoning gets. **Step** applies one round of the chosen rules (the new lines and X marks are highlighted) and can be pressed repeatedly; **Reset** starts over; **Rules** is a checklist of which rules to use:
  - **Corners** — a tile with only two ways out, at a right angle, uses both.
  - **Passages** — a tile walled in on opposite sides gets a straight line.
  - **Continue** — a tile whose remaining ways out are exactly what it still needs takes them (including a path end with only one way out).
  - **No early loops** — X out a border that would close a loop too soon.
  - **No early finish** (path puzzles) — X out a border that would join both ends of the path before every tile is used.
  - **Number order** (3+ checkpoints) — X out a border that would join numbers out of order or skip one (e.g. 1 straight to 3).
  - **Bottlenecks** — an area reachable through only two borders uses both; with one end of the path inside, it crosses exactly once.
  - **Checkerboard balance** — the path alternates shaded and white tiles, so an area with more of one colour must be entered on that colour.

  The checklist only shows the rules that can apply to the current puzzle. Hints in Play use all of them, simplest first, and highlight the area a rule is about.

  A tile that already has all its lines is understood to be closed on its other borders; no rule or hint is spent on that.

  It reports when it's stuck, when logic alone solves the puzzle, or when it finds a contradiction. Editing the puzzle resets it.
- The puzzle is **checked automatically** in the background after every edit. A chip shows **Unique**, **No solution**, **2+ solutions** or **Too big**; tap it for the explanation (e.g. a checkerboard parity mismatch). Tapping **Unique** shows the solution (tap again to hide it); with 2+ solutions, the eye button steps through the ones it found.
- **Play** switches to the Play tab with your puzzle.

## Sharing and saving

- **Share** button (top right): send a link with the phone's share sheet or copy it, export or import JSON, or paste a link or code to open a puzzle. Links look like `…/#p=CODE`. The puzzle format is versioned 0.x while the app is pre-release (currently 0.5); older 0.x links still open.
- **Library** button: save the current puzzle under a name, then reopen, edit or delete saved puzzles. Progress on saved puzzles is kept automatically. The current puzzle, your progress and any unsaved editor work are restored when you come back.

- **Settings** button (gear): checkerboard shading (on by default), **Show timer** (off by default) and **Auto-check** (on by default), which highlights mistakes such as branches, early loops and numbers out of order as you play. Settings are remembered on this device.

Everything is stored locally in your browser; nothing is sent anywhere.

## How the solver decides

The solver is a backtracking search with pruning. At each step it checks that:

- the unvisited tiles stay connected
- no tile is left with too few ways in or out
- the path's ends are respected

Before searching, it runs a checkerboard **parity check**. Every step moves between the two colours of a checkerboard, so:
- a loop needs equal numbers of each colour;
- a path needs counts that differ by at most one, with both ends on the majority colour when they differ.

The solver stops after finding two solutions, which is enough to decide uniqueness. Very large open grids may hit its step limit, and the editor says so.

## Code layout

| File | Purpose |
| --- | --- |
| `src/model.ts` | Grid, cell and edge indexing, puzzle data |
| `src/rules.ts` | What may be drawn; full solution check with error details |
| `src/solver.ts` | Parity check and solution counter (`solver.worker.ts` runs it off the main thread) |
| `src/codec.ts` | Share codes and JSON |
| `src/render.ts`, `src/input.ts` | SVG board and pointer/touch gestures |
| `src/play.ts`, `src/editor.ts` | Play and Create views |
| `src/share.ts`, `src/library-ui.ts`, `src/storage.ts` | Sharing, library and localStorage |
| `src/themes.ts` | Colour themes (light by default, dark also defined; add a theme by adding a token map) |
