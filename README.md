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

- **Drag** from tile to tile to draw the path. Drag back over the previous tile to erase that segment.
- **Tap a border** between two tiles to mark it with an X (the path does not go there). Tap again to clear it. Right-click works too with a mouse.
- Segments can't enter black tiles or cross walls. Loops and branches are allowed while you work; they are highlighted in red.
- **Undo / Redo** (or Ctrl+Z / Ctrl+Shift+Z), **Clear**, and **Check**, which highlights missed tiles and bad ends.
- The board turns green when the puzzle is solved.

## Creating (Create tab)

- **Tiles:** tap or drag to toggle black tiles.
- **Walls:** tap or drag along borders to add or remove walls.
- **Ends:** tap the outside frame to place where the path enters and leaves (up to two). A puzzle with ends is a **path** puzzle; with no ends it is a **loop** puzzle. If only one end is placed, Play asks for the second first. Each end is drawn as a black path stub through the frame with an arrow outside it, pointing in at the entrance and out at the exit. Tap an end again to remove it.
- **Givens:** drag between tiles to give away segments of the solution.
- **Width × height** pickers (1 to 30).
- **Check** runs the solver in the background and reports whether the puzzle has **no solution** (with a reason, such as a checkerboard parity mismatch), **exactly one**, or **more than one**. The eye button overlays the solutions it found.
- **Play** switches to the Play tab with your puzzle.

## Sharing and saving

- **Share** button (top right): send a link with the phone's share sheet or copy it, export or import JSON, or paste a link or code to open a puzzle. Links look like `…/#p=CODE`. The puzzle format is versioned 0.x while the app is pre-release (currently 0.2); older 0.1 links still open.
- **Library** button: save the current puzzle under a name, then reopen, edit or delete saved puzzles. Progress on saved puzzles is kept automatically. The current puzzle, your progress and any unsaved editor work are restored when you come back.

Everything is stored locally in your browser; nothing is sent anywhere.

## How the solver decides

The solver is a backtracking search with pruning. At each step it checks that:

- the unvisited tiles stay connected
- no tile is left with too few ways in or out
- given segments and endpoints are respected

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
