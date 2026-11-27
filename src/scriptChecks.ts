'use strict'

// LES FAUTES QUE L'ON VOIT AVANT LE SERVEUR, pendant la frappe. Aucune
// dépendance à vscode.
//
// ⚠ CHAQUE VÉRIFICATION PRÉFÈRE SE TAIRE QUE SE TROMPER. Un avertissement faux
// apprend à ne plus lire la liste ; une faute manquée sera dite au rechargement.
// D'où les étiquettes reconnues largement, et le menu qu'on ne compte que s'il
// est fait de chaînes écrites en toutes lettres.

import { type Regions, contentOf, regionAt } from './lexer'
import { type ParsedScript } from './npcSyntax'

export interface CheckProblem {
  // Décalages dans le texte ; `end` est exclusif.
  start: number
  end: number
  severity: 'error' | 'warning'
  message: string
}

// Le texte où chaînes et commentaires sont remplacés par des espaces, longueur
// et lignes gardées : une expression régulière y lit le code seul.
export function blankRegions (text: string, regions: Regions): string {
  const chars = text.split('')
  for (const comment of regions.comments) {
    for (let i = comment.start; i < comment.end; ++i) if (chars[i] !== '\n') chars[i] = ' '
  }
  for (const string of regions.strings) {
    // Les guillemets restent : `select("…")` doit encore se reconnaître.
    for (let i = string.start + 1; i < string.end - (string.closed ? 1 : 0); ++i) chars[i] = ' '
  }
  return chars.join('')
}

interface Block {
  start: number
  end: number
  // Indice dans `script.headers`.
  header: number
  hasCode: boolean
}

function lineStarts (text: string): number[] {
  const starts = [0]
  for (let i = 0; i < text.length; ++i) if (text.charCodeAt(i) === 0x0a) starts.push(i + 1)
  return starts
}

function blocksOf (text: string, script: ParsedScript): Block[] {
  const starts = lineStarts(text)
  return script.headers.map((header, index) => {
    const next = script.headers[index + 1]
    return {
      start: starts[header.line],
      end: next !== undefined ? starts[next.line] : text.length,
      header: index,
      hasCode: header.kind === 'script' || header.kind === 'function'
    }
  })
}

// ── LES ACCOLADES ───────────────────────────────────────────────────────────

function checkBraces (blank: string, blocks: Block[], problems: CheckProblem[]): void {
  for (const block of blocks) {
    if (!block.hasCode) continue
    const opened: number[] = []
    for (let i = block.start; i < block.end; ++i) {
      const c = blank[i]
      if (c === '{') {
        opened.push(i)
      } else if (c === '}') {
        if (opened.pop() === undefined) {
          problems.push({ start: i, end: i + 1, severity: 'error', message: 'Accolade fermante sans accolade ouvrante dans ce PNJ.' })
        }
      }
    }
    if (opened.length > 0) {
      const first = opened[0]
      problems.push({
        start: first,
        end: first + 1,
        severity: 'error',
        message: `Il manque ${opened.length} accolade(s) fermante(s) avant la fin de ce PNJ : le serveur refusera de le charger.`
      })
    }
  }
}

// ── LES ÉTIQUETTES ──────────────────────────────────────────────────────────

// Large exprès : une étiquette suivie de code sur sa ligne en est une aussi.
const LABEL_DEFINITION = /(?:^|[\s;{}])([A-Za-z_][A-Za-z0-9_]*):(?!:)/gm
const LABEL_USE = /\b(goto|callsub)\s+([A-Za-z_][A-Za-z0-9_]*)/g
const NOT_LABELS = new Set(['default', 'case'])

function blockAt (blocks: Block[], offset: number): Block | undefined {
  return blocks.find(block => offset >= block.start && offset < block.end)
}

function checkLabels (blank: string, blocks: Block[], problems: CheckProblem[]): void {
  const defined = new Map<number, Set<string>>()
  for (const match of blank.matchAll(LABEL_DEFINITION)) {
    const name = match[1]
    if (NOT_LABELS.has(name.toLowerCase())) continue
    const block = blockAt(blocks, (match.index ?? 0) + match[0].indexOf(name))
    if (block === undefined) continue
    let names = defined.get(block.header)
    if (names === undefined) defined.set(block.header, names = new Set())
    names.add(name.toLowerCase())
  }
  for (const match of blank.matchAll(LABEL_USE)) {
    const name = match[2]
    const start = (match.index ?? 0) + match[0].length - name.length
    const block = blockAt(blocks, start)
    if (block === undefined || !block.hasCode) continue
    if (defined.get(block.header)?.has(name.toLowerCase()) === true) continue
    problems.push({
      start,
      end: start + name.length,
      severity: 'error',
      message: `Étiquette « ${name} » introuvable dans ce PNJ : « ${match[1]} » ne mène nulle part.`
    })
  }
}

// ── LES MENUS ───────────────────────────────────────────────────────────────

const SWITCH_SELECT = /\bswitch\s*\(\s*select\s*\(/g
const CASE = /case\s+(\d+)\s*:/y

// Le nombre d'options d'un `select(` dont les arguments sont tous des chaînes
// écrites, et où il se ferme ; rien sinon.
function countOptions (text: string, blank: string, regions: Regions, from: number): { count: number, after: number } | undefined {
  let count = 0
  let i = from
  for (;;) {
    while (/\s/.test(blank[i] ?? '')) ++i
    const string = regionAt(regions.strings, i)
    if (string === undefined || string.start !== i || !string.closed) return undefined
    const content = contentOf(string)
    count += text.slice(content.start, content.end).split(':').length
    i = string.end
    while (/\s/.test(blank[i] ?? '')) ++i
    if (blank[i] === ',') { ++i; continue }
    if (blank[i] === ')') return { count, after: i + 1 }
    return undefined
  }
}

function checkMenus (text: string, blank: string, regions: Regions, problems: CheckProblem[]): void {
  for (const match of blank.matchAll(SWITCH_SELECT)) {
    const options = countOptions(text, blank, regions, (match.index ?? 0) + match[0].length)
    if (options === undefined) continue
    const opening = /^\s*\)\s*\{/.exec(blank.slice(options.after))
    if (opening === null) continue
    let depth = 0
    for (let i = options.after + opening[0].length - 1; i < blank.length; ++i) {
      const c = blank[i]
      if (c === '{') ++depth
      else if (c === '}' && --depth === 0) break
      if (depth !== 1 || c !== 'c' || /[A-Za-z0-9_]/.test(blank[i - 1] ?? '')) continue
      CASE.lastIndex = i
      const found = CASE.exec(blank)
      if (found === null) continue
      const value = Number(found[1])
      if (value >= 1 && value <= options.count) continue
      problems.push({
        start: i,
        end: i + found[0].length,
        severity: 'warning',
        message: `Ce menu n'a que ${options.count} option(s) : « case ${value} » n'est jamais choisi.`
      })
    }
  }
}

export function checkScript (text: string, regions: Regions, script: ParsedScript): CheckProblem[] {
  const blank = blankRegions(text, regions)
  const blocks = blocksOf(text, script)
  const problems: CheckProblem[] = []
  checkBraces(blank, blocks, problems)
  checkLabels(blank, blocks, problems)
  checkMenus(text, blank, regions, problems)
  return problems
}
