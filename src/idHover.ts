'use strict'

// LE NOM DERRIÈRE UN IDENTIFIANT : `getitem 501,1` survolé dit « Red Potion ».
// Ce qui se lit sans VSCode : les tables du serveur, et la commande qui reçoit
// le nombre survolé.
//
// ⚠ UN NOMBRE N'EST NOMMÉ QUE PAR SA COMMANDE. Coordonnées, zénys et quantités
// tombent souvent sur un identifiant existant : nommer tout nombre qui en a
// l'air mentirait plus souvent qu'il n'aiderait.

export type IdKind = 'item' | 'mob'

export interface DbEntry {
  id: number
  aegis: string
  name: string
  // Les monstres seulement.
  level?: number
}

// Les fichiers qu'une table importe (`Footer: Imports: - Path: …`), sans ceux
// mis en commentaire — c'est ainsi que le serveur choisit renewal ou non.
export function readDbImports (text: string): string[] {
  const paths: string[] = []
  for (const match of text.matchAll(/^\s*-\s*Path:\s*(\S+)\s*$/gm)) paths.push(match[1])
  return paths
}

// Les entrées d'une table YAML d'objets ou de monstres. ⚠ SEULES LES CLÉS DE
// L'ENTRÉE comptent, à l'indentation qui suit `- Id:` : plus bas, une liste
// de butins porte aussi des noms.
export function readDbEntries (text: string): DbEntry[] {
  const entries: DbEntry[] = []
  let current: DbEntry | undefined
  let keyIndent = -1
  for (const line of text.split(/\r?\n/)) {
    const start = /^(\s*)-\s+Id:\s*(\d+)\s*$/.exec(line)
    if (start !== null) {
      current = { id: Number(start[2]), aegis: '', name: '' }
      keyIndent = start[1].length + 2
      entries.push(current)
      continue
    }
    if (current === undefined) continue
    const key = /^(\s*)(AegisName|Name|Level):\s*(.*?)\s*$/.exec(line)
    if (key === null || key[1].length !== keyIndent) continue
    const value = key[3].replace(/^"(.*)"$/, '$1')
    if (key[2] === 'AegisName') current.aegis = value
    else if (key[2] === 'Name') current.name = value
    else current.level = Number(value)
  }
  return entries
}

// La place de l'identifiant, par commande ; `any` : tout argument en est un.
const ID_ARGUMENTS = new Map<string, { kind: IdKind, arg: number | 'any' }>([
  ...['getitem', 'getitem2', 'getitem3', 'getitembound', 'getitembound2', 'rentitem', 'rentitem2',
    'delitem', 'delitem2', 'delitem3', 'countitem', 'countitem2', 'countitem3', 'cartcountitem',
    'storagecountitem', 'guildstoragecountitem', 'checkweight', 'getitemname', 'getiteminfo',
    'getnameditem', 'makeitem', 'makeitem2', 'consumeitem', 'setiteminfo', 'itemlink'
  ].map(name => [name, { kind: 'item' as IdKind, arg: 0 }] as const),
  ['isequipped', { kind: 'item', arg: 'any' }],
  ['isequippedcnt', { kind: 'item', arg: 'any' }],
  ['monster', { kind: 'mob', arg: 4 }],
  ['areamonster', { kind: 'mob', arg: 6 }],
  ['getmonsterinfo', { kind: 'mob', arg: 0 }],
  ['getmobdrops', { kind: 'mob', arg: 0 }],
  ['strmobinfo', { kind: 'mob', arg: 1 }]
])

export interface IdAtCursor {
  kind: IdKind
  id: number
  start: number
  end: number
}

const IDENT = /[A-Za-z0-9_]/

// La commande qui reçoit l'argument commençant à `at`, et son rang : l'appel
// parenthésé le plus proche, sinon le premier mot de l'instruction.
export function argumentContext (blank: string, at: number): { command: string, arg: number } | undefined {
  let depth = 0
  let commas = 0
  for (let i = at - 1; i >= 0; --i) {
    const c = blank[i]
    if (c === ')') ++depth
    else if (c === '(') {
      if (depth > 0) { --depth; continue }
      let end = i
      while (end > 0 && /\s/.test(blank[end - 1])) --end
      let begin = end
      while (begin > 0 && IDENT.test(blank[begin - 1])) --begin
      if (begin === end) return undefined
      return { command: blank.slice(begin, end).toLowerCase(), arg: commas }
    } else if (depth === 0 && c === ',') ++commas
    else if (depth === 0 && (c === ';' || c === '{' || c === '}' || c === ':')) {
      return statementCommand(blank.slice(i + 1, at), commas)
    }
  }
  return depth === 0 ? statementCommand(blank.slice(0, at), commas) : undefined
}

function statementCommand (statement: string, arg: number): { command: string, arg: number } | undefined {
  const word = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s/.exec(statement)
  return word !== null ? { command: word[1].toLowerCase(), arg } : undefined
}

// L'identifiant sous `offset`, si c'est un nombre écrit que sa commande lit
// comme un objet ou un monstre. `blank` : le texte sans chaînes ni commentaires.
export function idAt (blank: string, offset: number): IdAtCursor | undefined {
  if (!/[0-9]/.test(blank[offset] ?? '')) return undefined
  let start = offset
  while (start > 0 && /[0-9]/.test(blank[start - 1])) --start
  let end = offset
  while (end < blank.length && /[0-9]/.test(blank[end])) ++end
  // Un chiffre dans un nom (`.@var2`, `L_3`) ou un nombre décimal n'en est pas un.
  if (start > 0 && (IDENT.test(blank[start - 1]) || blank[start - 1] === '.' || blank[start - 1] === '@')) return undefined
  if (IDENT.test(blank[end] ?? '')) return undefined
  // ⚠ LE NOMBRE EST L'ARGUMENT ENTIER : dans `.@base+1` ou `.@liste[1]`, il
  // n'est qu'un morceau d'expression, et le nommer serait faux.
  let before = start - 1
  while (before >= 0 && /\s/.test(blank[before])) --before
  let after = end
  while (after < blank.length && /\s/.test(blank[after])) ++after
  if (!/[,;)]/.test(blank[after] ?? ';')) return undefined
  if (before >= 0 && !/[,(]/.test(blank[before]) && !(IDENT.test(blank[before]) && before < start - 1)) return undefined
  const context = argumentContext(blank, start)
  if (context === undefined) return undefined
  const rule = ID_ARGUMENTS.get(context.command)
  if (rule === undefined || (rule.arg !== 'any' && rule.arg !== context.arg)) return undefined
  return { kind: rule.kind, id: Number(blank.slice(start, end)), start, end }
}

export function describeEntry (kind: IdKind, entry: DbEntry): string {
  const what = kind === 'item' ? `objet ${entry.id}` : `monstre ${entry.id}${entry.level !== undefined ? `, niveau ${entry.level}` : ''}`
  return `**${entry.name !== '' ? entry.name : entry.aegis}** (\`${entry.aegis}\`) — ${what}`
}
