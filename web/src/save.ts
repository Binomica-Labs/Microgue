// Save serialisation with a real runtime validator.
//
// JSON.parse returns `any`, which is a hole straight through the type system:
// a corrupted or hand-edited localStorage entry would flow untyped into game
// state and set `depth` to a string. Everything here takes `unknown` and
// narrows it explicitly, so a bad save is rejected rather than trusted.

import { GENES, MAX_DEPTH, MICROBES, type GeneId } from "./biology.js";
import { BASE_SLOTS, MAX_SLOTS, TRAITS, atpCeiling, type TraitId }
  from "./chromosome.js";
import { MAX_FLOOR } from "./dungeon.js";
import { MAX_STRAIN } from "./strain.js";
import { RARITY, type Rarity } from "./parts.js";
import { PREFIXES, SUFFIXES, WILD_TYPE, type Allele, type PrefixId,
         type SuffixId } from "./allele.js";
import { MAX_STACK } from "./stack.js";
import { MAX_LEVEL, MODIFIERS, PROMOTERS, TERMINATORS, modifierSlots,
         type ModifierId, type PromoterId, type TerminatorId } from "./parts.js";

const isPromoterId = (v: unknown): v is PromoterId =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(PROMOTERS, v);
const isTerminatorId = (v: unknown): v is TerminatorId =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(TERMINATORS, v);
const isModifierId = (v: unknown): v is ModifierId =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(MODIFIERS, v);
import { BIN_CAP, SLOTS, type Part } from "./plasmid.js";

export interface Settings {
  /** Auto-attack. A toggle the player sets, so it belongs with the other
   *  settings -- as a bare field on Game it silently reset on reload. */
  readonly autoAttack: boolean;
  /** The player's zoom, as a multiple of the platform-independent default.
   *  Relative rather than absolute so it means the same thing on a phone and
   *  on a desktop, and so it survives a rotation. */
  readonly zoom: number;
  readonly uiScale: number;
  readonly highContrast: boolean;
  readonly reduceMotion: boolean;
  readonly diagonal: boolean;
}

/** Bump when the shape changes incompatibly. A save from an older schema is
 *  discarded rather than half-loaded: `version` was being written and never
 *  read, so the ring/bin rewrite would have fed a gene list into slot code. */
export const SCHEMA = 11;

/** Absolute world zoom the player may reach. */
export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 8;

/**
 * Bounds on the STORED preference, which is a multiple of the per-viewport
 * default rather than an absolute.
 *
 * Derived rather than picked. The default is itself floored at ZOOM_MIN and
 * can reach roughly 5 on a very large display, so the ratio needed to express
 * the whole absolute range runs from about 0.06 to about 27 -- a hand-chosen
 * bound of 4 silently turned "zoomed all the way in on a phone" into
 * something else on reload.
 */
export const ZOOM_PREF_MIN = ZOOM_MIN / 8;
export const ZOOM_PREF_MAX = ZOOM_MAX / ZOOM_MIN;

