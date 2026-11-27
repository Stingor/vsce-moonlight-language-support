'use strict'

// LE NOM DERRIÈRE UN IDENTIFIANT : `getitem 501,1` survolé dit « Red Potion ».
// Ce qui se lit sans VSCode : les tables du serveur, et la commande qui reçoit
// le nombre survolé.
//
// ⚠ UN NOMBRE N'EST NOMMÉ QUE PAR SA COMMANDE. Coordonnées, zénys et quantités
// tombent souvent sur un identifiant existant : nommer tout nombre qui en a
// l'air mentirait plus souvent qu'il n'aiderait.

export type IdKind = 'item' | 'mob'

// Le fichier et la ligne (à partir de 0) d'un `- Id:`.
export interface DbSource {
  path: string
  line: number
}

export interface DbEntry {
  id: number
  aegis: string
  name: string
  // Les monstres seulement.
  level?: number
  // Le DERNIER fichier qui l'a écrit : celui dont la valeur l'emporte, donc
  // celui où la corriger.
  source?: DbSource
}

// Une entrée telle qu'un fichier l'écrit : un import peut ne réécrire que
// certains champs d'une entrée déjà lue.
export interface DbEntryFields {
  id: number
  // La ligne de son `- Id:`, à partir de 0.
  line: number
  aegis?: string
  name?: string
  level?: number
}

export interface DbImport {
  path: string
  // `Renewal` ou `Prerenewal` : l'import ne vaut que pour ce mode.
  mode?: string
  // Réservé au générateur de cartes : le map-server le saute.
  generator: boolean
}

export interface DbFile {
  // `Header: Clear: true` : la table repart vide avant ce fichier.
  clear: boolean
  entries: DbEntryFields[]
  imports: DbImport[]
}

const YES = /^(true|yes)$/i

