'use strict'

// LES CONSTANTES DE SCRIPT D'UN OBJET OU D'UN MONSTRE. Aucune dépendance à
// vscode.
//
// Au chargement des tables, le serveur enregistre chaque nom Aegis d'objet
// comme une constante de script (`getitem 3D_Glasses` vaut `getitem 5788`), et
// chaque monstre sous `MOB_<nom Aegis>` (`monster …,MOB_PORING,1`). Une telle
// constante se lit dans TOUTE commande, même celles qui n'acceptent pas de nom
// en chaîne, et elle documente le script d'elle-même.
//
// 🔴 DEUX CAS OÙ ELLE N'EXISTE PAS, et où l'écrire changerait le sens :
// - un nom qui heurte une constante déjà posée (celles de
//   `script_constants.hpp`, de `db/const.yml`, ou un autre objet du même nom) :
//   le serveur la saute, et le nom vaut alors l'AUTRE constante ;
// - un nom que le moteur ne lit pas comme un mot : un caractère hors lettres,
//   chiffres et `_` (`Valkyrja's_Shield` — l'apostrophe ouvre une variable
//   d'instance), ou des chiffres seuls, qu'il lit comme un nombre.
// ⚠ UN CHIFFRE EN TÊTE NE GÊNE PAS : `is_number` ne prend pour un nombre que
// des chiffres QUI NE SONT PAS suivis d'une lettre ou d'un `_`, et `skip_word`
// lit lettres, chiffres et `_` dans n'importe quel ordre — `getitem 3D_Glasses`
// se lit comme `getitem Moonlight_Coin`.
// Le moteur ignore la casse des noms : les collisions se comparent sans elle.

import { type DbEntry, type IdKind, readDbFile } from './idHover'

// Un mot pour le moteur : lettres, chiffres et `_`, avec au moins une lettre
// ou un `_` après les chiffres de tête.
export const SCRIPT_WORD = /^[0-9]*[A-Za-z_][A-Za-z0-9_]*$/
const IDENTIFIER = SCRIPT_WORD

// Les noms que `script_constants.hpp` enregistre, en minuscules.
export function readHardcodedConstants (header: string): Set<string> {
  const names = new Set<string>()
  const add = (name: string): void => { names.add(name.toLowerCase()) }
  for (const match of header.matchAll(/\bexport_(?:deprecated_)?constant\(\s*(\w+)\s*\)/g)) add(match[1])
  for (const match of header.matchAll(/\bexport_(?:deprecated_)?(?:constant[23]|parameter)\(\s*"([^"]+)"/g)) add(match[1])
  // `export_constant_npc(JT_X)` enregistre « X » : le préfixe de trois lettres tombe.
  for (const match of header.matchAll(/\bexport_constant_npc\(\s*(\w+)\s*\)/g)) add(match[1].slice(3))
  return names
}

// Les noms d'une table de constantes (`db/const.yml`) et les fichiers qu'elle
// importe.
export function readConstantTable (text: string): { names: string[], imports: string[] } {
  const names = [...text.matchAll(/^\s*-\s*Name:\s*(\S+)\s*$/gm)].map(match => match[1].toLowerCase())
  return { names, imports: readDbFile(text).imports.map(imported => imported.path) }
}

// Les noms Aegis portés par plus d'une entrée : un seul d'entre eux obtient la
// constante, et l'on ne sait pas lequel sans rejouer l'ordre du serveur.
export function sharedAegisNames (entries: Iterable<DbEntry>): Set<string> {
  const seen = new Set<string>()
  const shared = new Set<string>()
  for (const entry of entries) {
    const key = entry.aegis.toLowerCase()
    if (key === '') continue
    if (seen.has(key)) shared.add(key)
    seen.add(key)
  }
  return shared
}

// La constante qu'a cette entrée, ou rien.
export function constantOf (kind: IdKind, entry: DbEntry, reserved: Set<string>, shared: Set<string>): string | undefined {
  if (entry.aegis === '' || shared.has(entry.aegis.toLowerCase())) return undefined
  const name = kind === 'item' ? entry.aegis : `MOB_${entry.aegis}`
  if (!IDENTIFIER.test(name) || reserved.has(name.toLowerCase())) return undefined
  return name
}

export type IdInsertion = 'constant' | 'id'

// Ce que la complétion insère pour `entry` : la constante si elle existe, sinon
// le nom Aegis en chaîne si la commande l'accepte, sinon le numéro. Dans une
// chaîne déjà ouverte, le nom Aegis seul.
export function insertionFor (kind: IdKind, entry: DbEntry, slot: { byName: boolean, quoted: boolean },
  prefer: IdInsertion, reserved: Set<string>, shared: Set<string>): string {
  if (slot.quoted) return entry.aegis
  if (prefer === 'id') return String(entry.id)
  const constant = constantOf(kind, entry, reserved, shared)
  if (constant !== undefined) return constant
  if (slot.byName && entry.aegis !== '') return `"${entry.aegis}"`
  return String(entry.id)
}
