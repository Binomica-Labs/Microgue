// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Status effects: the useful tenth of an ECS, without the framework.
//
// One list on the entity, one loop applying it. Every effect is data, so
// adding antibiotic exposure or phage infection is a table entry rather than a
// new branch in three places.

export type StatusId =
  | "oxidative"     // reactive oxygen, from your own photosystem or the oxic zone
  | "sulfide"       // H2S poisoning below the chemocline
  | "acid"          // Thiobacillus acidifies its surroundings
  | "phage"         // lytic infection: damage that grows
  | "starved"       // ATP exhaustion
  | "slowed";       // acting less often

export interface Status {
  readonly id: StatusId;
  turns: number;
  magnitude: number;
}

export interface StatusDef {
  readonly id: StatusId;
  readonly name: string;
  readonly note: string;
  /** Damage per turn, scaled by magnitude. */
  readonly dmg: number;
  /** Multiplies how often the entity may act. 1 is normal. */
  readonly haste: number;
  /** Whether stacking refreshes the timer or adds magnitude. */
  readonly stacks: boolean;
  /** Growth per turn, for infections that worsen. */
  readonly growth: number;
}

export const STATUS: Readonly<Record<StatusId, StatusDef>> = {
  oxidative: { id: "oxidative", name: "Oxidative stress", dmg: 1, haste: 1, stacks: true, growth: 0,
    note: "Reactive oxygen faster than catalase can clear it." },
  sulfide:   { id: "sulfide", name: "Sulfide poisoning", dmg: 1, haste: 0.8, stacks: true, growth: 0,
    note: "H2S binds cytochrome oxidase. Respiration stalls." },
  acid:      { id: "acid", name: "Acidification", dmg: 1, haste: 1, stacks: false, growth: 0,
    note: "Sulfuric acid from a chemolithotroph. The envelope is dissolving." },
  phage:     { id: "phage", name: "Lytic infection", dmg: 1, haste: 1, stacks: false, growth: 0.6,
    note: "A phage is replicating inside you. It gets worse." },
  starved:   { id: "starved", name: "ATP exhaustion", dmg: 0, haste: 0.6, stacks: false, growth: 0,
    note: "Nothing left to spend. Everything runs slowly." },
  slowed:    { id: "slowed", name: "Slowed", dmg: 0, haste: 0.5, stacks: false, growth: 0,
    note: "Movement impaired." },
};

const MAX_MAGNITUDE = 6;

/** Add or refresh an effect on a list. */
export function apply(list: Status[], id: StatusId, turns: number, magnitude = 1): void {
  const def = STATUS[id];
  const existing = list.find((s) => s.id === id);
  if (!existing) {
    list.push({ id, turns: Math.max(turns, 1), magnitude: Math.min(magnitude, MAX_MAGNITUDE) });
    return;
  }
  existing.turns = Math.max(existing.turns, turns);
  if (def.stacks) {
    existing.magnitude = Math.min(existing.magnitude + magnitude, MAX_MAGNITUDE);
  }
}

export function has(list: readonly Status[], id: StatusId): boolean {
  return list.some((s) => s.id === id);
}

export function clear(list: Status[], id: StatusId): void {
  const i = list.findIndex((s) => s.id === id);
  if (i >= 0) list.splice(i, 1);
}

/**
 * Advance one turn. Returns total damage; expired effects are removed.
 *
 * `kept` is the fraction of each status's damage that gets through, 0..1 --
 * a detox gene clearing what it clears. Omitted, everything lands.
 */
export function tick(list: Status[], kept: (id: StatusId) => number = () => 1): number {
  let dmg = 0;
  for (const s of list) {
    const def = STATUS[s.id];
    const k = kept(s.id);
    dmg += def.dmg * s.magnitude * (Number.isFinite(k) ? Math.min(Math.max(k, 0), 1) : 1);
    if (def.growth > 0) s.magnitude = Math.min(s.magnitude + def.growth, MAX_MAGNITUDE);
    s.turns -= 1;
  }
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    if (s && s.turns <= 0) list.splice(i, 1);
  }
  return dmg;
}

/**
 * How much of a status a strain's own genes clear, 0..1 (0.8 at most: a
 * detox enzyme outpaces the damage, it does not make you immune).
 *
 * Oxidative stress killed every playtest strain on F1 and NOTHING countered
 * it -- katG's own card says "the oxic zone is corrosive without it", and
 * carrying it changed nothing. Catalase and superoxide dismutase clear
 * reactive oxygen; sulfide:quinone reductase routes H2S into the quinone
 * pool, which is what `sqr` already does for your own sulfide release.
 */
export function detox(id: StatusId, expressed: (gene: "katG" | "sodA" | "sqr") => number): number {
  const e = (g: "katG" | "sodA" | "sqr"): number => {
    const v = expressed(g);
    return Number.isFinite(v) ? Math.min(Math.max(v, 0), 1) : 0;
  };
  if (id === "oxidative") return Math.min(0.5 * e("katG") + 0.3 * e("sodA"), 0.8);
  if (id === "sulfide") return Math.min(0.6 * e("sqr"), 0.8);
  return 0;
}

/** Combined action-rate multiplier. Never zero, so nothing is permanently frozen. */
export function haste(list: readonly Status[]): number {
  let h = 1;
  for (const s of list) h *= STATUS[s.id].haste;
  return Math.max(h, 0.25);
}
