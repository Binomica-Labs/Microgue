// On-screen controls. A phone has no keyboard, and the previous build hid
// stairs, zoom and the inventory behind keys that do not exist there.

export interface Button {
  readonly id: string;
  readonly glyph: string;
  readonly hint: string;
  x: number; y: number; w: number; h: number;
  enabled: boolean;
  active: boolean;
}

export function makeButtons(): Button[] {
  const b = (id: string, glyph: string, hint: string): Button =>
    ({ id, glyph, hint, x: 0, y: 0, w: 0, h: 0, enabled: true, active: false });
  return [
    b("plasmid", "\u25CE", "plasmid"),
    b("map", "\u229E", "pathway map"),
    b("auto", "\u2694", "auto-attack"),
    b("wait", "\u23F8", "wait a turn"),
    b("notes", "\u270E", "field notebook"),
    b("down", "\u25BC", "descend"),
    b("up", "\u25B2", "ascend"),
    b("zoomIn", "+", "zoom in"),
    b("zoomOut", "\u2212", "zoom out"),
    b("contrast", "\u25D1", "contrast"),
  ];
}

/** A single column down the right edge, vertically centred in the space above
 *  the status bar. A 3x2 block at the bottom-right overlapped both the message
 *  log and the bar text, because it only reserved the bar's height and the log
 *  sits above that. A strip can collide with neither. Targets are at least
 *  44pt, the usual minimum. */
export function layoutButtons(
  bs: Button[], W: number, H: number,
  ins: { top: number; right: number; bottom: number }, u: number, reserve: number,
): void {
  const size = Math.max(Math.round(46 * u), 44);
  const gap = Math.round(9 * u);
  const stack = bs.length * size + (bs.length - 1) * gap;
  const usableTop = ins.top + gap;
  const usableBottom = H - ins.bottom - reserve - gap;
  const x = W - ins.right - gap - size;
  let y = usableTop + Math.max((usableBottom - usableTop - stack) / 2, 0);
  // If the stack cannot fit, pin it to the top and let it run to the reserve.
  if (stack > usableBottom - usableTop) y = usableTop;

  for (const btn of bs) {
    btn.x = x;
    btn.y = Math.round(y);
    btn.w = size;
    btn.h = size;
    y += size + gap;
  }
}

export function buttonAt(bs: Button[], x: number, y: number): Button | null {
  for (const b of bs) {
    if (b.enabled && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

export function drawButtons(
  ctx: CanvasRenderingContext2D, bs: Button[], u: number,
): void {
  for (const b of bs) {
    ctx.globalAlpha = b.enabled ? 1 : 0.3;
    ctx.fillStyle = b.active ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.55)";
    ctx.strokeStyle = b.active ? "#ffffff" : "rgba(255,255,255,0.3)";
    ctx.lineWidth = Math.max(1.5 * u, 1.5);
    const r = b.w * 0.28;
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, r);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = `${b.w * 0.42}px ui-monospace,monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(b.glyph, b.x + b.w / 2, b.y + b.h / 2 + b.w * 0.02);
  }
  ctx.globalAlpha = 1;
}
