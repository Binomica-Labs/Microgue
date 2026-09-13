// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// What happens after a strain is lost (or wins).
//
// One screen used to do two jobs -- mourn the strain and sell you the next one
// -- and neither got room. The obituary was crushed above a shop, the shop had
// no heading of its own, and the only hint of what to do was one grey line at
// the bottom. Nothing on the screen said what you were looking at.
//
// It is a short flow now, three screens, each one thing:
//
//   report   what happened. The strain, how far, what killed it, the credit
//            earned. One button: "continue".
//   store    spend the credit. Constructs for the next strain, with the credit
//            balance always visible. "done" when you are.
//   ready    the next strain is prepared. "send it down" to start.
//
// Each screen names itself in a heading and tells you what the one action on
// it does. A flow you can read is a flow you do not need to learn.

export type AftermathStage = "report" | "store" | "ready";

export interface Aftermath {
  stage: AftermathStage;
}

export function newAftermath(): Aftermath {
  return { stage: "report" };
}

/** The forward step. Each screen has exactly one. */
export function advance(a: Aftermath): AftermathStage {
  a.stage = a.stage === "report" ? "store"
    : a.stage === "store" ? "ready"
    : "ready";
  return a.stage;
}

/** Heading and one-line explanation, per stage. The text is the UI. */
export function stageCopy(
  stage: AftermathStage, won: boolean,
): { title: string; sub: string; action: string } {
  switch (stage) {
    case "report":
      return {
        title: won ? "THE COLUMN IS YOURS" : "STRAIN LOST",
        sub: won ? "What the strain did on the way down."
                 : "What happened to this strain.",
        action: "continue",
      };
    case "store":
      return {
        title: "SYNTHESIS STORE",
        sub: "Spend credit on constructs. They are on the next strain from turn one.",
        action: "done ordering",
      };
    case "ready":
      return {
        title: "NEXT STRAIN READY",
        sub: "Everything ordered is aboard. The column is waiting.",
        action: "send it down",
      };
  }
}
