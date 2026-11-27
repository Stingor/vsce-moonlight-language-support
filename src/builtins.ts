'use strict'

// Où le serveur définit chaque commande de script : BUILDIN_FUNC(nom) porte le
// code, BUILDIN_DEF2(nom, "alias", ...) donne un second nom au même code
// (« close3 » est buildin_close). Aucune dépendance à vscode.

export interface BuiltinTarget {
  line: number
  column: number
}

const DEFINITION = /^BUILDIN_FUNC\(\s*(\w+)\s*\)/
const ALIAS = /^\s*BUILDIN_DEF2\(\s*(\w+)\s*,\s*"(\w+)"/

// Ce qu'un fichier définit, et les alias qu'il déclare (alias, commande visée).
// Clé en minuscules : le serveur ne tient pas compte de la casse des commandes.
export function parseBuiltinParts (text: string): { definitions: Map<string, BuiltinTarget>, aliases: Array<[string, string]> } {
  const definitions = new Map<string, BuiltinTarget>()
  const aliases: Array<[string, string]> = []
  text.split('\n').forEach((line, index) => {
    const definition = DEFINITION.exec(line)
    if (definition !== null) {
      definitions.set(definition[1].toLowerCase(), { line: index, column: line.indexOf(definition[1]) })
      return
    }
    const alias = ALIAS.exec(line)
    if (alias !== null) aliases.push([alias[2].toLowerCase(), alias[1].toLowerCase()])
  })
  return { definitions, aliases }
}

export function parseBuiltins (text: string): Map<string, BuiltinTarget> {
  const located = mergeBuiltins([{ key: '', text }])
  return new Map([...located].map(([name, found]) => [name, found.target]))
}

// LES COMMANDES DE PLUSIEURS FICHIERS RÉUNIES. ⚠ UN SERVEUR PERSONNALISÉ
// RANGE SES COMMANDES À PART : rAthena inclut `src/custom/script.inc` (le code)
// et `src/custom/script_def.inc` (les déclarations) dans `script.cpp`, et un
// alias peut y viser une commande définie dans un autre fichier.
export function mergeBuiltins (files: Array<{ key: string, text: string }>): Map<string, { key: string, target: BuiltinTarget }> {
  const located = new Map<string, { key: string, target: BuiltinTarget }>()
  const aliases: Array<[string, string]> = []
  for (const { key, text } of files) {
    const parts = parseBuiltinParts(text)
    parts.definitions.forEach((target, name) => { if (!located.has(name)) located.set(name, { key, target }) })
    aliases.push(...parts.aliases)
  }
  for (const [alias, target] of aliases) {
    const found = located.get(target)
    if (found !== undefined && !located.has(alias)) located.set(alias, found)
  }
  return located
}
