// Naming a strain.
//
// The game is pure canvas and had no text entry anywhere, so strains got a
// name from a prebaked pool -- K-12, MR-1, SP162 -- which are real reference
// strains and read fine, but they are not YOURS. A run you named is a run you
// remember.
//
// Text entry on a canvas game means one thing on mobile: a real <input>,
// positioned over the canvas, focused on demand so the system keyboard comes
// up. The canvas draws the field; the input is invisible and only exists to
// receive keystrokes. When the player commits, the value lands in game state
// and the input blurs so the keyboard goes away.
//
// This module owns the DOM element and nothing else. It never reads game
// state; the Game hands it a callback.

import { on, type Report } from "./safety.js";

const MAX_LEN = 16;

/** Keep a name to what a save can hold and a HUD can show. */
export function cleanName(raw: string): string {
  // Printable, trimmed, capped. Control characters and leading/trailing
  // whitespace are the things that break a HUD line and a save key.
  let s = "";
  for (const c of raw) {
    const code = c.codePointAt(0) ?? 0;
    if (code >= 0x20 && code !== 0x7f) s += c;
  }
  s = s.trim();
  return s.slice(0, MAX_LEN);
}

/** A name that means "the player did not type one": fall back to the pool. */
export function isBlank(name: string): boolean {
  return cleanName(name).length === 0;
}

export interface NameField {
  /** Show the field, seeded with a suggestion, and raise the keyboard. */
  open(suggest: string, onCommit: (name: string) => void, onCancel: () => void): void;
  /** Hide and blur WITHOUT firing either callback. For when the caller has
   *  already read the value and taken over. Safe to call when not open. */
  close(): void;
  /** Current text, cleaned. */
  value(): string;
  readonly isOpen: boolean;
}

/**
 * Build the hidden input once. It lives outside the canvas in the DOM but is
 * drawn nowhere -- opacity 0, pointer-events none -- so the canvas stays the
 * only thing you see. Enter commits, Escape cancels, blur (the keyboard
 * dismissed) commits whatever is there.
 */
export function makeNameField(doc: Document, report: Report): NameField {
  const el = doc.createElement("input");
  el.type = "text";
  el.maxLength = MAX_LEN;
  el.autocomplete = "off";
  el.autocapitalize = "characters";
  el.spellcheck = false;
  el.setAttribute("aria-label", "strain name");
  Object.assign(el.style, {
    position: "fixed", left: "0", top: "0", width: "1px", height: "1px",
    opacity: "0", pointerEvents: "none", fontSize: "16px", // 16px stops iOS zoom
  });
  doc.body.appendChild(el);

  let open = false;
  let commit: ((n: string) => void) | null = null;
  let cancel: (() => void) | null = null;

  const finish = (ok: boolean): void => {
    if (!open) return;
    open = false;
    const v = cleanName(el.value);
    el.blur();
    const c = commit, x = cancel;
    commit = null; cancel = null;
    if (ok) c?.(v); else x?.();
  };

  // Through the safety wrapper, like every listener in the game, so a throw
  // inside a handler is caught and reported rather than killing the page.
  on(el, "keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); finish(true); }
    else if (e.key === "Escape") { e.preventDefault(); finish(false); }
  }, "name keydown", report);
  // The keyboard's own "done" dismisses without an Enter on some phones; a
  // blur while open is a commit, not a loss of what was typed.
  on(el, "blur", () => { if (open) finish(true); }, "name blur", report);

  return {
    open(suggest, onCommit, onCancel) {
      el.value = suggest;
      commit = onCommit; cancel = onCancel;
      open = true;
      el.focus();
      el.select();
    },
    close() {
      // Detach the callbacks first, so the blur that follows fires neither.
      open = false;
      commit = null; cancel = null;
      el.blur();
    },
    value() { return cleanName(el.value); },
    get isOpen() { return open; },
  };
}
