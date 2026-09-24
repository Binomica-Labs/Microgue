// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// THE BENCH, as a tree.
//
// The bench was a list: one row per gene, stacked down the left, with two
// thirds of the screen empty below it. Space-inefficient, and it said
// nothing about the thing it was showing -- a list of genes is a list of
// anything.
//
// A cell's genes are not a list. They belong to PATHWAYS, the game already
// colours those twelve ways, and the pathways are exactly what a player is
// choosing between when they spend ATP. So: a trunk for the chromosome,
// a branch per pathway you carry genes in, and a node per gene along it.
// Levelling thickens the branch it sits on, which makes a specialised
// strain LOOK specialised.
//
// Layout is a pure function of (genes, size) so it can be tested without a
// canvas, and so the renderer never decides where anything goes.

import { GENES, type GeneId, type Pathway } from "./biology.js";

export interface TreeGene {
  readonly id: GeneId;
  readonly level: number;
}

export interface TreeNode {
  readonly id: GeneId;
  readonly pathway: Pathway;
  readonly level: number;
  /** Centre, in screen pixels. */
  readonly x: number;
  readonly y: number;
  readonly r: number;
  /** Where the branch this sits on starts, for drawing the limb. */
  readonly fromX: number;
  readonly fromY: number;
}

export interface TreeLayout {
  /** Where the trunk meets the bottom. */
  readonly rootX: number;
  readonly rootY: number;
  /** The fork the branches leave from. */
  readonly forkY: number;
  readonly nodes: readonly TreeNode[];
  /** One entry per pathway branch: its angle and how thick it is. */
  readonly branches: readonly {
    readonly pathway: Pathway;
    readonly angle: number;
    readonly thickness: number;
    readonly tipX: number;
    readonly tipY: number;
  }[];
}

/**
 * Lay the tree out.
 *
 * Branches fan across an arc centred on straight up, widest when there are
 * many pathways and tight when there are few -- a two-branch tree that
 * splayed to the screen edges would look broken rather than sparse.
 */
export function layout(
  genes: readonly TreeGene[], w: number, h: number, u: number,
): TreeLayout {
  const rootX = w / 2;
  const rootY = h - 24 * u;
  const forkY = rootY - Math.max(h * 0.10, 40 * u);

  // Group by pathway, ordered so the arrangement is stable frame to frame:
  // a tree that reshuffles when a gene levels is a tree you cannot learn.
  const byPath = new Map<Pathway, TreeGene[]>();
  for (const g of genes) {
    const p = GENES[g.id].pathway;
    const list = byPath.get(p);
    if (list) list.push(g); else byPath.set(p, [g]);
  }
  const paths = [...byPath.keys()].sort();
  const n = paths.length;

  // Reach is set by the VERTICAL room, not the width.
  //
  // It was `min(forkY - 30u, w * 0.46)`, and on a tall narrow phone the
  // width term won by miles: the tree used 20% of the screen and left 65%
  // of it empty above. A tree should grow into the space it has.
  //
  // So: reach fills the height, and the FAN narrows if that would push a
  // branch off the sides. A branch `phi` off vertical extends
  // `reach*sin(phi)` sideways and `reach*cos(phi)` up, so the widest
  // half-angle that still fits is `asin(halfWidth / reach)`.
  const reach = Math.max(forkY - 24 * u, 40 * u);
  const halfW = Math.max(w / 2 - 34 * u, 20 * u);
  const fits = Math.asin(Math.min(halfW / Math.max(reach, 1), 1));
  const wanted = Math.min(Math.PI * 0.41, 0.21 * Math.max(n - 1, 1) + 0.25);
  const spread = Math.min(wanted, fits) * 2;
  const nodes: TreeNode[] = [];
  const branches: {
    pathway: Pathway; angle: number; thickness: number;
    tipX: number; tipY: number;
  }[] = [];

  paths.forEach((p, i) => {
    // -90deg is straight up; fan symmetrically about it.
    const t = n === 1 ? 0.5 : i / (n - 1);
    const angle = -Math.PI / 2 + (t - 0.5) * spread;
    const list = (byPath.get(p) ?? []).slice()
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    const levels = list.reduce((s, g) => s + g.level, 0);
    const thickness = Math.max(2 * u, Math.min(2 + levels * 1.1, 10) * u);

    list.forEach((g, k) => {
      // Spaced along the branch, nearest the fork first, leaving room at the
      // tip so a long branch does not run off the top.
      const step = list.length === 1 ? 0.62 : 0.30 + (k / (list.length - 1)) * 0.56;
      const d = reach * step;
      const x = rootX + Math.cos(angle) * d;
      const y = forkY + Math.sin(angle) * d;
      const prev = nodes.length > 0 && k > 0 ? nodes[nodes.length - 1] : null;
      nodes.push({
        id: g.id, pathway: p, level: g.level,
        x, y,
        // Node size carries level, so a grown gene is bigger without a
        // number: the shape of the tree IS the build.
        r: Math.max((7 + Math.min(g.level, 5) * 1.6) * u, 6),
        fromX: prev && k > 0 ? prev.x : rootX,
        fromY: prev && k > 0 ? prev.y : forkY,
      });
    });

    // The limb ends just past its LAST node, not at a fixed 92% of reach.
    // A branch that runs on into empty space is a limb pointing at nothing,
    // and with one gene on it that was most of the branch.
    const lastStep = list.length === 0 ? 0.3
      : list.length === 1 ? 0.62 : 0.86;
    const tipD = reach * Math.min(lastStep + 0.1, 0.95);
    branches.push({ pathway: p, angle, thickness,
                    tipX: rootX + Math.cos(angle) * tipD,
                    tipY: forkY + Math.sin(angle) * tipD });
  });

  return { rootX, rootY, forkY, nodes, branches };
}

/** The node under a point, or null. Hit radius is generous: these are taps. */
export function nodeAt(
  l: TreeLayout, x: number, y: number,
): TreeNode | null {
  let best: TreeNode | null = null;
  let bestD = Infinity;
  for (const nd of l.nodes) {
    const d = Math.hypot(nd.x - x, nd.y - y);
    if (d <= nd.r * 1.6 && d < bestD) { best = nd; bestD = d; }
  }
  return best;
}
