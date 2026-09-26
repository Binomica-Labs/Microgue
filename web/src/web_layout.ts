// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// The bench as a constellation: every gene in the game, dim until you hold it.
//
// The tree was built from what the player HAS, which meant a new strain got
// two dots and a V, and three releases of tuning could not fix that because
// the problem was not the proportions -- it was that an empty tree has
// nothing to draw. A map of what EXISTS is full from the first second, and
// acquiring a gene lights a node that was already there.
//
// That is also the better teaching object. A player who opens this on turn
// one sees the whole metabolic space laid out: twelve pathways, eighty-nine
// genes, core metabolism at the centre and the strange deep chemistry at
// the rim. Progress is a region of the map coming on.
//
// Position carries meaning, so the shape is readable rather than decorative:
//
//   ANGLE  = pathway. Twelve sectors, in the ring's own colour order, so the
//            map and the plasmid agree about what colour nitrogen is.
//   RADIUS = tier. Tier 1 sits near the middle and tier 8 at the edge,
//            because that is what depth means here: common chemistry first,
//            then the things only one organism on the floor can do.
//
// Lit nodes connect to their lit neighbours -- that is the web, and it only
// exists where a player has actually built something.

import { GENES, type GeneId, type Pathway } from "./biology.js";

/** The twelve, in a fixed order so the map never reshuffles. */
export const PATHWAY_ORDER: readonly Pathway[] = [
  "core", "carbon", "photo", "energy", "nitrogen", "sulfur",
  "iron", "methane", "stress", "resist", "motility", "secretion",
];

export interface WebNode {
  readonly id: GeneId;
  readonly pathway: Pathway;
  readonly tier: number;
  /** Unit coordinates, -1..1. The view applies zoom and pan. */
  readonly x: number;
  readonly y: number;
  /** On the ring right now. */
  readonly installed: boolean;
  /** Held in the bin -- known, not running. */
  readonly held: boolean;
  /** Level, if it has one. */
  readonly level: number;
}

export interface WebEdge {
  readonly a: GeneId;
  readonly b: GeneId;
  /**
   * The endpoints, RESOLVED.
   *
   * The renderer looked these up with `nodes.find()` -- twice per edge,
   * once for the dim pass and once for the live one. Seventy-seven edges
   * against eighty-eight nodes measured 22.5us a frame doing nothing but
   * searching an array it already had. The layout knows where they are;
   * it should say so.
   */
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly pathway: Pathway;
  /** Both ends lit: this strand of the web is real. */
  readonly live: boolean;
}

export interface Web {
  readonly nodes: readonly WebNode[];
  readonly edges: readonly WebEdge[];
}

/**
 * Lay out every gene in the game.
 *
 * Deterministic and independent of what the player holds, so a gene is
 * ALWAYS in the same place: a map that moved as you filled it would be
 * unlearnable, and the whole value of a constellation is that you start to
 * know where things are.
 */
export function buildWeb(
  installed: ReadonlyMap<GeneId, number>, held: ReadonlySet<GeneId>,
): Web {
  const byPath = new Map<Pathway, GeneId[]>();
  for (const [id, g] of Object.entries(GENES)) {
    if (id === "ori") continue;
    const list = byPath.get(g.pathway);
    if (list) list.push(id as GeneId);
    else byPath.set(g.pathway, [id as GeneId]);
  }

  const nodes: WebNode[] = [];
  const at = new Map<GeneId, { x: number; y: number }>();

  PATHWAY_ORDER.forEach((p, pi) => {
    const list = (byPath.get(p) ?? []).slice().sort();
    if (list.length === 0) return;
    const sector = (Math.PI * 2) / PATHWAY_ORDER.length;
    const mid = pi * sector - Math.PI / 2;
    list.forEach((id, i) => {
      const tier = Math.min(Math.max(GENES[id].tier, 1), 8);
      // Tier sets the radius; the index fans within the sector so genes of
      // the same tier do not stack on one point.
      const r = 0.22 + (tier - 1) / 7 * 0.72;
      const spread = sector * 0.78;
      const t = list.length === 1 ? 0.5 : i / (list.length - 1);
      const a = mid + (t - 0.5) * spread;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      at.set(id, { x, y });
      nodes.push({
        id, pathway: p, tier, x, y,
        installed: installed.has(id),
        held: held.has(id),
        level: installed.get(id) ?? 0,
      });
    });
  });

  // Strands: each gene to the next one out in its own pathway. The web is
  // the pathway's own order, so a player who fills a pathway watches a line
  // complete rather than a scatter of dots appear.
  const edges: WebEdge[] = [];
  for (const [, list] of byPath) {
    const sorted = list.slice().sort(
      (x, y) => GENES[x].tier - GENES[y].tier || (x < y ? -1 : 1));
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1], b = sorted[i];
      if (a === undefined || b === undefined) continue;
      const pa = at.get(a), pb = at.get(b);
      if (!pa || !pb) continue;
      const lit = (g: GeneId): boolean => installed.has(g) || held.has(g);
      edges.push({ a, b, ax: pa.x, ay: pa.y, bx: pb.x, by: pb.y,
                   pathway: GENES[a].pathway, live: lit(a) && lit(b) });
    }
  }
  return { nodes, edges };
}

/** The node under a point in unit space, or null. */
export function webNodeAt(
  web: Web, x: number, y: number, radius: number,
): WebNode | null {
  let best: WebNode | null = null;
  let bestD = radius;
  for (const n of web.nodes) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d <= bestD) { best = n; bestD = d; }
  }
  return best;
}
