'use strict'

// Découpe un script en chaînes et commentaires, les seules régions où le texte
// ne se lit pas comme du code. Aucune dépendance à vscode : testable seul.

export interface Region {
  // Décalages dans le texte ; `end` est exclusif.
  start: number
  end: number
}

export interface StringRegion extends Region {
  // Faux quand la ligne finit avant le guillemet fermant.
  closed: boolean
}

export interface Regions {
  strings: StringRegion[]
  comments: Region[]
}

const SLASH = 0x2f
const STAR = 0x2a
const QUOTE = 0x22
const BACKSLASH = 0x5c
const NEWLINE = 0x0a

export function scanRegions (text: string): Regions {
  const strings: StringRegion[] = []
  const comments: Region[] = []
  const length = text.length
  let i = 0
  while (i < length) {
    const c = text.charCodeAt(i)
    const next = i + 1 < length ? text.charCodeAt(i + 1) : -1
    if (c === SLASH && next === SLASH) {
      const lineEnd = text.indexOf('\n', i)
      const end = lineEnd === -1 ? length : lineEnd
      comments.push({ start: i, end })
      i = end
    } else if (c === SLASH && next === STAR) {
      const close = text.indexOf('*/', i + 2)
      const end = close === -1 ? length : close + 2
      comments.push({ start: i, end })
      i = end
    } else if (c === QUOTE) {
      // Une chaîne ne traverse pas une fin de ligne : rAthena la refuse, et
      // la couper là évite qu'un guillemet oublié avale tout le fichier.
      let j = i + 1
      let closed = false
      while (j < length) {
        const d = text.charCodeAt(j)
        if (d === BACKSLASH) {
          j += 2
          continue
        }
        if (d === NEWLINE) break
        if (d === QUOTE) {
          closed = true
          j++
          break
        }
        j++
      }
      const end = Math.min(j, length)
      strings.push({ start: i, end, closed })
      i = end
    } else {
      i++
    }
  }
  return { strings, comments }
}

// Le contenu d'une chaîne, sans ses guillemets.
export function contentOf (region: StringRegion): Region {
  return { start: region.start + 1, end: region.closed ? region.end - 1 : region.end }
}

// La région qui contient `offset`, par dichotomie sur des régions triées.
export function regionAt<T extends Region> (regions: T[], offset: number): T | undefined {
  let low = 0
  let high = regions.length - 1
  while (low <= high) {
    const mid = (low + high) >> 1
    const region = regions[mid]
    if (offset < region.start) high = mid - 1
    else if (offset >= region.end) low = mid + 1
    else return region
  }
  return undefined
}

export function indexOfRegionAt (regions: Region[], offset: number): number {
  let low = 0
  let high = regions.length - 1
  while (low <= high) {
    const mid = (low + high) >> 1
    const region = regions[mid]
    if (offset < region.start) high = mid - 1
    else if (offset >= region.end) low = mid + 1
    else return mid
  }
  return -1
}
