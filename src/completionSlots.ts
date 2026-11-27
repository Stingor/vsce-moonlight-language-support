'use strict'

// OÙ LA COMPLÉTION PROPOSE QUOI. Aucune dépendance à vscode.
//
// - au début d'une instruction : les commandes ;
// - après `goto` ou `callsub` : les étiquettes du PNJ ;
// - dans la chaîne que lit une commande : une fonction (`callfunc "…"`), un
//   événement « Pnj::OnX » (`donpcevent`, `doevent`, `addtimer`…), un PNJ
//   (`enablenpc`, `disablenpc`…).

import { argumentContext } from './idHover'
import { type Regions, contentOf, regionAt } from './lexer'

export type SlotKind = 'command' | 'label' | 'function' | 'event' | 'npc'

export interface Slot {
  kind: SlotKind
  // Ce que la complétion remplace.
  start: number
  end: number
}

// La chaîne que lit chaque commande, par son rang.
const STRING_ARGUMENTS = new Map<string, { arg: number, kind: SlotKind }>([
  ['callfunc', { arg: 0, kind: 'function' }],
  ['donpcevent', { arg: 0, kind: 'event' }],
  ['doevent', { arg: 0, kind: 'event' }],
  ['addtimer', { arg: 1, kind: 'event' }],
  ['deltimer', { arg: 0, kind: 'event' }],
  ['monster', { arg: 6, kind: 'event' }],
  ['areamonster', { arg: 8, kind: 'event' }],
  ['enablenpc', { arg: 0, kind: 'npc' }],
  ['disablenpc', { arg: 0, kind: 'npc' }],
  ['hideonnpc', { arg: 0, kind: 'npc' }],
  ['hideoffnpc', { arg: 0, kind: 'npc' }],
  ['unloadnpc', { arg: 0, kind: 'npc' }],
  ['getvariableofnpc', { arg: 1, kind: 'npc' }]
])

function wordAround (blank: string, offset: number): { start: number, end: number } {
  let start = offset
  while (start > 0 && /\w/.test(blank[start - 1])) --start
  let end = offset
  while (end < blank.length && /\w/.test(blank[end])) ++end
  return { start, end }
}

export function slotAt (text: string, blank: string, regions: Regions, offset: number): Slot | undefined {
  const string = regionAt(regions.strings, offset)
  if (string !== undefined) {
    if (offset === string.start) return undefined
    const context = argumentContext(blank, string.start)
    const rule = context !== undefined ? STRING_ARGUMENTS.get(context.command) : undefined
    if (rule === undefined || context === undefined || rule.arg !== context.arg) return undefined
    const content = contentOf(string)
    return { kind: rule.kind, start: content.start, end: content.end }
  }
  const word = wordAround(blank, offset)
  // Une variable (`.@x`, `$var`) n'est jamais une commande ni une étiquette.
  if (word.start > 0 && /[.@$'#]/.test(blank[word.start - 1])) return undefined
  const head = blank.slice(Math.max(0, word.start - 40), word.start)
  if (/\b(goto|callsub)\s+$/.test(head)) return { kind: 'label', ...word }
  let before = word.start - 1
  while (before >= 0 && /[ \t]/.test(blank[before])) --before
  // Début d'instruction : après `;`, `{`, `}`, une étiquette, un `)` de
  // condition, un `else`, ou en tête de ligne.
  if (before < 0 || /[;{}:)\n]/.test(blank[before]) || /\belse$/.test(blank.slice(Math.max(0, before - 3), before + 1))) {
    return { kind: 'command', ...word }
  }
  return undefined
}
