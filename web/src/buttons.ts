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
    // Distinct glyphs: two identical crossed-swords buttons sat next to
    // each other and nothing told them apart.
    b("auto", "\u21BB", "auto-attack"),
    b("strike", "\u2694", "strike the nearest thing"),
    b("explore", "\u2732", "auto-explore"),
    b("wait", "\u23F8", "wait a turn"),
    b("research", "\u2697", "directed evolution"),
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
/**
 * Lay the buttons out down the right edge, wrapping to more columns if one
 * will not fit.
 *
 * Sizing used to shrink by one pixel per iteration with a cap of 24 passes,
 * which is fine on a phone and useless on a tablet: 46*u starts at 112px there
 * and 24 passes only reaches 88. And on a landscape phone fourteen buttons at
 * the 44px minimum need 616px against about 250 of room -- no single column
 * fits at any size that is still tappable, so it has to wrap.
 *
 * 44px is the floor throughout. Below that it stops being a touch target, and
 * a control you cannot reliably hit is worse than one you cannot see.
 */
export function layoutButtons(
  bs: Button[], W: number, H: number,
  ins: { top: number; right: number; bottom: number }, u: number, reserve: number,
): void {
  const MIN = 44;
  const edge = Math.round(9 * u);
  const top = ins.top + edge;
  const bottom = H - ins.bottom - reserve - edge;
  const room = Math.max(bottom - top, MIN);

  // Solve for the size directly rather than stepping toward it.
  const fit = (n: number): { size: number; gap: number } => {
    const perCol = Math.ceil(bs.length / n);
    const gap = Math.max(Math.round(9 * u * 0.6), 4);
    const size = Math.floor((room - (perCol - 1) * gap) / perCol);
    return { size: Math.min(Math.max(size, MIN), Math.max(Math.round(46 * u), MIN)), gap };
  };

  let cols = 1;
  while (cols < 4) {
    const { size, gap } = fit(cols);
    const perCol = Math.ceil(bs.length / cols);
    if (perCol * size + (perCol - 1) * gap <= room) break;
    cols++;
  }
  const { size, gap } = fit(cols);
  const perCol = Math.ceil(bs.length / cols);
  const stack = perCol * size + (perCol - 1) * gap;
  const startY = top + Math.max((room - stack) / 2, 0);

  bs.forEach((btn, i) => {
    const col = Math.floor(i / perCol);
    const row = i % perCol;
    btn.w = size;
    btn.h = size;
    // Columns grow LEFTWARD from the right edge, so the first column stays
    // where the thumb already is.
    btn.x = W - ins.right - edge - size - col * (size + gap);
    btn.y = startY + row * (size + gap);
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
