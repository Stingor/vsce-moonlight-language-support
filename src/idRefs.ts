'use strict'

// TOUTES LES FAÇONS DONT UN SCRIPT DÉSIGNE UN OBJET OU UN MONSTRE. Aucune
// dépendance à vscode.
//
// - un nombre, argument d'une commande qui lit un identifiant (`getitem 501,1`) ;
// - un nom Aegis en chaîne, au même endroit (`getitem "Red_Potion",1`) ;
// - les balises du texte d'un dialogue, que le client moonclient lit :
//   `^i[501]`, `<ITMR>501:nom</ITMR>`, `<ITEM>nom<INFO>501</INFO></ITEM>`,
//   `<MOBL>1002:rang:nom</MOBL>`, `<MOBS>1002</MOBS>`, `<MOBP>1002</MOBP>`.

import { type IdKind, idArgument, idArgumentKind, idAt } from './idHover'
import { type Regions, contentOf, regionAt } from './lexer'
import { SCRIPT_WORD } from './scriptConstants'

export interface IdRef {
  kind: IdKind
  // L'un des trois : un identifiant, un nom Aegis en chaîne, ou la constante
  // de script d'un objet (`Red_Potion`) ou d'un monstre (`MOB_PORING`).
  id?: number
  aegis?: string
  constant?: string
  start: number
  end: number
}

