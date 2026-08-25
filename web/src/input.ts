// Input routing: pointers, gestures, keys, buttons.
//
// Everything here is reached through safety.on(), so a throw in a handler is
// reported rather than escaping into a console nobody can read on a phone.

import { isVisible } from "./fov.js";
import { distanceTo } from "./pursuit.js";
import type { Mob } from "./dungeon.js";
import * as bio from "./biology.js";
import { classifyDown, classifyKey } from "./gesture.js";
import { buttonAt } from "./buttons.js";
import { clampView, moduleLabelAt, zoomAbout } from "./kegg_ui.js";
import { slotAt } from "./plasmid_ui.js";
import { inBox as inBoxOf } from "./chrome.js";
import { removeDrop } from "./items.js";
import { on } from "./safety.js";
import type { Point } from "./mapgen.js";
import type { Game } from "./main.js";

export function i_pointerDown(_g: Game, x: number, y: number): void {
    if (_g.openDrop) {
      const i = _g.dropBoxes.findIndex((b) => inBoxOf(b, x, y));
      if (i >= 0) {
        const d = _g.openDrop;
        const it = d.items[i];
        if (it && _g.take(it)) {
          d.items.splice(i, 1);
          if (d.items.length === 0) { removeDrop(_g.drops, d); _g.openDrop = null; }
        }
      } else {
        _g.openDrop = null;
      }
      _g.gesture = "none";
      return;
    }
    // A card is modal within the plasmid screen: one tap anywhere dismisses it.
    // A card is modal. Tapping the eat target catabolises the part; anywhere
    // else dismisses. Eating destroys the cassette, so it gets its own target
    // rather than being the same tap that closes the card.
    if (_g.card !== null && !_g.inClose(x, y)) {
      if (_g.cardEat !== null && inBoxOf(_g.cardEat, x, y) && _g.cardIndex >= 0) {
        _g.catabolise(_g.cardIndex);
      }
      _g.card = null;
      _g.cardIndex = -1;
      _g.gesture = "none";
      return;
    }
    // While the lab screen is up, taps buy things. Closing it starts the next
    // strain, so there is no way to accidentally resume a dead one.
    if (_g.dead || _g.showLab) {
      // Remember where the drag began. A tap orders; a drag scrolls, and the
      // two are told apart on release by how far the finger moved.
      _g.shopFrom = { x, y };
      _g.shopMoved = 0;
      _g.gesture = "none";
      return;
    }
    if (_g.showResearch) {
      if (_g.inClose(x, y)) { _g.showResearch = false; _g.gesture = "none"; return; }
      const hit = _g.researchRows.find((r) => inBoxOf(r.box, x, y));
      if (hit) _g.research(hit);
      _g.gesture = "none";
      return;
    }
    if (_g.showSplash || !_g.started) {
      const i = _g.slotBoxes.findIndex(
        (b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      if (i >= 0) _g.startRun(i);
      _g.gesture = "none";
      return;
    }
    if (_g.showNotes) {
      if (_g.inClose(x, y)) { _g.showNotes = false; }
      else { _g.exportPlasmid(); }
      _g.gesture = "none";
      return;
    }
    if (_g.showMap) {
      if (_g.inClose(x, y)) { _g.gesture = "dismiss"; return; }
      _g.gesture = "spin";                 // reused as "pan" here
      _g.panFrom = { x, y };
      _g.panMoved = 0;
      return;
    }
    // Bin cells are checked first: they sit outside the ring, which would
    // otherwise classify as a spin.
    if (_g.showPlasmid) {
      // The close target is checked FIRST, before anything else on this
      // screen. An open item card used to swallow the tap, so closing the
      // screen took two presses and looked broken.
      if (_g.inClose(x, y)) {
        _g.card = null;
        _g.cardIndex = -1;
        _g.gesture = "dismiss";
        return;
      }
      // Hit-test the drawn ROWS, not a grid formula. The list scrolls, so
      // where a part is on screen no longer follows from its index.
      const b = _g.binRows.find((r) => inBoxOf(r.box, x, y))?.index ?? null;
      _g.binFrom = b !== null ? { x, y } : null;
      _g.binAnchor = _g.binScroll;
      if (b !== null) {
        _g.gesture = "slot";
        _g.dragBin = b;
        _g.dragXY = { x, y };
        _g.selected = null;
        return;
      }
    }
    const slot = _g.showPlasmid ? slotAt(_g.ring, x, y) : null;
    const btn = _g.showPlasmid ? null : buttonAt(_g.buttons, x, y);
    _g.gesture = classifyDown({
      plasmidOpen: _g.showPlasmid,
      closeBox: _g.closeBox,
      slot,
      distFromRing: Math.hypot(x - _g.ring.cx, y - _g.ring.cy),
      rOuter: _g.ring.rOuter,
      onButton: btn !== null,
    }, x, y);

    switch (_g.gesture) {
      case "button":
        _g.gestureBtn = btn;
        if (btn) btn.active = true;
        break;
      case "slot":
        if (slot !== null) {
          _g.selected = slot;
          if (_g.genome.at(slot) !== null) { _g.dragFrom = slot; _g.dragXY = { x, y }; }
        }
        break;
      case "spin":
        _g.spinFrom = Math.atan2(y - _g.ring.cy, x - _g.ring.cx);
        break;
      case "world": {
        const t = _g.toTile(x, y);
        _g.tap(t.x, t.y);
        break;
      }
      case "dismiss": case "none": break;
    }
  }

export function i_pointerMove(_g: Game, x: number, y: number): void {
  // Dragging the order form scrolls it. One row per row-height of travel, so
  // the list moves with the finger rather than at some invented rate.
  if ((_g.dead || _g.showLab) && _g.shopFrom !== null) {
    const dy = y - _g.shopFrom.y;
    _g.shopMoved = Math.max(_g.shopMoved, Math.abs(dy) + Math.abs(x - _g.shopFrom.x));
    const rowPx = Math.max(Math.min(innerWidth, innerHeight) / 420, 1) * 34;
    const want = _g.shopAnchor - dy / rowPx;
    _g.shopScroll = Math.min(Math.max(want, 0), _g.shopMaxScroll);
    return;
  }
    if (!_g.started) return;
    // Dragging in the parts list scrolls it, unless a part is being dragged
    // out of it -- an install must still win over a scroll.
    if (_g.showPlasmid && _g.binFrom !== null) {
      const dy = y - _g.binFrom.y;
      const dx = x - _g.binFrom.x;
      // A vertical drag scrolls; a horizontal one carries the part out to the
      // ring. Pressing a row sets `dragBin` immediately, so requiring it to be
      // null meant the scroll branch could never run at all.
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 6) {
        _g.dragBin = null;                 // it is a scroll, not an install
        _g.dragXY = null;
        _g.gesture = "none";
        const rowPx = Math.max(Math.min(innerWidth, innerHeight) / 420, 1) * 34;
        _g.binScroll = Math.min(Math.max(_g.binAnchor - dy / rowPx, 0),
                                _g.binMaxScroll);
        return;
      }
    }
    if (_g.showMap && _g.panFrom && _g.view) {
      const dx = x - _g.panFrom.x, dy = y - _g.panFrom.y;
      _g.panMoved += Math.abs(dx) + Math.abs(dy);
      _g.view = clampView({
        ..._g.view,
        x: _g.view.x - dx / _g.view.scale,
        y: _g.view.y - dy / _g.view.scale,
      }, innerWidth, innerHeight);
      _g.panFrom = { x, y };
      return;
    }
    if (_g.gesture === "slot" && (_g.dragFrom !== null || _g.dragBin !== null)) {
      _g.dragXY = { x, y };
    } else if (_g.gesture === "spin" && _g.spinFrom !== null) {
      if (_g.showMap) {
        // handled in the pan branch below
      } else {
        const a = Math.atan2(y - _g.ring.cy, x - _g.ring.cx);
        _g.ring.rot += a - _g.spinFrom;
        _g.spinFrom = a;
      }
    }
  }

export function i_pointerUp(_g: Game, x: number, y: number): void {
  if (_g.dead || _g.showLab) {
    const wasDrag = _g.shopMoved > 10;
    _g.shopFrom = null;
    _g.shopAnchor = _g.shopScroll;
    if (wasDrag) return;                    // a scroll is not an order
    const hit = _g.shopRows.find((r) => inBoxOf(r.box, x, y));
    if (hit) { _g.order(hit.offer); return; }
    if (_g.inClose(x, y)) {
      _g.showLab = false;
      _g.shopScroll = 0;
      _g.shopAnchor = 0;
      if (_g.dead) { _g.dead = false; _g.showSplash = true; _g.started = false; }
    }
    return;
  }
    if (!_g.started) { _g.gesture = "none"; return; }
    switch (_g.gesture) {
      case "button": {
        const b = _g.gestureBtn;
        if (b) { b.active = false; if (buttonAt(_g.buttons, x, y) === b) _g.press(b.id); }
        break;
      }
      case "slot": {
        const target = slotAt(_g.ring, x, y);
        if (_g.dragBin !== null) {
          // A tap that never moved is an inspect, not a failed drag.
          if (_g.panMoved < 8 && target === null) {
            _g.card = _g.genome.bin[_g.dragBin] ?? null;
          _g.cardIndex = _g.dragBin;
          _g.cardIndex = _g.dragBin;
            _g.dragBin = null;
            _g.dragXY = null;
            _g.gesture = "none";
            return;
          }
          if (target !== null) {                       // bin -> ring
            const r = _g.genome.install(_g.dragBin, target);
            if (r.ok) { _g.selected = target; _g.save(); } else _g.note(r.err);
          } else if (_g.binRows.length > 0
                     && y > (_g.binRows[_g.binRows.length - 1]?.box.y ?? 0)
                          + (_g.binRows[0]?.box.h ?? 0) * 2.5) {
            // Dragged well BELOW the whole list: thrown away. Measured from
            // the last drawn row, not from a fixed multiple of the old tile
            // size -- the list scrolls and is taller than the grid was, so the
            // old threshold sat inside it and an ordinary drag destroyed loot.
            const part = _g.genome.bin[_g.dragBin];
            if (part) {
              _g.genome.bin.splice(_g.dragBin, 1);
              const what = part.kind === "gene" ? bio.GENES[part.id].name : part.kind;
              _g.toasts.push(`Discarded ${what}.`, "info", _g.now);
              _g.save();
            }
          }
        } else if (_g.dragFrom !== null) {
          if (_g.binRows.some((r) => inBoxOf(r.box, x, y))) {
            const r = _g.genome.uninstall(_g.dragFrom);   // ring -> bin
            if (r.ok) { _g.selected = null; _g.save(); } else _g.note(r.err);
          } else if (target !== null && target !== _g.dragFrom) {
            _g.genome.swap(_g.dragFrom, target);
            _g.selected = target;
            _g.save();
          }
        }
        break;
      }
      case "dismiss":
        if (_g.inClose(x, y)) {
          if (_g.showMap) _g.showMap = false;
          else _g.openPlasmid(false);
        }
        break;
      case "spin":
        // A tap on a module caption builds it -- but only if the pointer barely
        // moved, so a pan across a caption is never mistaken for a tap.
        // A pinch clears panFrom, so panMoved stays near zero and lifting a
        // finger over a caption used to BUILD that module. Inspecting a
        // pathway by pinching it silently assembled it.
        if (_g.showMap && _g.view && _g.panMoved < 10 && !_g.pinching) {
          const p = _g.mapPoint(x, y);
          const m = moduleLabelAt({ ..._g.view, x: 0, y: 0, scale: _g.view.scale },
                                  p.x * _g.view.scale, p.y * _g.view.scale, _g.boxes);
          if (m) {
            const r = _g.genome.assemble(m.steps.map((st) => st.gene));
            _g.note(r.ok ? `Assembled ${m.id} ${m.name}.` : `${m.id}: ${r.err}`);
            if (r.ok) { _g.showMap = false; _g.save(); }
          }
        }
        break;
      case "none": case "world": break;
    }
    _g.gesture = "none";
    _g.gestureBtn = null;
    _g.dragFrom = null;
    _g.dragBin = null;
    _g.dragXY = null;
    _g.spinFrom = null;
    _g.spinStart = null;
    _g.panFrom = null;
    _g.binFrom = null;
  }

export function i_onKey(_g: Game, e: KeyboardEvent): void {
    {
      const act = classifyKey(e.key, _g.showPlasmid);
      if (act.kind === "none") return;
      e.preventDefault();
      switch (act.kind) {
        case "move": {
          _g.walk = null;
          const pinched = act.dx !== 0 && act.dy !== 0
            && !_g.level.grid.isFloor(_g.player.x + act.dx, _g.player.y)
            && !_g.level.grid.isFloor(_g.player.x, _g.player.y + act.dy);
          if (!pinched) _g.step(_g.player.x + act.dx, _g.player.y + act.dy);
          break;
        }
        case "zoom":
          _g.zoom = Math.min(Math.max(_g.zoom * act.factor, 0.3), 8);
          break;
        case "togglePlasmid": _g.openPlasmid(true); break;
        case "closePlasmid": _g.openPlasmid(false); break;
        case "toggleHud": break;      // the HUD is always on now
        case "toggleContrast":
          _g.settings = { ..._g.settings, highContrast: !_g.settings.highContrast };
          _g.save();
          break;
        case "fullscreen": break;
        case "descend": _g.descend(); break;
        case "ascend": _g.ascend(); break;
        case "quit": break;
      }
    }
  }

export function i_bindInput(_g: Game): void {
    _g.bindPinch();
    on(_g.canvas, "pointerdown", (e: PointerEvent) => {
      e.preventDefault();
      _g.pointerDown(e.clientX, e.clientY);
    }, "pointerdown", _g.report);
    on(_g.canvas, "pointermove", (e: PointerEvent) => {
      _g.pointerMove(e.clientX, e.clientY);
    }, "pointermove", _g.report);
    const release = (e: PointerEvent): void => { _g.pointerUp(e.clientX, e.clientY); };
    on(_g.canvas, "pointerup", release, "pointerup", _g.report);
    on(_g.canvas, "pointercancel", release, "pointercancel", _g.report);

    on(globalThis, "keydown", (e: KeyboardEvent) => {
      if (_g.showSplash || !_g.started) return;
      _g.onKey(e);
    }, "keydown", _g.report);
  }

export function i_bindPinch(_g: Game): void {
    // Pinch-zoom, without the gesture fighting a tap.
    const pts = new Map<number, Point>();
    let d0 = 0;
    let z0 = 1;
    // A pinch has to act on whatever is actually on screen. This handler only
    // checked showPlasmid, so pinching the pathway map silently zoomed the
    // WORLD behind it -- the map never moved and the gesture felt broken.
    const owner = (): "none" | "world" | "map" => {
      if (_g.showPlasmid || _g.showNotes || _g.showSplash || _g.openDrop) return "none";
      return _g.showMap ? "map" : "world";
    };

    on(_g.canvas, "pointermove", (e: PointerEvent) => {
      const who = owner();
      if (who === "none") return;
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size !== 2 || d0 <= 0) return;
      const [a, b] = [...pts.values()] as [Point, Point];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (who === "world") {
        _g.zoom = Math.min(Math.max(z0 * (d / d0), 0.3), 8);
      } else if (_g.view) {
        // Zoom about the midpoint between the fingers, so what you are
        // pinching stays under them.
        const want = Math.min(Math.max(z0 * (d / d0), 0.35), 2.5);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        _g.view = clampView(
          zoomAbout(_g.view, mid.x, mid.y, want / _g.view.scale),
          innerWidth, innerHeight);
      }
    }, "pinch move", _g.report);
    on(_g.canvas, "pointerdown", (e: PointerEvent) => {
      const who = owner();
      if (who === "none") return;
      // A missed pointerup (a notification, an app switch) leaves an entry
      // behind; it would pair with the next single touch and read as a pinch.
      if (pts.size > 2) pts.clear();
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()] as [Point, Point];
        d0 = Math.hypot(a.x - b.x, a.y - b.y);
        z0 = who === "world" ? _g.zoom : (_g.view?.scale ?? 1);
        _g.walk = null;
        _g.panFrom = null;              // a pinch is not a pan
        _g.pinching = true;
      }
    }, "pinch start", _g.report);
    const drop = (e: PointerEvent): void => {
      pts.delete(e.pointerId);
      if (pts.size < 2) d0 = 0;
      // Only when EVERY finger is up. Releasing one of two would otherwise
      // re-arm tap handling while the second is still down.
      if (pts.size === 0) _g.pinching = false;
    };
    on(_g.canvas, "pointerup", drop, "pinch end", _g.report);
    on(_g.canvas, "pointercancel", drop, "pinch cancel", _g.report);
  }