// Une ligne de YAML sans son commentaire. ⚠ UNE LIGNE QUI COMMENCE PAR « # »
// EST MORTE : c'est ainsi que les tables choisissent renewal ou non.
function yamlLine (raw: string): string {
  if (raw.trimStart().startsWith('#')) return ''
  // Un « # » entre guillemets n'ouvre pas de commentaire : « "Carte #1" ».
  return raw.includes('"') ? raw.trimEnd() : raw.replace(/\s+#.*$/, '').trimEnd()
}

// Un fichier de table YAML : son en-tête, ses entrées, ses imports.
// ⚠ SEULES LES CLÉS DE L'ENTRÉE comptent, à l'indentation qui suit `- Id:` :
// plus bas, une liste de butins porte aussi des noms.
export function readDbFile (text: string): DbFile {
  const file: DbFile = { clear: false, entries: [], imports: [] }
  let section = ''
  let current: DbEntryFields | undefined
  let keyIndent = -1
  let imported: DbImport | undefined
  const lines = text.split(/\r?\n/)
  for (let index = 0; index < lines.length; ++index) {
    const line = yamlLine(lines[index])
    if (line === '') continue
    const top = /^([A-Za-z]+):\s*$/.exec(line)
    if (top !== null) {
      section = top[1]
      current = undefined
      imported = undefined
      continue
    }
    if (section === 'Header') {
      const clear = /^\s+Clear:\s*(\S+)$/.exec(line)
      if (clear !== null) file.clear = YES.test(clear[1])
    } else if (section === 'Body') {
      const start = /^(\s*)-\s+Id:\s*(\d+)$/.exec(line)
      if (start !== null) {
        current = { id: Number(start[2]), line: index }
        keyIndent = start[1].length + 2
        file.entries.push(current)
        continue
      }
      if (current === undefined) continue
      const key = /^(\s*)(AegisName|Name|Level):\s*(.*)$/.exec(line)
      if (key === null || key[1].length !== keyIndent) continue
      const value = key[3].replace(/^"(.*)"$/, '$1')
      if (key[2] === 'AegisName') current.aegis = value
      else if (key[2] === 'Name') current.name = value
      else current.level = Number(value)
    } else if (section === 'Footer') {
      const path = /^\s*-\s*Path:\s*(\S+)$/.exec(line)
      if (path !== null) {
        imported = { path: path[1], generator: false }
        file.imports.push(imported)
        continue
      }
      if (imported === undefined) continue
      const option = /^\s+(Mode|Generator):\s*(\S+)$/.exec(line)
      if (option === null) continue
      if (option[1] === 'Mode') imported.mode = option[2]
      else imported.generator = YES.test(option[2])
    }
  }
  return file
}

// Le mode que le serveur compile : `#define RENEWAL` actif dans
// `src/config/renewal.hpp`. Sans ce fichier, celui de rAthena par défaut.
export function isRenewal (renewalHeader: string | undefined): boolean {
  if (renewalHeader === undefined) return true
  return /^\s*#define\s+RENEWAL\s*(\/\/.*)?$/m.test(renewalHeader)
}

export type ReadFile = (relative: string) => Promise<string | undefined>

// Au-delà, une chaîne d'imports se reboucle : le serveur tournerait sans fin.
const MAX_IMPORT_DEPTH = 16

// LA TABLE TELLE QUE LE SERVEUR LA CHARGE (`YamlDatabase::load`) : le corps du
// fichier, puis chacun de ses imports, CHARGÉ EN ENTIER — ses propres imports
// compris — AVANT LE SUIVANT. Une entrée déjà lue n'est que complétée des
// champs que l'import réécrit.
export async function loadDbTable (first: string, read: ReadFile, renewal: boolean): Promise<Map<number, DbEntry>> {
  const table = new Map<number, DbEntry>()
  const mode = renewal ? 'Renewal' : 'Prerenewal'
  const load = async (relative: string, depth: number): Promise<void> => {
    if (depth > MAX_IMPORT_DEPTH) return
    const text = await read(relative)
    if (text === undefined) return
    const file = readDbFile(text)
    if (file.clear) table.clear()
    for (const fields of file.entries) {
      const entry = table.get(fields.id) ?? { id: fields.id, aegis: '', name: '' }
      if (fields.aegis !== undefined) entry.aegis = fields.aegis
      if (fields.name !== undefined) entry.name = fields.name
      if (fields.level !== undefined) entry.level = fields.level
      entry.source = { path: relative, line: fields.line }
      table.set(fields.id, entry)
    }
    for (const imported of file.imports) {
      if (imported.mode !== undefined && imported.mode !== mode) continue
      if (imported.generator) continue
      await load(imported.path, depth + 1)
    }
  }
  await load(first, 0)
  return table
}

// La place de l'identifiant, par commande ; `any` : tout argument en est un.
//
// `byName` : la commande accepte aussi le nom Aegis — `getitem "Red_Potion"`,
// `monster …,"PORING"` —, d'après les signatures de `doc/script_commands.txt`.
// ⚠ PAS CELLES QUI NE LISENT QU'UN NUMÉRO : un nom y casserait le script.
export interface IdArgument { kind: IdKind, byName: boolean }

const ID_ARGUMENTS = new Map<string, IdArgument & { arg: number | 'any' }>([
  ...['getitem', 'getitem2', 'getitem3', 'getitembound', 'getitembound2', 'rentitem', 'rentitem2',
    'delitem', 'delitem2', 'delitem3', 'countitem', 'countitem2', 'countitem3', 'cartcountitem',
    'storagecountitem', 'guildstoragecountitem', 'checkweight', 'getitemname', 'getiteminfo',
    'getnameditem', 'makeitem', 'makeitem2', 'consumeitem', 'setiteminfo'
  ].map(name => [name, { kind: 'item' as IdKind, arg: 0, byName: true }] as const),
  ['itemlink', { kind: 'item', arg: 0, byName: false }],
  ['isequipped', { kind: 'item', arg: 'any', byName: false }],
  ['isequippedcnt', { kind: 'item', arg: 'any', byName: false }],
  ['monster', { kind: 'mob', arg: 4, byName: true }],
  ['areamonster', { kind: 'mob', arg: 6, byName: true }],
  ['getmonsterinfo', { kind: 'mob', arg: 0, byName: true }],
  ['getmobdrops', { kind: 'mob', arg: 0, byName: false }],
  ['strmobinfo', { kind: 'mob', arg: 1, byName: false }]
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
  const kind = idArgumentKind(blank, start, end)
  return kind !== undefined ? { kind, id: Number(blank.slice(start, end)), start, end } : undefined
}

// CE QUE LIT L'ARGUMENT `[start, end)` : un objet, un monstre, ou rien.
//
// ⚠ IL FAUT ÊTRE L'ARGUMENT ENTIER : dans `.@base+1` ou `.@liste[1]`, un
// nombre n'est qu'un morceau d'expression, et le nommer serait faux. Vaut
// pour un nombre, une chaîne (un nom Aegis) ou un mot en cours de frappe.
//
// `typing` : l'instruction s'écrit encore, et peut ne pas être fermée.
export function idArgumentKind (blank: string, start: number, end: number, typing = false): IdKind | undefined {
  return idArgument(blank, start, end, typing)?.kind
}

// La même chose, et si la commande accepte un nom Aegis à cette place.
export function idArgument (blank: string, start: number, end: number, typing = false): IdArgument | undefined {
  let before = start - 1
  while (before >= 0 && /\s/.test(blank[before])) --before
  // Une instruction écrite se ferme plus loin, même après un saut de ligne ;
  // une instruction en cours de frappe peut s'arrêter à la fin de la ligne.
  let after = end
  const space = typing ? /[ \t]/ : /\s/
  while (after < blank.length && space.test(blank[after])) ++after
  if (!(typing ? /[,;)\r\n]/ : /[,;)]/).test(blank[after] ?? ';')) return undefined
  if (before >= 0 && !/[,(]/.test(blank[before]) && !(IDENT.test(blank[before]) && before < start - 1)) return undefined
  const context = argumentContext(blank, start)
  if (context === undefined) return undefined
  const rule = ID_ARGUMENTS.get(context.command)
  if (rule === undefined || (rule.arg !== 'any' && rule.arg !== context.arg)) return undefined
  return { kind: rule.kind, byName: rule.byName }
}

// ⚠ DU TEXTE, PAS DU MARKDOWN : les noms viennent des fichiers de l'espace de
// travail, et un nom écrit comme une image ou un lien ne doit rien charger.
// Le survol les pose par `appendText`, qui échappe tout.
export function describeEntry (kind: IdKind, entry: DbEntry): { name: string, detail: string } {
  const what = kind === 'item' ? `objet ${entry.id}` : `monstre ${entry.id}${entry.level !== undefined ? `, niveau ${entry.level}` : ''}`
  return {
    name: entry.name !== '' ? entry.name : entry.aegis,
    detail: ` (${entry.aegis}) — ${what}`
  }
}
