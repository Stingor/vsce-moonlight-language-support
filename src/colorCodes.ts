'use strict'

// Les codes couleur ^RRGGBB d'un script. Le client n'en lit que dans un texte,
// et une couleur ne survit pas à la fin de sa chaîne : chaque `mes` repart dans
// la couleur par défaut. Aucune dépendance à vscode.

import { type Region, type StringRegion, contentOf } from './lexer'

export const RESET_HEX = '000000'
// « ^ » + six chiffres hexadécimaux.
export const CODE_LENGTH = 7

export interface ColorCode extends Region {
  hex: string
  // Indice de la chaîne qui le porte, dans la liste des chaînes.
  stringIndex: number
  // Vrai pour un ^000000 qui referme une couleur ouverte dans la même chaîne.
  closesColor: boolean
}

export interface ColorSpan extends Region {
  hex: string
}

export interface ColorAnalysis {
  codes: ColorCode[]
  // Le texte coloré ; un ^000000 rend la couleur du thème et n'en produit pas.
  spans: ColorSpan[]
  // Un code auquel il manque un ou deux chiffres : le client l'affiche tel quel.
  malformed: Region[]
}

const VALID_CODE = /\^([0-9a-fA-F]{6})/g
// Quatre ou cinq chiffres, puis ni chiffre ni lettre. Plus court, ce n'est pas
// un code abîmé mais autre chose : « ^empty », une expression « ^aeiouy ».
const TRUNCATED_CODE = /\^[0-9a-fA-F]{4,5}(?![0-9A-Za-z])/g

export function analyzeColors (text: string, strings: StringRegion[]): ColorAnalysis {
  const codes: ColorCode[] = []
  const spans: ColorSpan[] = []
  const malformed: Region[] = []
  strings.forEach((region, stringIndex) => {
    const content = contentOf(region)
    if (content.end <= content.start) return
    const body = text.slice(content.start, content.end)
    if (!body.includes('^')) return

    let current = RESET_HEX
    let segmentStart = -1
    VALID_CODE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = VALID_CODE.exec(body)) !== null) {
      const start = content.start + match.index
      const hex = match[1].toLowerCase()
      if (segmentStart !== -1 && current !== RESET_HEX && start > segmentStart) {
        spans.push({ start: segmentStart, end: start, hex: current })
      }
      codes.push({
        start,
        end: start + CODE_LENGTH,
        hex,
        stringIndex,
        closesColor: hex === RESET_HEX && current !== RESET_HEX
      })
      current = hex
      segmentStart = start + CODE_LENGTH
    }
    if (segmentStart !== -1 && current !== RESET_HEX && content.end > segmentStart) {
      spans.push({ start: segmentStart, end: content.end, hex: current })
    }

    TRUNCATED_CODE.lastIndex = 0
    while ((match = TRUNCATED_CODE.exec(body)) !== null) {
      const start = content.start + match.index
      malformed.push({ start, end: start + match[0].length })
    }
  })
  return { codes, spans, malformed }
}
