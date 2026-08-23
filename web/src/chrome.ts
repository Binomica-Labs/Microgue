// Shared screen furniture.
//
// Three overlays each hand-rolled an identical close button and an identical
// dimmed backdrop. That is three places to fix a layout bug and three places
// to forget one.

export interface Box { x: number; y: number; w: number; h: number; }

export const inBox = (b: Box, x: number, y: number): boolean =>
  x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

export interface Insets { top: number; right: number; bottom: number; left: number; }

/** Backdrop for an overlay screen. */
export function drawBackdrop(
  ctx: CanvasRenderingContext2D, w: number, h: number, alpha = 0.96,
): void {
  ctx.fillStyle = `rgba(4,7,6,${String(alpha)})`;
  ctx.fillRect(0, 0, w, h);
}

/** Close button, top right, at least a 44pt target. Returns its box so the
 *  caller can hit-test it. */
export function drawClose(
  ctx: CanvasRenderingContext2D, w: number, ins: Insets, u: number,
): Box {
  const s = Math.max(46 * u, 44);
  const box: Box = { x: w - ins.right - s - 12 * u, y: ins.top + 6 * u, w: s, h: s };
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = Math.max(1.5 * u, 1.5);
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, s, s, s * 0.28);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = `${s * 0.42}px ui-monospace,monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("\u2715", box.x + s / 2, box.y + s / 2);
  return box;
}

/** Title and subtitle for an overlay. Returns the y to start content at. */
export function drawHeader(
  ctx: CanvasRenderingContext2D, ins: Insets, u: number,
  title: string, subtitle: string,
): number {
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = `${14 * u}px ui-monospace,monospace`;
  ctx.fillText(title, ins.left + 14 * u, ins.top + 26 * u);
  ctx.fillStyle = "#8fa89a";
  ctx.font = `${10 * u}px ui-monospace,monospace`;
  ctx.fillText(subtitle, ins.left + 14 * u, ins.top + 42 * u);
  return ins.top + 68 * u;
}

/** Greedy word wrap against a measured width. */
export function wrapText(
  ctx: CanvasRenderingContext2D, text: string, max: number,
): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];
  const out: string[] = [];
  let line = words[0] ?? "";
  for (const w of words.slice(1)) {
    const next = `${line} ${w}`;
    if (ctx.measureText(next).width <= max) line = next;
    else { out.push(line); line = w; }
  }
  out.push(line);
  return out;
}
