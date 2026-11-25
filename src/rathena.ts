'use strict'

// La première ligne qui fait reconnaître un script, quelle que soit son
// extension. package.json en porte la même expression (`firstLine`) : un essai
// vérifie qu'elles ne divergent pas.
export const FIRST_LINE_PATTERN = '^//(===== (rAthena Script|Moonlight)|!rathena)'

export function isRathenaHeader (firstLine: string): boolean {
  return new RegExp(FIRST_LINE_PATTERN).test(firstLine)
}
