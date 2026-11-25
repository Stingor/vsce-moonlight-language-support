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

// Clé en minuscules : le serveur ne tient pas compte de la casse des commandes.
export function parseBuiltins (text: string): Map<string, BuiltinTarget> {
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
  for (const [alias, target] of aliases) {
    const found = definitions.get(target)
    if (found !== undefined && !definitions.has(alias)) definitions.set(alias, found)
  }
  return definitions
}
