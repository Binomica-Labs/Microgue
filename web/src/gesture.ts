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
