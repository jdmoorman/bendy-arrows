/**
 * The icons. Each is an image file in public/icons/, named below: to change one, replace its
 * file (or point its entry at another, e.g. a .png).
 *
 * A one-colour icon is used as a mask, filled with the text colour around it, so it follows the
 * theme, greyed-out buttons and so on: only its shape (the file's opaque pixels) matters. Pass
 * `true` as the second argument for an icon in full colour, shown just as the file has it.
 */
const icon = (file: string, fullColour = false) => {
  const url = `${import.meta.env.BASE_URL}icons/${file}`;
  return fullColour
    ? `<img class="icon" src="${url}" alt="" aria-hidden="true">`
    : `<span class="icon" style="--icon: url('${url}')" aria-hidden="true"></span>`;
};

export const ICONS = {
  undo: icon('undo.svg'),
  redo: icon('redo.svg'),
  check: icon('check.svg'),
  clear: icon('clear.svg'),
  share: icon('share.svg'),
  save: icon('save.svg'),
  library: icon('library.svg'),
  play: icon('play.svg'),
  dice: icon('dice.svg'),
  plus: icon('plus.svg'),
  minus: icon('minus.svg'),
  edit: icon('edit.svg'),
  settings: icon('settings.svg'),
  rotateLeft: icon('rotate-left.svg'),
  reset: icon('reset.svg'),
  rotateRight: icon('rotate-right.svg'),
  flipH: icon('flip-h.svg'),
  flipV: icon('flip-v.svg'),
  filter: icon('filter.svg'),
  list: icon('list.svg'),
  step: icon('step.svg'),
  fastForward: icon('fast-forward.svg'),
  rewind: icon('rewind.svg'),
  stepBack: icon('step-back.svg'),
  bulb: icon('bulb.svg'),
  chevron: icon('chevron.svg'),
  grid: icon('grid.svg'),
  eraser: icon('eraser.svg'),
  arrowUp: icon('arrow-up.svg'),
  arrowDown: icon('arrow-down.svg'),
  close: icon('close.svg'),
  /** An arrow leaving through a door. */
  exit: icon('exit.svg'),
  /** The filter, filled in: a column whose filter is on. */
  filterOn: icon('filter-on.svg'),
  /** A star, for a level solved with no hints. */
  star: icon('star.svg'),
};
