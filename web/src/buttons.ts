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
    b("down", "\u25BC", "descend"),
    b("up", "\u25B2", "ascend"),
    b("zoomIn", "+", "zoom in"),
    b("zoomOut", "\u2212", "zoom out"),
    b("contrast", "\u25D1", "contrast"),
  ];
}

/** Lay the bar out along the bottom-right, inside the safe area and above the
 *  status bar. Targets are at least 44pt, which is the usual minimum. */
export function layoutButtons(
  bs: Button[], W: number, H: number,
  ins: { right: number; bottom: number }, u: number, barH: number,
): void {
  const size = Math.max(Math.round(46 * u), 44);
  const gap = Math.round(8 * u);
  const cols = 3;
  const rows = Math.ceil(bs.length / cols);
  const x0 = W - ins.right - gap - cols * (size + gap) + gap;
  const y0 = H - ins.bottom - barH - gap - rows * (size + gap) + gap;
  bs.forEach((btn, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    btn.x = x0 + c * (size + gap);
    btn.y = y0 + r * (size + gap);
    btn.w = size;
    btn.h = size;
  });
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
