// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Press and release, for every screen that is not the world.
//
// The HUD buttons always committed on RELEASE, and correctly: you can press,
// see what you hit, slide off, and let go without firing. Every other
// surface -- the menu, the naming screen, the aftermath, the loot container
// -- fired on pointerDOWN. So half the game let you change your mind and
// half did not, and the transitions happened under your finger before you
// had read them. That is the "too fast" and most of the "awkward".
//
// This is the shared machinery: a press ARMS a target, a release on the same
// target COMMITS it, a release anywhere else cancels. One state, so no
// screen can forget to reset it, and the renderer can draw the armed thing
// pressed.

import { inBox, type Box } from "./chrome.js";

/** What a press is currently holding, as an opaque key the caller chose. */
export interface Armed {
  /** The caller's identifier for the thing being pressed. */
  key: string;
  /** Where it was, so a release can check the finger is still on it. */
  box: Box;
  /** ms, for the minimum-visible-press hold. */
  at: number;
}

/**
 * A press must be VISIBLE before it commits. A tap faster than this still
 * works -- the commit is simply drawn as pressed for the remainder -- but
 * the eye gets a frame of feedback either way. 70ms is about two frames at
 * 30fps: enough to see, far too short to feel like lag.
 */
export const MIN_PRESS_MS = 70;

/** Arm a target. Returns the new state. */
export function arm(key: string, box: Box, now: number): Armed {
  return { key, box, at: Number.isFinite(now) ? now : 0 };
}

/**
 * Does a release at (x,y) commit the armed target?
 *
 * Only if the finger is still inside the box it went down on. Sliding off a
 * button and letting go is how a person says "no, not that one", and it has
 * to work or the press/release split buys nothing.
 */
export function commits(a: Armed | null, x: number, y: number): boolean {
  return a !== null && inBox(a.box, x, y);
}

/** Is this key the one currently held? For drawing it pressed. */
export function isArmed(a: Armed | null, key: string): boolean {
  return a !== null && a.key === key;
}
