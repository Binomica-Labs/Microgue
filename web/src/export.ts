// The FASTA export.
//
// Split out of main.ts, which holds STATE and LIFECYCLE only -- fetching
// sequences, formatting a record and talking to the clipboard is a feature.
// The 900-line ceiling in test/safety.test.ts is what forced the split, which
// is the ceiling doing its job.

import { SOURCES, cached, fetchAll } from "./ncbi.js";
import { exportAnnotation } from "./run.js";
import type { Game } from "./main.js";

/**
 * Copy the plasmid as FASTA.
 *
 * Fetches anything not already cached. A locus that cannot be retrieved is
 * emitted with its Entrez query rather than with invented bases.
 */
export function x_export(_g: Game): void {
  if (_g.exporting) return;
  const genes = _g.genome.slots
    .flatMap((p) => (p?.kind === "gene" && SOURCES[p.id] ? [p.id] : []));
  const missing = genes.filter((g) => cached(g) === null);

  if (missing.length === 0) { emit(_g); return; }

  _g.exporting = true;
  _g.toasts.push(
    `Fetching ${String(missing.length)} sequence${missing.length === 1 ? "" : "s"} from NCBI…`,
    "info", _g.now);
  void fetchAll(missing, undefined, (p) => {
    if (!p.ok) _g.toasts.push(`${p.gene}: no record returned.`, "warn", _g.now);
  }).then((got) => {
    _g.exporting = false;
    if (got.size === 0 && missing.length > 0) {
      _g.toasts.push("NCBI unreachable. Exporting queries instead of sequences.",
                     "warn", _g.now);
    }
    emit(_g);
  }).catch(() => {
    _g.exporting = false;
    _g.toasts.push("Sequence fetch failed. Exporting queries instead.", "warn", _g.now);
    emit(_g);
  });
}

function emit(_g: Game): void {
  const seqs = new Map(_g.genome.slots
    .flatMap((p) => {
      if (p?.kind !== "gene") return [];
      const rec = cached(p.id);
      return rec ? [[p.id, rec] as const] : [];
    }));
  const text = exportAnnotation(_g.runName, _g.dungeon.depth, _g.genome.slots, seqs);
  const withSeq = seqs.size;
  // The type says clipboard always exists; on http:// and older browsers it
  // does not, so the check is real even though TypeScript disbelieves it.
  const nav: { clipboard?: { writeText(s: string): Promise<void> } } = navigator;
  if (nav.clipboard === undefined) {
    _g.toasts.push("No clipboard available on this browser.", "warn", _g.now);
    return;
  }
  void nav.clipboard.writeText(text)
    .then(() => {
      _g.toasts.push(
        `Plasmid copied. ${String(withSeq)} sequence${withSeq === 1 ? "" : "s"} included.`,
        "info", _g.now);
    })
    .catch(() => { _g.toasts.push("Clipboard refused. Nothing copied.", "warn", _g.now); });
}
