// Save serialisation with a real runtime validator.
//
// JSON.parse returns `any`, which is a hole straight through the type system:
// a corrupted or hand-edited localStorage entry would flow untyped into game
// state and set `depth` to a string. Everything here takes `unknown` and
// narrows it explicitly, so a bad save is rejected rather than trusted.

import { GENES, MAX_DEPTH, type GeneId } from "./biology.js";

export interface Settings {
  readonly uiScale: number;
  readonly highContrast: boolean;
  readonly reduceMotion: boolean;
  readonly diagonal: boolean;
}

export interface SaveData {
  readonly version: 1;
  readonly depth: number;
  readonly seed: number;
  readonly px: number;
  readonly py: number;
  readonly hp: number;
  readonly genes: readonly (readonly [GeneId, boolean])[];
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

function parseGenes(v: unknown): (readonly [GeneId, boolean])[] {
  if (!Array.isArray(v)) return [];
  const out: (readonly [GeneId, boolean])[] = [];
  for (const entry of v as unknown[]) {
    if (!Array.isArray(entry)) continue;
    const [id, optimised] = entry as unknown[];
    if (isGeneId(id)) out.push([id, bool(optimised, false)]);
  }
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
  const depth = Math.round(num(raw["depth"], 1));
  const px = num(raw["px"], NaN);
  const py = num(raw["py"], NaN);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
  return {
    version: 1,
    depth: Math.min(Math.max(depth, 1), MAX_DEPTH),
    seed: Math.round(num(raw["seed"], 7)),
    px: Math.round(px),
    py: Math.round(py),
    hp: Math.max(num(raw["hp"], 30), 1),
    genes: parseGenes(raw["genes"]),
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
