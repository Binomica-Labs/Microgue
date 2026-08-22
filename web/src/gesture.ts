// Gesture classification, kept pure so it can be tested without a canvas.
//
// The bug this exists to prevent: a tap on the plasmid button opened the screen
// on pointerdown, and then pointerup -- with the screen now open and the button
// far outside the ring -- hit a "tap outside to close" rule and shut it again.
// One tap, opened and closed. Deciding the gesture ONCE on down and acting ONCE
// on up makes that impossible to express.

export type Gesture = "none" | "button" | "slot" | "spin" | "dismiss" | "world";

export interface Box { x: number; y: number; w: number; h: number; }

export interface DownCtx {
  readonly plasmidOpen: boolean;
  readonly closeBox: Box;
  readonly slot: number | null;      // slotAt() result
  readonly distFromRing: number;     // distance from ring centre
  readonly rOuter: number;
  readonly onButton: boolean;
}

export const inBox = (b: Box, x: number, y: number): boolean =>
  x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

export function classifyDown(c: DownCtx, x: number, y: number): Gesture {
  if (c.plasmidOpen) {
    if (inBox(c.closeBox, x, y)) return "dismiss";
    if (c.slot !== null) return "slot";
    if (c.distFromRing > c.rOuter) return "spin";
    return "none";                   // the hole in the middle of the ring
  }
  return c.onButton ? "button" : "world";
}


// Keyboard, classified the same way and for the same reason: the pointer path
// was guarded against the plasmid screen but the key path was not, so arrows
// still walked the player and +/- still zoomed the world underneath the
// inventory.

export type KeyAction =
  | { kind: "move"; dx: number; dy: number }
  | { kind: "zoom"; factor: number }
  | { kind: "togglePlasmid" }
  | { kind: "closePlasmid" }
  | { kind: "toggleHud" }
  | { kind: "toggleContrast" }
  | { kind: "fullscreen" }
  | { kind: "descend" }
  | { kind: "ascend" }
  | { kind: "quit" }
  | { kind: "none" };

const MOVES: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
  y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1],
};

export function classifyKey(key: string, plasmidOpen: boolean): KeyAction {
  // While the inventory is open the world is inert. Only closing it, and
  // toggling it, get through.
  if (plasmidOpen) {
    if (key === "i" || key === "p" || key === "Escape") return { kind: "closePlasmid" };
    return { kind: "none" };
  }

  const mv = MOVES[key];
  if (mv) return { kind: "move", dx: mv[0], dy: mv[1] };
  switch (key) {
    case "i": case "p": return { kind: "togglePlasmid" };
    case "Tab": return { kind: "toggleHud" };
    case "c": return { kind: "toggleContrast" };
    case "F11": return { kind: "fullscreen" };
    case "+": case "=": return { kind: "zoom", factor: 1.25 };
    case "-": return { kind: "zoom", factor: 1 / 1.25 };
    case ">": case ".": return { kind: "descend" };
    case "<": case ",": return { kind: "ascend" };
    case "Escape": return { kind: "quit" };
    default: return { kind: "none" };
  }
}
