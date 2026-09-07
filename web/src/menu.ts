// The front of the game.
//
// One splash used to show the save slots directly and tapping one either
// resumed it or started a new culture in it -- which conflated "I want to keep
// playing this strain" with "I want a fresh one", and made deleting a save or
// overwriting a full set of slots impossible.
//
// Now it is a small state machine:
//
//   main      New Game / Continue / Settings
//   newGame   pick a slot to inoculate; a used slot warns before overwrite
//   continue  pick a slot to resume, or delete one (warned)
//   settings  the toggles
//
// Modelled as data here; the screens in menu_render.ts draw whatever mode is
// current, and input.ts routes taps by mode. Keeping the machine out of the
// renderer is what lets the confirm modals be tested without a canvas.

export type MenuMode = "main" | "newGame" | "continue" | "settings";

/** A pending point-of-no-return, awaiting a yes it defaults to refusing. */
export type Confirm =
  | { kind: "overwrite"; slot: number }
  | { kind: "delete"; slot: number };

export interface MenuState {
  mode: MenuMode;
  /** The modal over the current screen, or null. Default answer is always no:
   *  a slot is not overwritten or deleted unless the player reaches for yes. */
  confirm: Confirm | null;
}

export function newMenu(): MenuState {
  return { mode: "main", confirm: null };
}

/** The three rows on the main screen, in order. `continue` is offered only
 *  when there is something to continue -- an empty save has nothing. */
export function mainRows(hasSave: boolean): MenuMode[] {
  return hasSave ? ["newGame", "continue", "settings"]
                 : ["newGame", "settings"];
}
