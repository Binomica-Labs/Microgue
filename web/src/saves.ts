// Named characters in numbered slots.
//
// A run is a nanobot with a name, a depth reached and a plasmid. Keeping the
// index separate from the payloads means the splash screen can list runs
// without parsing every save.

import { parseSave, readSave, writeSave, SCHEMA, type SaveData } from "./save.js";

export const SLOTS = 4;
const INDEX_KEY = "microgue:index";
const slotKey = (i: number): string => `microgue:slot${i}`;

export interface SlotInfo {
  readonly slot: number;
  readonly name: string;
  readonly depth: number;
  readonly genes: number;
  readonly updated: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function parseInfo(v: unknown): SlotInfo | null {
  if (!isRecord(v)) return null;
  const slot = v["slot"];
  const name = v["name"];
  if (typeof slot !== "number" || slot < 0 || slot >= SLOTS) return null;
  if (typeof name !== "string" || name.length === 0) return null;
  return {
    slot: Math.floor(slot),
    name: name.slice(0, 18),
    depth: typeof v["depth"] === "number" ? Math.floor(v["depth"]) : 1,
    genes: typeof v["genes"] === "number" ? Math.floor(v["genes"]) : 0,
    updated: typeof v["updated"] === "number" ? v["updated"] : 0,
  };
}

export function listSlots(): (SlotInfo | null)[] {
  const out: (SlotInfo | null)[] = Array<SlotInfo | null>(SLOTS).fill(null);
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (raw === null) return out;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return out;
    for (const entry of parsed as unknown[]) {
      const info = parseInfo(entry);
      if (info) out[info.slot] = info;
    }
  } catch { /* corrupt index is an empty index, never a crash */ }
  return out;
}

function writeIndex(list: (SlotInfo | null)[]): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list.filter((s) => s !== null)));
  } catch { /* quota or private browsing */ }
}

export function saveSlot(slot: number, name: string, data: SaveData, genes: number): void {
  if (slot < 0 || slot >= SLOTS) return;
  writeSave(slotKey(slot), data);
  const list = listSlots();
  list[slot] = {
    slot, name: name.slice(0, 18) || "unnamed",
    depth: data.depth, genes, updated: Date.now(),
  };
  writeIndex(list);
}

export function loadSlot(slot: number): SaveData | null {
  if (slot < 0 || slot >= SLOTS) return null;
  return readSave(slotKey(slot));
}

export function deleteSlot(slot: number): void {
  if (slot < 0 || slot >= SLOTS) return;
  try { localStorage.removeItem(slotKey(slot)); } catch { /* ignore */ }
  const list = listSlots();
  list[slot] = null;
  writeIndex(list);
}

/** Migrate the single unnamed save from before slots existed. */
export function migrateLegacy(): boolean {
  try {
    const raw = localStorage.getItem("microgue:v1");
    if (raw === null) return false;
    const data = parseSave(JSON.parse(raw) as unknown);
    localStorage.removeItem("microgue:v1");
    if (data?.version !== SCHEMA) return false;
    saveSlot(0, "recovered", data, 0);
    return true;
  } catch { return false; }
}

/** Names suggested on the splash screen. Strain designations, because that is
 *  what you would actually call an engineered isolate. */
export const NAME_POOL: readonly string[] = [
  "SP162", "K-12", "MR-1", "PCA", "Hildenborough", "DSM-1", "ATCC-6633",
  "Δrec-4", "pMG-7", "vent-9", "WXM5S4", "clone-B",
];
