// Save serialisation with a real runtime validator.
//
// JSON.parse returns `any`, which is a hole straight through the type system:
// a corrupted or hand-edited localStorage entry would flow untyped into game
// state and set `depth` to a string. Everything here takes `unknown` and
// narrows it explicitly, so a bad save is rejected rather than trusted.

import { GENES, MAX_DEPTH, MICROBES, type GeneId } from "./biology.js";
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
  readonly uiScale: number;
  readonly highContrast: boolean;
  readonly reduceMotion: boolean;
  readonly diagonal: boolean;
}

/** Bump when the shape changes incompatibly. A save from an older schema is
 *  discarded rather than half-loaded: `version` was being written and never
 *  read, so the ring/bin rewrite would have fed a gene list into slot code. */
export const SCHEMA = 8;

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
  uiScale: 1, highContrast: false, reduceMotion: false, diagonal: true,
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
    // Never keep more modifiers than the level allows, or a hand-edited save
    // would out-perform anything reachable in play.
    return { kind: "gene", id: v["id"], level,
             mods: mods.slice(0, modifierSlots(level)) };
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
    deepest: Math.min(Math.max(num(v["deepest"], 1), 1), MAX_DEPTH),
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
    floor: Math.min(Math.max(num(raw["floor"], 1), 1), MAX_DEPTH * 3),
    seed: Math.round(num(raw["seed"], 7)),
    px: Math.round(px),
    py: Math.round(py),
    hp: Math.max(num(raw["hp"], 30), 1),
    atp: Math.min(Math.max(num(raw["atp"], 100), 0), 100),
    ring: parseRing(raw["ring"]),
    bin: parseBin(raw["bin"]),
    heldMods: Array.isArray(raw["heldMods"])
      ? (raw["heldMods"] as unknown[]).filter(isModifierId).slice(0, 40)
      : [],
    turn: Math.min(Math.max(Math.round(num(raw["turn"], 0)), 0), 1e7),
    stocked: Array.isArray(raw["stocked"])
      ? (raw["stocked"] as unknown[]).flatMap((e): [number, number][] =>
          Array.isArray(e) && e.length === 2
            && typeof e[0] === "number" && typeof e[1] === "number"
            ? [[Math.round(e[0]), Math.max(Math.round(e[1]), 0)]] : [])
          .slice(0, MAX_DEPTH * 3)
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

export function writeSave(key: string, data: SaveData): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Quota or private browsing. Losing a save is better than crashing.
  }
}
