// Message text.
//
// A roguelike log is half the game's voice. "Geobacter destroyed." says
// nothing; "You drive a spike into the Geobacter. Its pili go slack." says
// what happened and what the thing was. Every line here is written against
// what the organism actually is.

import { GENES, type GeneId } from "./biology.js";
import { SUBSTRATES, type Item, type SubstrateId } from "./items.js";
import type { WeaponKind } from "./weapons.js";

const pick = <T,>(xs: readonly T[], seed: number): T =>
  xs[Math.abs(Math.floor(seed)) % xs.length] as T;

export function hitLine(name: string, dmg: number, killed: boolean, seed: number): string {
  if (killed) {
    return pick([
      `The ${name} ruptures. Cytoplasm spills into the pore water.`,
      `You breach the ${name}. It deflates and stops.`,
      `The ${name}'s envelope gives way. It lyses.`,
      `Something structural fails inside the ${name}. It comes apart.`,
    ], seed);
  }
  if (dmg >= 8) {
    return pick([
      `You tear into the ${name}. It recoils, leaking.`,
      `A heavy strike lands. The ${name} shudders.`,
      `You open a gash in the ${name}'s wall.`,
    ], seed);
  }
  return pick([
    `You strike the ${name}.`,
    `You press against the ${name}. Its wall flexes.`,
    `A glancing blow. The ${name} holds.`,
  ], seed);
}

export function incomingLine(
  name: string, weapon: WeaponKind, dmg: number, seed: number,
): string {
  switch (weapon) {
    case "spear":
      return `The ${name} contracts its sheath and drives a spike through you. (-${String(dmg)})`;
    case "bolt":
      return `A current runs down the ${name}'s pilus and into you. (-${String(dmg)})`;
    case "packet":
      return `A particle from the ${name} finds you and fuses. (-${String(dmg)})`;
    case "cloud":
      return `The ${name}'s exudate burns where it touches. (-${String(dmg)})`;
    case "melee":
      return pick([
        `The ${name} presses against you and begins to digest. (-${String(dmg)})`,
        `The ${name} makes contact. Surface enzymes bite. (-${String(dmg)})`,
      ], seed) ;
  }
}

export function chargeLine(name: string, weapon: WeaponKind): string {
  switch (weapon) {
    case "spear": return `The ${name} draws its sheath back. Something is about to be fired.`;
    case "cloud": return `The ${name} is venting. The water around it is going cloudy.`;
    case "bolt":  return `The ${name} extends a pilus toward you.`;
    case "packet": return `The ${name} is budding something off.`;
    case "melee": return `The ${name} closes.`;
  }
}

export function hgtLine(gene: GeneId, from: string): string {
  return `You take up free ${GENES[gene].name} from the lysate of the ${from}. ` +
         `It carries ${GENES[gene].product.toLowerCase()}.`;
}

export function pickupLine(it: Item, atp: number, blocked: GeneId | null): string {
  if (it.kind === "cassette") {
    return `You pick up a ${GENES[it.gene].name} cassette. It goes into the bin.`;
  }
  const s = SUBSTRATES[it.id];
  if (blocked !== null) {
    return `You take up ${s.name} (${s.formula}), but nothing in you can use it. ` +
           `You would need ${GENES[blocked].name}.`;
  }
  return `You metabolise ${s.name} (${s.formula}). +${String(atp)} ATP.`;
}

export function substrateSight(id: SubstrateId): string {
  const s = SUBSTRATES[id];
  return `${s.name} (${s.formula}) has settled here.`;
}

export function descendLine(from: number, to: number, name: string, teap: string): string {
  const dir = to > from ? "down" : "up";
  return `You work your way ${dir} into the ${name}. ` +
         `The terminal acceptor here is ${teap}.`;
}

export function starveLine(donor: string, teap: string): string {
  return pick([
    `Your membrane potential is collapsing. The donor here is ${donor}; ` +
    `you have nothing that respires ${teap}.`,
    `ATP pumps are stalling. Without a way to reduce ${teap} you are running down.`,
  ], donor.length);
}

export function lysateLine(n: number, name: string): string {
  return `The remains of the ${name} settle: ${String(n)} things worth taking.`;
}
