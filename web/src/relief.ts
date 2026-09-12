// Relief: making a flat card read as a raised thing.
//
// Every part in the inventory and on the ring was a flat fill with a 1px
// outline. It read as a diagram, not an object. Three cheap moves give it
// depth, all done with the canvas primitives already in use:
//
//   1. a vertical gradient on the face -- lighter at the top, where a light
//      from above would catch it, darker at the bottom;
//   2. a dark shadow band along the bottom and right edges -- the card's
//      thickness, seen from slightly above;
//   3. a thin bright line along the top edge -- the highlight on the lip.
//
// Light comes from the top-left, everywhere, always. Consistency is what
// sells it: one card lit from a different side breaks all of them.

/** Lighten or darken a hex colour by a fraction (-1..1). */
export function shade(hex: string, f: number): string {
  // parseInt("arbage", 16) partially parses to a number, so the finite check
  // alone let garbage through as a colour. Require six hex digits.
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const n = Number.parseInt(hex.slice(1, 7), 16);
  if (!Number.isFinite(f)) return hex;
  const ch = (v: number): number => {
    const x = f >= 0 ? v + (255 - v) * f : v * (1 + f);
    return Math.min(Math.max(Math.round(x), 0), 255);
  };
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/**
 * A raised rounded card. `base` is the face colour; the gradient, shadow and
 * highlight are derived from it so a card in any pathway colour lights the
 * same way. `depth` is the thickness in px.
 */
export function raisedCard(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  r: number, base: string, depth: number,
): void {
  // The shadow edge: the card's thickness. Drawn first, offset down-right, so
  // the face sits on top of it.
  ctx.fillStyle = shade(base, -0.55);
  ctx.beginPath();
  ctx.roundRect(x + depth * 0.6, y + depth, w, h, r);
  ctx.fill();

  // The face, lit from above.
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, shade(base, 0.18));
  g.addColorStop(0.5, base);
  g.addColorStop(1, shade(base, -0.22));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();

  // The lip: a bright line on the top edge, fading toward the sides.
  const lip = ctx.createLinearGradient(x, 0, x + w, 0);
  lip.addColorStop(0, "rgba(255,255,255,0.05)");
  lip.addColorStop(0.5, "rgba(255,255,255,0.32)");
  lip.addColorStop(1, "rgba(255,255,255,0.05)");
  ctx.strokeStyle = lip;
  ctx.lineWidth = Math.max(depth * 0.5, 1);
  ctx.beginPath();
  ctx.moveTo(x + r, y + ctx.lineWidth / 2);
  ctx.lineTo(x + w - r, y + ctx.lineWidth / 2);
  ctx.stroke();
}
