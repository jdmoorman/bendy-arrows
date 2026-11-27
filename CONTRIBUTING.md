# Contributing to Bendy Arrows

Thanks for your interest in helping out! Bug reports, feature ideas, new levels and code changes are all welcome.

## Reporting bugs and suggesting ideas

Open an issue on [GitHub](https://github.com/jdmoorman/bendy-arrows/issues). For a bug, please include:

- what you did, what you expected, and what happened instead;
- the puzzle's link (everything after `#p=` in the address), if a particular puzzle is involved;
- your device and browser (the app is mainly played on phones, so mobile reports are especially useful).

## Getting set up

You'll need [Node.js](https://nodejs.org/) (a current LTS release) and npm.

```sh
git clone https://github.com/jdmoorman/bendy-arrows.git
cd bendy-arrows
npm install
npm run dev
```

The dev server prints a local address. The player app is `index.html`, and the puzzle creator is `create.html`; the creator's Packs tab, for editing the shipped level packs, only appears on the dev server.

To try it on your phone, run `npm run dev:phone` and open the network address it prints on a phone on the same Wi-Fi network.

## Making a change

1. Fork the repository and create a branch from `main`.
2. Make your change. Keep each pull request focused on one thing.
3. Add or update tests in `tests/` for any change to the game's logic, solver, generator or puzzle format.
4. Run the checks:

   ```sh
   npm test
   ```

   This type-checks the project and runs the test suite (including checks that every shipped level has exactly one solution).
5. Open a pull request describing what changed and why. Screenshots or a short recording help for anything visible, ideally at phone width.

## Style

- TypeScript, no framework. Match the style of the code around your change.
- Please don't run a formatter over whole files; format the lines you touch by hand, so diffs stay small.
- Design touch-first: most players are on phones, so check that new controls are easy to tap and that the layout works on a narrow screen.

## Adding levels

The level packs players see live in `src/levels.ts`, each level as its share code. To add one:

1. Make the puzzle in the creator (`create.html`).
2. Save it to your Library.
3. On the dev server, open the Packs tab, add the puzzle to a pack from your Library, and save the packs. This updates `src/levels.ts` for you. (You can also paste a level code into `src/levels.ts` by hand.)
5. Open a pull request. Once it's merged into `main`, GitHub builds the site and publishes it to Pages.

Each level's code also carries its difficulty, so players see it without the app working it out. `npm test` checks the difficulties are right, and `npm run rate-levels` fixes any that aren't.

Players' progress is stored by each level's code, so changing a published level in any way resets everyone's progress on it.

## AI Use

Using AI tools to help write code, tests or levels is fine. Please review and test what they produce as carefully as you would your own work; you're responsible for what you submit.

## Questions?
If you have questions about how something works, feel free to open an issue or start a discussion.
