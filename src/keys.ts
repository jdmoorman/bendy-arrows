/** Keys that move: the arrow keys, and WASD (either case) as the same. Row and column steps. */
const STEPS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
  w: [-1, 0],
  s: [1, 0],
  a: [0, -1],
  d: [0, 1],
};

/** The step (rows, columns) a key moves by: an arrow key or its WASD twin; null for any other key. */
export function arrowStep(ev: KeyboardEvent): [number, number] | null {
  return STEPS[ev.key.length === 1 ? ev.key.toLowerCase() : ev.key] ?? null;
}