/** The closest living thing you can see, by body distance. */
function nearestHostile(_g: Game): Mob | null {
  let best: Mob | null = null;
  let bd = Infinity;
  for (const m of _g.level.mobs) {
    if (!m.alive || !isVisible(_g.level.sight, m.x, m.y)) continue;
    const d = distanceTo(_g.player, m);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

export function i_press(_g: Game, id: string): void {
    switch (id) {
      case "plasmid": _g.openPlasmid(!_g.showPlasmid); _g.showMap = false; break;
      case "explore": _g.explore(); break;
      case "strike": {
        // One press, one turn. This is the primary way to fight: Crawl makes
        // you press the key each time and that repetition IS the texture of
        // its combat -- you feel every exchange rather than watching one.
        const near = nearestHostile(_g);
        if (!near) { _g.note("Nothing in reach."); break; }
        _g.target = near;
        _g.takeTurn();
        break;
      }
      case "auto": {
        _g.exploring = false;
        _g.autoAttack = !_g.autoAttack;
        const btn = _g.buttons.find((b) => b.id === "auto");
        if (btn) btn.active = _g.autoAttack;
        if (_g.autoAttack) { _g.walk = null; _g.note("Auto-attack engaged."); }
        else { _g.target = null; _g.note("Auto-attack off."); }
        break;
      }
      case "map":
        _g.showMap = !_g.showMap;
        if (_g.showMap) _g.view = null;   // reframe on what you now hold
        if (_g.showMap) { _g.openPlasmid(false); _g.showNotes = false; }
        break;
      case "wait":
        // Passing a turn is a real move in a turn-based game: regeneration,
        // ATP and every microbe all advance.
        _g.note("You hold position.");
        _g.mobTurn();
        _g.look();
        break;
      case "research":
        _g.showResearch = !_g.showResearch;
        _g.researchPick = null;
        break;
      case "notes":
        _g.showNotes = !_g.showNotes;
        if (_g.showNotes) { _g.openPlasmid(false); _g.showMap = false; }
        break;
      case "down": _g.descend(); break;
      case "up": _g.ascend(); break;
      case "zoomIn": _g.zoom = Math.min(_g.zoom * 1.25, 8); break;
      case "zoomOut": _g.zoom = Math.max(_g.zoom / 1.25, 0.3); break;
      case "contrast":
        _g.settings = { ..._g.settings, highContrast: !_g.settings.highContrast };
        _g.save();
        break;
      default: break;
    }
  }

export function i_inClose(_g: Game, x: number, y: number): boolean {
    return inBoxOf(_g.closeBox, x, y);
  }
