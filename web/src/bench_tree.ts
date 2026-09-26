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
  /**
   * In the BIN, not on the ring.
   *
   * `evolve` mutates the Part in place and `uninstall` moves that Part to
   * the bin, so a levelled gene keeps its levels when you take it off --
   * the investment is safe. But the tree was built from ring slots ONLY, so
   * the branch simply vanished and nothing anywhere told the player their
   * four levels of ATP still existed. An investment you cannot see is an
   * investment you assume you lost.
   */
  readonly detached?: boolean;
}

export interface TreeNode {
  readonly id: GeneId;
  readonly pathway: Pathway;
  readonly level: number;
  /** Held in the bin rather than installed. Drawn hollow. */
  readonly detached: boolean;
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
  // A short tree is CENTRED in its space, not left sitting at the bottom of
  // it. Bottom-anchoring a tree that only fills half the height puts all the
  // emptiness in one place above it, which is the void the last two
  // versions of this screen both had -- first because the tree was too
  // small, then because it was too short. A small plant looks small; a
  // small plant shoved into one corner looks broken.
  const fillNow = Math.min(0.42 + genes.length * 0.062, 1);
  const slack = (h - 24 * u) * (1 - fillNow);
  // 0.6 rather than a true half: a tree wants slightly more room above it
  // than below, because the canopy is the part you look at.
  const rootY = h - 24 * u - slack * 0.6;
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
  // Reach SCALES WITH CONTENT.
  //
  // It was always the maximum: the limb measured 1322px whether the strain
  // carried two genes or twelve, so a two-gene tree was the same enormous V
  // with most of it empty. Sixty times the node radius of bare line. A tree
  // with two things on it should be a SMALL tree.
  //
  // Fills from just under half the available height at one or two genes to
  // all of it by about ten, which is where a ring is full enough that the
  // shape is carrying real information.
  const fill = Math.min(0.42 + genes.length * 0.062, 1);
  const reach = Math.max((forkY - 24 * u) * fill, 40 * u);
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
    // Only installed genes thicken a limb. A bin gene is an investment, not
    // a working part of the cell, and a branch that fattened for parts on a
    // shelf would lie about what the strain can currently do.
    const levels = list.reduce(
      (s, g) => s + (g.detached === true ? 0 : g.level), 0);
    const thickness = Math.max(2 * u, Math.min(2 + levels * 1.1, 10) * u);

    list.forEach((g, k) => {
      // Spaced along the branch, nearest the fork first, leaving room at the
      // tip so a long branch does not run off the top.
      // A lone gene sits FAR out, not two thirds along. With one gene per
      // branch the old 0.62 left a third of the limb -- and on a tall phone
      // several hundred pixels -- as visible empty space above the only
      // thing on it. A sparse tree should be a small tree, not a stretched
      // one with a void on top.
      const step = list.length === 1 ? 0.84
        : 0.30 + (k / (list.length - 1)) * 0.56;
      const d = reach * step;
      const x = rootX + Math.cos(angle) * d;
      const y = forkY + Math.sin(angle) * d;
      const prev = nodes.length > 0 && k > 0 ? nodes[nodes.length - 1] : null;
      nodes.push({
        id: g.id, pathway: p, level: g.level,
        detached: g.detached === true,
        x, y,
        // Node size carries level, so a grown gene is bigger without a
        // number: the shape of the tree IS the build.
        // Bigger, because the node is the thing you tap and the thing the
        // eye should land on. At the old size the limb was forty to sixty
        // times the radius and the tree read as two lines with a dot on
        // each rather than as a branch bearing something.
        r: Math.max((11 + Math.min(g.level, 5) * 2.2) * u, 8),
        fromX: prev && k > 0 ? prev.x : rootX,
        fromY: prev && k > 0 ? prev.y : forkY,
      });
    });

    // The limb ends just past its LAST node, not at a fixed 92% of reach.
    // A branch that runs on into empty space is a limb pointing at nothing,
    // and with one gene on it that was most of the branch.
    const lastStep = list.length === 0 ? 0.3
      : list.length === 1 ? 0.84 : 0.86;
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

/**
 * Where the detail card sits, and how much room the tree may have.
 *
 * ONE definition, used by the renderer and by the test that checks it does
 * not collide with anything. The first version of that test recomputed
 * these numbers itself, so it verified the formula was sound and proved
 * nothing about whether the renderer used it -- moving the card back onto
 * the footer produced zero failures. A test that duplicates the thing it
 * checks is a test that cannot fail.
 */
export function benchGeometry(
  H: number, u: number, insTop: number, insBottom: number, rows: number,
): { treeTop: number; treeH: number; cardTop: number; cardH: number;
     footerY: number } {
  const line = 15 * u;
  const cardH = Math.min(Math.max(rows, 3), 4) * line + 14 * u;
  const footerY = H - insBottom - 14 * u;
  const cardTop = H - insBottom - 30 * u - cardH;
  const treeTop = insTop + 150 * u;
  const treeH = Math.max(H - treeTop - (96 * u + insBottom), 120 * u);
  return { treeTop, treeH, cardTop, cardH, footerY };
}
