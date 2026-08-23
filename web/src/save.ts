// Save serialisation with a real runtime validator.
//
// JSON.parse returns `any`, which is a hole straight through the type system:
// a corrupted or hand-edited localStorage entry would flow untyped into game
// state and set `depth` to a string. Everything here takes `unknown` and
// narrows it explicitly, so a bad save is rejected rather than trusted.

import { GENES, MAX_DEPTH, type GeneId } from "./biology.js";
import { BIN_CAP, SLOTS, type Part, type Strength } from "./plasmid.js";

export interface Settings {
  readonly uiScale: number;
  readonly highContrast: boolean;
  readonly reduceMotion: boolean;
  readonly diagonal: boolean;
}

/** Bump when the shape changes incompatibly. A save from an older schema is
 *  discarded rather than half-loaded: `version` was being written and never
 *  read, so the ring/bin rewrite would have fed a gene list into slot code. */
export const SCHEMA = 3;

export interface SaveData {
  readonly version: number;
  readonly depth: number;
  readonly seed: number;
  readonly px: number;
  readonly py: number;
  readonly hp: number;
  readonly atp: number;
  readonly ring: readonly (Part | null)[];
  readonly bin: readonly Part[];
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

const STRENGTHS: readonly string[] = ["weak", "medium", "strong"];

function parsePart(v: unknown): Part | null {
  if (!isRecord(v)) return null;
  const kind = v["kind"];
  if (kind === "terminator") return { kind: "terminator" };
  if (kind === "promoter") {
    const st = v["strength"];
    const strength: Strength =
      typeof st === "string" && STRENGTHS.includes(st) ? (st as Strength) : "medium";
    return { kind: "promoter", strength };
  }
  if (kind === "gene" && isGeneId(v["id"])) {
    return { kind: "gene", id: v["id"], optimised: bool(v["optimised"], false) };
  }
  return null;
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
    seed: Math.round(num(raw["seed"], 7)),
    px: Math.round(px),
    py: Math.round(py),
    hp: Math.max(num(raw["hp"], 30), 1),
    atp: Math.min(Math.max(num(raw["atp"], 100), 0), 100),
    ring: parseRing(raw["ring"]),
    bin: parseBin(raw["bin"]),
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
