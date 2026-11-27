'use strict'

// RENOMMER UNE ÉTIQUETTE OU UNE FONCTION LOCALE, dans son PNJ seul. Aucune
// dépendance à vscode.
//
// ⚠ SANS CASSE, comme le moteur : `goto l_fin` mène à `L_Fin:`, et les deux se
// renomment ensemble.
//
// 🔴 UNE ÉTIQUETTE « On… » NE SE RENOMME PAS : c'est un événement, qu'un autre
// PNJ appelle par une chaîne (`donpcevent "Pnj::OnX"`), qu'un minuteur ou un
// monstre vise — rien de ce qu'on verrait d'ici.

import { type Region } from './lexer'
import { type ParsedScript } from './npcSyntax'
import { type Block, blocksOf } from './scriptChecks'

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

function escape (name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Les occurrences de `name` dans `block` : définitions, renvois et appels.
function occurrences (blank: string, block: Block, name: string): Region[] {
  const found: Region[] = []
  const inside = blank.slice(block.start, block.end)
  const word = escape(name)
  const add = (pattern: RegExp): void => {
    for (const match of inside.matchAll(pattern)) {
      const at = block.start + (match.index ?? 0) + match[0].lastIndexOf(match[1])
      if (!found.some(region => region.start === at)) found.push({ start: at, end: at + match[1].length })
    }
  }
  add(new RegExp(`(?:^|[\\s;{}])(${word}):(?!:)`, 'gim'))
  add(new RegExp(`\\b(?:goto|callsub)\\s+(${word})\\b`, 'gi'))
  add(new RegExp(`\\bfunction\\s+(${word})\\b`, 'gi'))
  add(new RegExp(`(?<![.@$'#\\w])(${word})\\s*\\(`, 'gi'))
  // `menu "A",L_A,"B",L_B;` : les étiquettes sont les arguments nus.
  for (const menu of inside.matchAll(/\bmenu\b[^;]*;/gi)) {
    const base = (menu.index ?? 0)
    for (const match of menu[0].matchAll(new RegExp(`(?<![.@$'#\\w])(${word})(?!\\w)`, 'gi'))) {
      const at = block.start + base + (match.index ?? 0)
      if (!found.some(region => region.start === at)) found.push({ start: at, end: at + name.length })
    }
  }
  return found.sort((a, b) => a.start - b.start)
}

export interface RenamePlan {
  name: string
  // L'occurrence sous le curseur.
  at: Region
  edits: Region[]
}

// Ce qui se renommerait depuis `offset`, ou la raison du refus.
export function planRename (text: string, blank: string, script: ParsedScript, offset: number): RenamePlan | { error: string } {
  let start = offset
  while (start > 0 && /\w/.test(blank[start - 1])) --start
  let end = offset
  while (end < blank.length && /\w/.test(blank[end])) ++end
  const name = blank.slice(start, end)
  if (!IDENTIFIER.test(name)) return { error: 'Ce n\'est pas une étiquette ni une fonction locale.' }
  const block = blocksOf(text, script).find(b => start >= b.start && start < b.end)
  if (block === undefined || !block.hasCode) return { error: 'Hors d\'un PNJ ou d\'une fonction.' }
  const edits = occurrences(blank, block, name)
  const at = edits.find(region => region.start === start)
  if (at === undefined) return { error: `« ${name} » n'est pas une étiquette ni une fonction locale de ce PNJ.` }
  if (/^on/i.test(name)) return { error: `« ${name} » est un événement : d'autres PNJ peuvent l'appeler par son nom, il ne se renomme pas d'ici.` }
  return { name, at, edits }
}

// Le nouveau nom est-il recevable dans ce PNJ ?
export function checkNewName (blank: string, text: string, script: ParsedScript, plan: RenamePlan, newName: string): string | undefined {
  if (!IDENTIFIER.test(newName)) return `« ${newName} » n'est pas un nom d'étiquette.`
  if (/^on/i.test(newName)) return 'Un nom en « On… » ferait de l\'étiquette un événement.'
  const block = blocksOf(text, script).find(b => plan.at.start >= b.start && plan.at.start < b.end)
  if (block !== undefined && newName.toLowerCase() !== plan.name.toLowerCase() &&
    occurrences(blank, block, newName).length > 0) {
    return `« ${newName} » existe déjà dans ce PNJ.`
  }
  return undefined
}
