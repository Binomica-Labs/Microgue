// The lab is saved SEPARATELY from the run.
//
// A run save belongs to a slot and dies with the strain. The lab outlives
// every strain, so it must not live in a slot file -- deleting a save, or
// dying, would take the whole meta-progression with it. That is a bug worth
// designing out rather than remembering.

import { GENES, type GeneId } from "./biology.js";
import { BASE_SLOTS, MAX_SLOTS } from "./chromosome.js";
import { MAX_STRAIN } from "./strain.js";
import { LEDGER_CAP, newLab, stockCap, type Lab, type RunRecord } from "./lab.js";
import { MAX_FLOOR } from "./dungeon.js";

export const LAB_KEY = "microgue:lab:v1";

const num = (v: unknown, d: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : d;
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isGeneId = (v: unknown): v is GeneId =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(GENES, v);

function parseRecord(v: unknown, i: number): RunRecord | null {
  if (!isRecord(v)) return null;
  return {
    n: Math.max(Math.round(num(v["n"], i + 1)), 1),
    floor: Math.min(Math.max(Math.round(num(v["floor"], 1)), 1), MAX_FLOOR),
    stratum: typeof v["stratum"] === "string" ? v["stratum"].slice(0, 40) : "?",
    turns: Math.max(Math.round(num(v["turns"], 0)), 0),
    catalogued: Math.max(Math.round(num(v["catalogued"], 0)), 0),
    killedBy: typeof v["killedBy"] === "string" ? v["killedBy"].slice(0, 60) : "?",
    credit: Math.max(Math.round(num(v["credit"], 0)), 0),
    won: v["won"] === true,
    epitaph: Array.isArray(v["epitaph"])
      ? (v["epitaph"] as unknown[])
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.slice(0, 100)).slice(-8)
      : [],
  };
}

/** Parse a stored lab, clamping everything to what play can produce. */
export function parseLab(raw: unknown): Lab {
  if (!isRecord(raw)) return newLab();
  const ledger = Array.isArray(raw["ledger"])
    ? (raw["ledger"] as unknown[])
        .map((e, i) => parseRecord(e, i))
        .filter((e): e is RunRecord => e !== null)
        .slice(-LEDGER_CAP)
    : [];
  const startSites = Math.min(Math.max(Math.round(num(raw["startSites"], 0)), 0),
                              MAX_SLOTS - BASE_SLOTS);
  return {
    credit: Math.min(Math.max(Math.round(num(raw["credit"], 0)), 0), 1e9),
    deepestEver: Math.min(Math.max(Math.round(num(raw["deepestEver"], 0)), 0), MAX_FLOOR),
    ledger,
    // Cut to what THIS lab can actually send down. A flat 60 was the old cap
    // and `buy` has enforced `stockCap` for a while, so a lab written before
    // that -- or edited by hand -- loaded a manifest the strain could never
    // carry, and the surplus was dropped at inoculation with nothing said.
    stock: Array.isArray(raw["stock"])
      ? [...new Set((raw["stock"] as unknown[]).filter(isGeneId))]
          .slice(0, stockCap(startSites))
      : [],
    startSites,
    startStrain: Math.min(Math.max(Math.round(num(raw["startStrain"], 1)), 1), MAX_STRAIN),
  };
}

export function readLab(): Lab {
  try {
    const raw = localStorage.getItem(LAB_KEY);
    return raw === null ? newLab() : parseLab(JSON.parse(raw));
  } catch { return newLab(); }
}

export function writeLab(lab: Lab): boolean {
  try {
    localStorage.setItem(LAB_KEY, JSON.stringify(lab));
    return true;
  } catch { return false; }
}