// Une constante en argument d'une commande qui lit un identifiant :
// `getitem Red_Potion,1`. ⚠ CE PEUT ÊTRE UNE VARIABLE de personnage, qui
// s'écrit sans préfixe : seule la table dira si c'est une constante.
function constantAt (blank: string, offset: number): IdRef | undefined {
  const word = /[A-Za-z0-9_]/
  if (!word.test(blank[offset] ?? '')) return undefined
  let start = offset
  while (start > 0 && word.test(blank[start - 1])) --start
  let end = offset
  while (end < blank.length && word.test(blank[end])) ++end
  const name = blank.slice(start, end)
  if (!SCRIPT_WORD.test(name)) return undefined
  if (start > 0 && /[.@$'#]/.test(blank[start - 1])) return undefined
  // Un appel ou un tableau n'est pas une constante.
  if (/^\s*[([]/.test(blank.slice(end, end + 8))) return undefined
  const kind = idArgumentKind(blank, start, end)
  return kind !== undefined ? { kind, constant: name, start, end } : undefined
}

const TEXT_TAGS: Array<{ kind: IdKind, pattern: RegExp }> = [
  { kind: 'item', pattern: /\^[iI]\[(\d+)\]/g },
  { kind: 'item', pattern: /<ITMR>(\d+):/gi },
  { kind: 'mob', pattern: /<MOB[LSP]>(\d+)/gi }
]
const INFO = /<INFO>(\d+)<\/INFO>/gi

// Les identifiants écrits dans le contenu d'une chaîne, `from` étant son début
// dans le texte.
function textRefs (content: string, from: number): IdRef[] {
  const refs: IdRef[] = []
  const push = (kind: IdKind, match: RegExpMatchArray): void => {
    const start = from + (match.index ?? 0) + match[0].indexOf(match[1])
    refs.push({ kind, id: Number(match[1]), start, end: start + match[1].length })
  }
  for (const { kind, pattern } of TEXT_TAGS) {
    for (const match of content.matchAll(pattern)) push(kind, match)
  }
  // `<INFO>` porte un objet seulement dans un `<ITEM>` ouvert : ailleurs, c'est
  // un lieu ou une adresse.
  for (const match of content.matchAll(INFO)) {
    const head = content.slice(0, match.index ?? 0).toUpperCase()
    if (head.lastIndexOf('<ITEM') > head.lastIndexOf('</ITEM')) push('item', match)
  }
  return refs
}

// Un nom Aegis : une chaîne entière, argument entier d'une commande qui lit un
// identifiant, dont le contenu a la forme d'un nom Aegis.
function aegisRef (text: string, blank: string, regions: Regions, stringIndex: number): IdRef | undefined {
  const string = regions.strings[stringIndex]
  if (!string.closed) return undefined
  const kind = idArgumentKind(blank, string.start, string.end)
  if (kind === undefined) return undefined
  const content = contentOf(string)
  const aegis = text.slice(content.start, content.end)
  if (!/^[A-Za-z0-9_'&-]+$/.test(aegis)) return undefined
  return { kind, aegis, start: content.start, end: content.end }
}

// La désignation sous `offset`, quelle qu'en soit la forme.
export function refAt (text: string, blank: string, regions: Regions, offset: number): IdRef | undefined {
  const string = regionAt(regions.strings, offset)
  if (string === undefined) {
    const code = idAt(blank, offset)
    if (code !== undefined) return { kind: code.kind, id: code.id, start: code.start, end: code.end }
    return constantAt(blank, offset)
  }
  const content = contentOf(string)
  const inText = textRefs(text.slice(content.start, content.end), content.start)
    .find(ref => offset >= ref.start && offset < ref.end)
  if (inText !== undefined) return inText
  const index = regions.strings.indexOf(string)
  const aegis = aegisRef(text, blank, regions, index)
  return aegis !== undefined && offset >= aegis.start && offset < aegis.end ? aegis : undefined
}

// Toutes les désignations du texte, dans l'ordre.
export function allRefs (text: string, blank: string, regions: Regions): IdRef[] {
  const refs: IdRef[] = []
  for (const match of blank.matchAll(/\d+/g)) {
    const code = idAt(blank, match.index ?? 0)
    if (code !== undefined) refs.push({ kind: code.kind, id: code.id, start: code.start, end: code.end })
  }
  for (const match of blank.matchAll(/(?<![A-Za-z0-9_])[0-9]*[A-Za-z_][A-Za-z0-9_]*/g)) {
    const constant = constantAt(blank, match.index ?? 0)
    if (constant !== undefined) refs.push(constant)
  }
  regions.strings.forEach((string, index) => {
    const content = contentOf(string)
    refs.push(...textRefs(text.slice(content.start, content.end), content.start))
    const aegis = aegisRef(text, blank, regions, index)
    if (aegis !== undefined) refs.push(aegis)
  })
  return refs.sort((a, b) => a.start - b.start)
}

// LA PLACE D'UN IDENTIFIANT EN COURS DE FRAPPE : le mot (lettres, chiffres,
// `_`) sous le curseur, s'il est l'argument entier d'une commande qui en lit un.
//
// Entre guillemets (`getitem "red`), la place est le contenu de la chaîne, et
// ce qui s'y insère est un nom Aegis, sans guillemets.
export interface IdSlot {
  kind: IdKind
  // La commande accepte un nom Aegis à cette place.
  byName: boolean
  // La place est le contenu d'une chaîne.
  quoted: boolean
  start: number
  end: number
}

export function idSlotAt (blank: string, regions: Regions, offset: number): IdSlot | undefined {
  const string = regionAt(regions.strings, offset)
  if (string !== undefined) {
    if (offset === string.start) return undefined
    const argument = idArgument(blank, string.start, string.end, true)
    if (argument === undefined || !argument.byName) return undefined
    const content = contentOf(string)
    return { ...argument, quoted: true, start: content.start, end: content.end }
  }
  const word = /[A-Za-z0-9_]/
  let start = offset
  while (start > 0 && word.test(blank[start - 1])) --start
  let end = offset
  while (end < blank.length && word.test(blank[end])) ++end
  // Un mot qui suit un `.`, un `@` ou un `$` est une variable, pas un nom.
  if (start > 0 && /[.@$'#]/.test(blank[start - 1])) return undefined
  const argument = idArgument(blank, start, end, true)
  return argument !== undefined ? { ...argument, quoted: false, start, end } : undefined
}
