// Real sequences, fetched from NCBI at export time.
//
// Two deliberate choices:
//
// 1. QUERIES, NOT ACCESSIONS. A baked accession is a number I would have to
//    get right and that can be superseded. A gene-plus-organism query is
//    self-documenting, survives reannotation, and if it ever resolves wrongly
//    the fix is legible. esearch resolves it; efetch pulls the record.
//
// 2. FETCHED, NOT BUNDLED. Twenty-four coding sequences is tens of kilobytes
//    of bases -- more than the entire rest of the game. They are pulled on
//    demand and cached, so the bundle stays small and the sequence is whatever
//    NCBI currently holds rather than whatever was true on build day.
//
// If the fetch fails -- offline, rate limited, or blocked by CORS -- the
// export still emits the annotation WITH the query strings, so the sequences
// remain obtainable by hand. It never invents bases.

import type { GeneId } from "./biology.js";

export interface Source {
  /** Entrez query. Organism chosen to match who carries the gene in game. */
  readonly query: string;
  readonly organism: string;
}

export const SOURCES: Partial<Record<GeneId, Source>> = {
  psbA: { query: 'psbA[Gene] AND "Synechococcus elongatus"[Organism]', organism: "Synechococcus elongatus" },
  cbbL: { query: 'cbbL[Gene] AND "Synechococcus elongatus"[Organism]', organism: "Synechococcus elongatus" },
  katG: { query: 'katG[Gene] AND "Escherichia coli K-12"[Organism]', organism: "Escherichia coli K-12" },
  amoA: { query: 'amoA[Gene] AND "Nitrosomonas europaea"[Organism]', organism: "Nitrosomonas europaea" },
  // Winogradsky's own namesake organism, in a Winogradsky column.
  nxrA: { query: 'nxrA[Gene] AND "Nitrobacter winogradskyi"[Organism]', organism: "Nitrobacter winogradskyi" },
  narG: { query: 'narG[Gene] AND "Escherichia coli K-12"[Organism]', organism: "Escherichia coli K-12" },
  nirS: { query: 'nirS[Gene] AND "Pseudomonas stutzeri"[Organism]', organism: "Pseudomonas stutzeri" },
  norB: { query: 'norB[Gene] AND "Pseudomonas aeruginosa"[Organism]', organism: "Pseudomonas aeruginosa" },
  nosZ: { query: 'nosZ[Gene] AND "Pseudomonas stutzeri"[Organism]', organism: "Pseudomonas stutzeri" },
  nifH: { query: 'nifH[Gene] AND "Rhodospirillum rubrum"[Organism]', organism: "Rhodospirillum rubrum" },
  soxB: { query: 'soxB[Gene] AND "Paracoccus denitrificans"[Organism]', organism: "Paracoccus denitrificans" },
  sqr:  { query: 'sqr[Gene] AND "Rhodobacter capsulatus"[Organism]', organism: "Rhodobacter capsulatus" },
  mtrC: { query: 'mtrC[Gene] AND "Shewanella oneidensis"[Organism]', organism: "Shewanella oneidensis MR-1" },
  omcS: { query: 'omcS[Gene] AND "Geobacter sulfurreducens"[Organism]', organism: "Geobacter sulfurreducens PCA" },
  pufM: { query: 'pufM[Gene] AND "Allochromatium vinosum"[Organism]', organism: "Allochromatium vinosum" },
  fmoA: { query: 'fmoA[Gene] AND "Chlorobaculum tepidum"[Organism]', organism: "Chlorobaculum tepidum" },
  csmA: { query: 'csmA[Gene] AND "Chlorobaculum tepidum"[Organism]', organism: "Chlorobaculum tepidum" },
  aclB: { query: 'aclB[Gene] AND "Chlorobium limicola"[Organism]', organism: "Chlorobium limicola" },
  sat:  { query: 'sat[Gene] AND "Desulfovibrio vulgaris"[Organism]', organism: "Desulfovibrio vulgaris Hildenborough" },
  aprA: { query: 'aprA[Gene] AND "Desulfovibrio vulgaris"[Organism]', organism: "Desulfovibrio vulgaris Hildenborough" },
  dsrA: { query: 'dsrA[Gene] AND "Desulfovibrio vulgaris"[Organism]', organism: "Desulfovibrio vulgaris Hildenborough" },
  hydA: { query: 'hydA[Gene] AND "Desulfovibrio vulgaris"[Organism]', organism: "Desulfovibrio vulgaris Hildenborough" },
  luxAB: { query: 'luxA[Gene] AND "Aliivibrio fischeri"[Organism]', organism: "Aliivibrio fischeri" },
  // Degradative enzymes. Each from the organism the enzyme is named for.
  chiA: { query: 'chiA[Gene] AND "Serratia marcescens"[Organism]', organism: "Serratia marcescens" },
  celA: { query: 'celA[Gene] AND "Clostridium thermocellum"[Organism]', organism: "Clostridium thermocellum" },
  dspB: { query: 'dspB[Gene] AND "Aggregatibacter actinomycetemcomitans"[Organism]', organism: "Aggregatibacter actinomycetemcomitans" },
  mcrA: { query: 'mcrA[Gene] AND "Methanosarcina barkeri"[Organism]', organism: "Methanosarcina barkeri" },
  hdrB: { query: 'hdrB[Gene] AND "Methanosarcina barkeri"[Organism]', organism: "Methanosarcina barkeri" },
  // oriV is a design element, not a locus. It has no NCBI record and must not
  // be given one.
};

const BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const CACHE_KEY = "microgue:seqcache";
/** NCBI asks for no more than three requests a second without an API key. */
const MIN_INTERVAL_MS = 400;

export interface Record_ {
  readonly gene: GeneId;
  readonly accession: string;
  readonly defline: string;
  readonly seq: string;
}

export type Fetcher = (url: string) => Promise<string>;

/** The default fetcher. Injected in tests so nothing touches the network. */
export const httpFetcher: Fetcher = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
  return res.text();
};

/** First UID from an esearch reply. The response is XML, not JSON. */
export function parseFirstId(xml: string): string | null {
  const m = /<Id>(\d+)<\/Id>/.exec(xml);
  return m?.[1] ?? null;
}

/** Accession, defline and bases from a FASTA record. */
export function parseFasta(text: string): { accession: string; defline: string; seq: string } | null {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const head = lines[0];
  if (head?.startsWith(">") !== true) return null;
  const defline = head.slice(1);
  const accession = defline.split(/\s+/)[0] ?? "";
  const seq = lines.slice(1).join("");
  if (!/^[ACGTUNRYKMSWBDHV]+$/i.test(seq)) return null;   // refuse anything that is not sequence
  return { accession, defline, seq };
}

type Cache = Record<string, { accession: string; defline: string; seq: string }>;

function readCache(): Cache {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Cache) : {};
  } catch { return {}; }
}

function writeCache(c: Cache): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* quota */ }
}

export function cached(gene: GeneId): Record_ | null {
  const hit = readCache()[gene];
  return hit ? { gene, ...hit } : null;
}

export function clearCache(): void {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => { setTimeout(r, ms); });

/**
 * Fetch one locus. Returns null rather than throwing, because a failed lookup
 * must degrade the export, not break it.
 */
export async function fetchOne(
  gene: GeneId, fetcher: Fetcher = httpFetcher, useCache = true,
): Promise<Record_ | null> {
  const src = SOURCES[gene];
  if (!src) return null;
  if (useCache) {
    const hit = cached(gene);
    if (hit) return hit;
  }
  try {
    const idXml = await fetcher(
      `${BASE}/esearch.fcgi?db=nuccore&retmax=1&term=${encodeURIComponent(src.query)}`);
    const id = parseFirstId(idXml);
    if (id === null) return null;

    await sleep(MIN_INTERVAL_MS);
    const fasta = await fetcher(
      `${BASE}/efetch.fcgi?db=nuccore&id=${id}&rettype=fasta&retmode=text`);
    const rec = parseFasta(fasta);
    if (!rec) return null;

    if (useCache) {
      const c = readCache();
      c[gene] = rec;
      writeCache(c);
    }
    return { gene, ...rec };
  } catch {
    return null;
  }
}

export interface FetchProgress { done: number; total: number; gene: GeneId; ok: boolean; }

/** Fetch a set of loci, throttled, reporting progress. */
export async function fetchAll(
  genes: readonly GeneId[], fetcher: Fetcher = httpFetcher,
  onProgress?: (p: FetchProgress) => void,
): Promise<Map<GeneId, Record_>> {
  const out = new Map<GeneId, Record_>();
  const wanted = genes.filter((g) => SOURCES[g] !== undefined);
  for (const [i, g] of wanted.entries()) {
    const rec = await fetchOne(g, fetcher);
    if (rec) out.set(g, rec);
    onProgress?.({ done: i + 1, total: wanted.length, gene: g, ok: rec !== null });
    if (i < wanted.length - 1) await sleep(MIN_INTERVAL_MS);
  }
  return out;
}
