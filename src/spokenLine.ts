'use strict'

// LA LIGNE D'UN SCRIPT QUI A DIT UN TEXTE DU DIALOGUE. Le client du jeu envoie
// ce que le joueur a lu ; on cherche, dans le PNJ, le `mes` qui l'a produit.
// Aucune dépendance à vscode.
//
// ⚠ LE TEXTE LU N'EST PAS LE TEXTE ÉCRIT : les codes couleur ont disparu, et un
// `mes "Bonjour " + strcharinfo(0) + " !";` n'en laisse que des morceaux. On
// compare donc les CHAÎNES écrites, une à une, au texte lu : la ligne dont une
// chaîne en couvre le plus l'emporte.

import { parseHeaderLine } from './npcSyntax'

export interface SourceAddress {
  // `ssh-remote+<hôte>` ; absent pour un fichier local.
  remote?: string
  path: string
  // À partir de 1 ; 1 si l'adresse n'en porte pas.
  line: number
}

// Un reste d'encodage (`%2B`, `%20`) se décode ; un « % » littéral reste tel quel.
function decodeOnce (text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

// L'adresse que compose le serveur : `vscode://file/<chemin>:<ligne>:<col>` ou
// `vscode://vscode-remote/<autorité>/<chemin>:<ligne>:<col>`.
export function readSourceAddress (url: string): SourceAddress | undefined {
  const local = /^vscode:\/\/file(\/.*)$/.exec(url)
  const remote = /^vscode:\/\/vscode-remote\/([^/]+)(\/.*)$/.exec(url)
  const rest = local?.[1] ?? remote?.[2]
  if (rest === undefined) return undefined
  const position = /^(.*?)(?::(\d+))?(?::(\d+))?$/.exec(decodeOnce(rest))
  if (position === null) return undefined
  return {
    remote: remote !== null ? decodeOnce(remote[1]) : undefined,
    path: position[1],
    line: position[2] !== undefined ? Number(position[2]) : 1
  }
}

// LA REQUÊTE DE `vscode://…/mes?source=…&text=…`, telle que VSCode la remet.
//
// 🔴 PAS DE `URLSearchParams` : VSCode remet la requête DÉJÀ DÉCODÉE, et lui
// changerait chaque « + » en espace — celui de `ssh-remote+<hôte>` d'abord,
// d'où une adresse qui ne désigne plus la fenêtre connectée. Et un « & » du
// texte, décodé lui aussi, couperait la requête en deux. Le texte vient donc
// en dernier, et prend tout ce qui suit `&text=`.
//
// Une requête encore encodée (`source=vscode%3A…`) se décode ici, une fois.
export function readMesQuery (query: string): { source: string, text: string } | undefined {
  const match = /^source=(.*?)&text=(.*)$/s.exec(query)
  if (match === null) return undefined
  if (/^vscode%3A/i.test(match[1])) {
    try {
      return { source: decodeURIComponent(match[1]), text: decodeURIComponent(match[2]) }
    } catch {
      return undefined
    }
  }
  return { source: match[1], text: match[2] }
}

// Les mots que l'on compare : sans codes couleur, sans casse, espaces réunis.
export function normalizeSpoken (text: string): string {
  return text.replace(/\^[0-9a-fA-F]{6}/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

// Au-dessous, une chaîne (« : », « . ») se retrouve partout et ne prouve rien.
const MIN_MATCHED_CHARS = 3
const SPEAKING_COMMANDS = /\b(mes|select|menu|prompt|npctalk|dispbottom|announce)\b/

// La ligne (à partir de 0) du PNJ commençant à `headerLine` qui a dit `shown`.
export function findSpokenLine (lines: string[], headerLine: number, shown: string): number | undefined {
  const wanted = normalizeSpoken(shown)
  if (wanted.length === 0) return undefined
  let best: number | undefined
  let bestScore = 0
  for (let line = Math.max(headerLine, 0); line < lines.length; ++line) {
    if (line > headerLine && parseHeaderLine(lines[line], line) !== undefined) break
    let score = 0
    for (const match of lines[line].matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
      const piece = normalizeSpoken(match[1].replace(/\\(.)/g, '$1'))
      if (piece.length >= MIN_MATCHED_CHARS && wanted.includes(piece)) score += piece.length
    }
    // À couverture égale, une commande qui parle passe devant une affectation.
    if (score > 0 && SPEAKING_COMMANDS.test(lines[line])) score += 0.5
    if (score > bestScore) {
      bestScore = score
      best = line
    }
  }
  return best
}