export interface SaveData {
  readonly version: number;
  readonly depth: number;
  /** Floor within the column, 1..MAX_FLOOR. */
  readonly floor: number;
  readonly seed: number;
  readonly px: number;
  readonly py: number;
  readonly hp: number;
  readonly atp: number;
  readonly ring: readonly (Part | null)[];
  readonly bin: readonly Part[];
  /** Modifiers picked up but not yet attached. These are the RARE drops --
   *  losing them on reload is worse than losing anything else in the save. */
  readonly heldMods: readonly ModifierId[];
  /** Turn count, so the diel cycle resumes rather than restarting at dawn. */
  readonly turn: number;
  /** Cassette sites integrated beyond the base, and architecture acquired. */
  readonly integrated: number;
  readonly traits: readonly TraitId[];
  /** Clock turn each visited floor was last stocked, so the pump does not
   *  reset on reload and a stripped floor stays stripped. */
  readonly stocked: readonly [number, number][];
  readonly won: boolean;
  /** Lineage state: the notebook, the score, the death count. Omitting this
   *  silently discarded every sighting the moment the tab closed. */
  readonly run: { deepest: number; deaths: number; bestiary: string[]; library: GeneId[] };
  readonly settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  autoAttack: false,
  zoom: 1, uiScale: 1, highContrast: false, reduceMotion: false, diagonal: true,
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

const bool = (v: unknown, fallback: boolean): boolean =>
  typeof v === "boolean" ? v : fallback;

const isGeneId = (v: unknown): v is GeneId =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(GENES, v);

/** Old three-strength promoters map onto the Anderson series they described. */
const LEGACY_PROMOTER: Readonly<Record<string, PromoterId>> = {
  weak: "j23114", medium: "j23106", strong: "j23119",
};

/** A saved allele, clamped to what a roll can actually produce. A hand-edited
 *  save must not out-perform anything reachable in play. */
function parseAllele(v: unknown): Allele {
  if (!isRecord(v)) return WILD_TYPE;
  const band = (x: unknown): number =>
    Math.min(Math.max(num(x, 1), 0.4), 2.2);
  const pre = v["prefix"];
  const suf = v["suffix"];
  const claimed = v["rarity"];
  return {
    kcat: band(v["kcat"]), km: band(v["km"]), stability: band(v["stability"]),
    // The claimed tier is kept, but `alleleRarity` clamps it to what the
    // numbers justify -- a save cannot mint a colour it has not earned.
    rarity: typeof claimed === "string"
      && Object.prototype.hasOwnProperty.call(RARITY, claimed)
      ? claimed as Rarity : "common",
    prefix: typeof pre === "string"
      && Object.prototype.hasOwnProperty.call(PREFIXES, pre) ? pre as PrefixId : null,
    suffix: typeof suf === "string"
      && Object.prototype.hasOwnProperty.call(SUFFIXES, suf) ? suf as SuffixId : null,
  };
}

function parsePart(v: unknown): Part | null {
  if (!isRecord(v)) return null;
  const kind = v["kind"];

  if (kind === "terminator") {
    const id = v["id"];
    // A save from before terminators had identities gets the standard single.
    return { kind: "terminator",
             id: isTerminatorId(id) ? id : "rrnbt1" };
  }

  if (kind === "promoter") {
    const id = v["id"];
    if (isPromoterId(id)) return { kind: "promoter", id };
    const legacy = v["strength"];
    return { kind: "promoter",
             id: typeof legacy === "string" ? LEGACY_PROMOTER[legacy] ?? "j23106" : "j23106" };
  }

  if (kind === "gene" && isGeneId(v["id"])) {
    // `optimised: true` becomes the codon modifier, which is what it was.
    const legacyOptimised = bool(v["optimised"], false);
    const mods = Array.isArray(v["mods"])
      ? [...new Set((v["mods"] as unknown[]).filter(isModifierId))]
      : legacyOptimised ? ["codon" as ModifierId] : [];
    const level = Math.min(Math.max(Math.round(num(v["level"], 1)), 1), MAX_LEVEL);
    const count = Math.min(Math.max(Math.round(num(v["count"], 1)), 1), MAX_STACK);
    // Never keep more modifiers than the level allows, or a hand-edited save
    // would out-perform anything reachable in play.
    return { kind: "gene", id: v["id"], level,
             mods: mods.slice(0, modifierSlots(level)),
             allele: parseAllele(v["allele"]),
             // Omitted when it is one, so an unstacked gene round-trips to
             // exactly what it was. Clamped otherwise: a hand-edited save must
             // not mint copies that play cannot produce.
             ...(count > 1 ? { count } : {}) };
  }
  return null;
}

function parseRun(v: unknown): SaveData["run"] {
  const empty = { deepest: 1, deaths: 0, bestiary: [] as string[], library: [] as GeneId[] };
  if (!isRecord(v)) return empty;
  const ids = new Set(MICROBES.map((m) => m.id));
  const bestiary = Array.isArray(v["bestiary"])
    ? [...new Set((v["bestiary"] as unknown[]).filter(
        (x): x is string => typeof x === "string" && ids.has(x)))]
    : [];
  const library = Array.isArray(v["library"])
    ? [...new Set((v["library"] as unknown[]).filter(isGeneId))]
    : [];
  return {
    // A FLOOR, 1..MAX_FLOOR -- strain.ts normalises it by MAX_FLOOR and the
    // invariant bounds it by MAX_DEPTH*3. Clamping it to MAX_DEPTH here read
    // it as a stratum and silently cut a floor-20 lineage back to 8 on load,
    // taking its strain level with it.
    deepest: Math.min(Math.max(num(v["deepest"], 1), 1), MAX_FLOOR),
    deaths: Math.max(num(v["deaths"], 0), 0),
    bestiary, library,
  };
}

/** The parts bin: a plain list, deduplicated against itself. */
function parseBin(v: unknown): Part[] {
  if (!Array.isArray(v)) return [];
  const out: Part[] = [];
  const seen = new Set<GeneId>();
  for (const entry of (v as unknown[]).slice(0, BIN_CAP)) {
    const p = parsePart(entry);
    if (p === null) continue;
    if (p.kind === "gene") {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
    }
    out.push(p);
  }
  return out;
}

/** Fixed-length ring; anything unrecognised becomes an empty slot. */
function parseRing(v: unknown): (Part | null)[] {
  const out = Array<Part | null>(SLOTS).fill(null);
  if (!Array.isArray(v)) return out;
  const seen = new Set<GeneId>();
  (v as unknown[]).slice(0, SLOTS).forEach((entry, i) => {
    const p = parsePart(entry);
    if (p === null) return;
    if (p.kind === "gene") {
      if (seen.has(p.id)) return;      // a duplicated gene would break add()
      seen.add(p.id);
    }
    out[i] = p;
  });
  return out;
}

function parseSettings(v: unknown): Settings {
  if (!isRecord(v)) return DEFAULT_SETTINGS;
  return {
    autoAttack: v["autoAttack"] === true,
    // Defaulted, not schema-bumped: an older save simply has no zoom
    // preference and gets the standard one, which is better than discarding
    // the save outright.
    // Wide enough to REPRESENT any zoom the player can reach; main.ts
    // re-clamps the absolute value, so a generous bound here is safe.
    zoom: Math.min(Math.max(num(v["zoom"], 1), ZOOM_PREF_MIN), ZOOM_PREF_MAX),
    uiScale: Math.min(Math.max(num(v["uiScale"], 1), 0.5), 3),
    highContrast: bool(v["highContrast"], false),
    reduceMotion: bool(v["reduceMotion"], false),
    diagonal: bool(v["diagonal"], true),
  };
}

/** Narrows unknown -> SaveData, or null if the payload is unusable. */
export function parseSave(raw: unknown): SaveData | null {
  if (!isRecord(raw)) return null;
  const v = raw["version"];
  if (typeof v !== "number" || v !== SCHEMA) return null;
  const depth = Math.round(num(raw["depth"], 1));
  const px = num(raw["px"], NaN);
  const py = num(raw["py"], NaN);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
  return {
    version: SCHEMA,
    depth: Math.min(Math.max(depth, 1), MAX_DEPTH),
    floor: Math.min(Math.max(num(raw["floor"], 1), 1), MAX_FLOOR),
    seed: Math.round(num(raw["seed"], 7)),
    px: Math.round(px),
    py: Math.round(py),
    // Bounded above as well as below. Everything else here is clamped to what
    // play can produce; hp was the one field a hand-edited save could set to
    // anything. `vitality` caps at 92.
    hp: Math.min(Math.max(num(raw["hp"], 30), 1), 92),
    // The pool is NOT a flat 100. `atpCeiling` scales with the chromosome and
    // the strain to 350, and clamping a load to 100 quietly destroyed up to
    // 250 ATP on every reload -- the currency that pays for expansions (to
    // 324) and traits (130/190/260), so the late growth curve became
    // unpayable across a save. Clamped to the largest pool any strain can
    // hold; `upkeep` brings it down to this strain's real ceiling next turn.
    atp: Math.min(Math.max(num(raw["atp"], 100), 0),
                  atpCeiling(MAX_SLOTS - BASE_SLOTS, MAX_STRAIN)),
    ring: parseRing(raw["ring"]),
    bin: parseBin(raw["bin"]),
    heldMods: Array.isArray(raw["heldMods"])
      ? (raw["heldMods"] as unknown[]).filter(isModifierId).slice(0, 40)
      : [],
    turn: Math.min(Math.max(Math.round(num(raw["turn"], 0)), 0), 1e7),
    integrated: Math.min(Math.max(Math.round(num(raw["integrated"], 0)), 0),
                         MAX_SLOTS - BASE_SLOTS),
    traits: Array.isArray(raw["traits"])
      ? [...new Set((raw["traits"] as unknown[]).filter(
          (x): x is TraitId => typeof x === "string"
            && Object.prototype.hasOwnProperty.call(TRAITS, x)))]
      : [],
    stocked: Array.isArray(raw["stocked"])
      ? (raw["stocked"] as unknown[]).flatMap((e): [number, number][] =>
          Array.isArray(e) && e.length === 2
            && typeof e[0] === "number" && typeof e[1] === "number"
            ? [[Math.round(e[0]), Math.max(Math.round(e[1]), 0)]] : [])
          .slice(0, MAX_FLOOR)
      : [],
    won: bool(raw["won"], false),
    run: parseRun(raw["run"]),
    settings: parseSettings(raw["settings"]),
  };
}

export function readSave(key: string): SaveData | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    return parseSave(JSON.parse(raw) as unknown);
  } catch {
    return null;  // private browsing, quota, corrupt JSON -- all non-fatal
  }
}

/**
 * Write a save. Returns whether it actually landed.
 *
 * Losing a save is better than crashing -- but losing one SILENTLY is worse
 * than either, and this returned void the whole way up. On a full quota or in
 * private browsing every save failed, nothing anywhere said so, and the run
 * vanished when the tab closed.
 */
export function writeSave(key: string, data: SaveData): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
