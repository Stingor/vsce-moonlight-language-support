'use strict'

// Les objets d'un script : en-têtes de PNJ et de fonctions, étiquettes,
// fonctions locales. Aucune dépendance à vscode.

import { type Region, regionAt, scanRegions } from './lexer'

export type HeaderKind = 'function' | 'script' | 'duplicate' | 'shop' | 'warp'

export interface NpcHeader {
  line: number
  kind: HeaderKind
  // Le nom tel qu'écrit : « Affiché#caché::Unique ».
  name: string
  // Colonnes du nom dans la ligne ; `nameEnd` exclusif.
  nameStart: number
  nameEnd: number
  // Le PNJ copié, pour un duplicate(Source).
  duplicateOf?: string
}

export interface NamedLine {
  line: number
  name: string
  column: number
  // Indice de l'en-tête qui le précède, -1 hors de tout PNJ.
  owner: number
}

export interface ParsedScript {
  headers: NpcHeader[]
  labels: NamedLine[]
  localFunctions: NamedLine[]
}

// <carte,x,y,dir>|-|function <TAB> type[(option)] <TAB> nom <TAB> ...
const HEADER = /^([^\t/][^\t]*)\t(script|duplicate|shop|cashshop|itemshop|pointshop|marketshop|trader|warp|warp2)(?:\(([^)]*)\))?\t([^\t]+)/
const SHOP_TYPES = new Set(['shop', 'cashshop', 'itemshop', 'pointshop', 'marketshop', 'trader'])
const LABEL = /^(\s*)([A-Za-z_][A-Za-z0-9_]*):(?!:)\s*(?:\/\/.*)?$/
const LOCAL_FUNCTION = /^(\s*)function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/
const NOT_LABELS = new Set(['default'])

export function parseHeaderLine (text: string, line: number): NpcHeader | undefined {
  const match = HEADER.exec(text)
  if (match === null) return undefined
  const [, first, type, option, rawName] = match
  let kind: HeaderKind
  if (first === 'function') kind = 'function'
  else if (type === 'duplicate') kind = 'duplicate'
  else if (SHOP_TYPES.has(type)) kind = 'shop'
  else if (type === 'warp' || type === 'warp2') kind = 'warp'
  else kind = 'script'
  const name = rawName.trimEnd()
  const nameStart = match[0].length - rawName.length
  return {
    line,
    kind,
    name,
    nameStart,
    nameEnd: nameStart + name.length,
    duplicateOf: kind === 'duplicate' ? option : undefined
  }
}

// Les noms sous lesquels un autre script peut désigner ce PNJ : le nom entier,
// sa partie unique après « :: », et ce qui la précède.
export function npcKeys (name: string): string[] {
  const keys = [name]
  const separator = name.indexOf('::')
  if (separator !== -1) {
    keys.push(name.slice(separator + 2), name.slice(0, separator))
  }
  return keys.filter((key, index) => key !== '' && keys.indexOf(key) === index)
}

export function parseScript (text: string): ParsedScript {
  const { comments } = scanRegions(text)
  const headers: NpcHeader[] = []
  const labels: NamedLine[] = []
  const localFunctions: NamedLine[] = []
  let offset = 0
  let line = 0
  const insideComment = (at: number): boolean => regionAt<Region>(comments, at) !== undefined
  for (const raw of text.split('\n')) {
    const lineText = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    const lineStart = offset
    offset += raw.length + 1
    line++
    if (lineText.length === 0 || insideComment(lineStart)) continue
    const current = line - 1

    const header = parseHeaderLine(lineText, current)
    if (header !== undefined) {
      headers.push(header)
      continue
    }
    const owner = headers.length - 1
    const label = LABEL.exec(lineText)
    if (label !== null && !NOT_LABELS.has(label[2])) {
      labels.push({ line: current, name: label[2], column: label[1].length, owner })
      continue
    }
    const fn = LOCAL_FUNCTION.exec(lineText)
    if (fn !== null) {
      const column = lineText.indexOf(fn[2], fn[1].length + 'function'.length)
      localFunctions.push({ line: current, name: fn[2], column, owner })
    }
  }
  return { headers, labels, localFunctions }
}
