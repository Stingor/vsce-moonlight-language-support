'use strict'

// LA DOCUMENTATION DES COMMANDES, lue dans `doc/script_commands.txt` du
// serveur ouvert. Aucune dépendance à vscode.
//
// Une commande s'y annonce par une ou plusieurs lignes `*nom …` — une par
// écriture : `*getitem <item id>,<amount>{,<account ID>};` puis
// `*getitem "<item name>",…` —, suivies de son explication. Les accolades
// entourent ce qui est facultatif.

export interface Parameter {
  // Le paramètre tel qu'écrit, et sa place dans la signature : c'est ce que
  // VSCode met en gras.
  label: string
  start: number
  end: number
  optional: boolean
}

export interface Signature {
  text: string
  parameters: Parameter[]
  // `...` : le dernier paramètre se répète.
  repeats: boolean
}

export interface CommandDoc {
  name: string
  signatures: Signature[]
  // Le premier paragraphe de l'explication.
  summary: string
}

const SIGNATURE_LINE = /^\*([A-Za-z_][A-Za-z0-9_]*)\b(.*)$/

// Les paramètres d'une signature, à la virgule hors des chevrons, guillemets
// et parenthèses ; une accolade ouvrante rend facultatif tout ce qui suit.
export function parseSignature (text: string, name: string): Signature {
  const parameters: Parameter[] = []
  let at = text.indexOf(name) + name.length
  while (at < text.length && /[\s(]/.test(text[at])) ++at
  let depth = 0
  let optional = false
  let quoted = false
  let start = -1
  const close = (end: number): void => {
    if (start === -1) return
    let first = start
    let last = end
    while (first < last && /[\s{}]/.test(text[first])) ++first
    while (last > first && /[\s{});]/.test(text[last - 1])) --last
    // `...<argument>` : le paramètre qui se répète garde son nom, sans les points.
    while (text.startsWith('...', first) && first + 3 < last) first += 3
    const label = text.slice(first, last)
    if (label !== '' && label !== '...') parameters.push({ label, start: first, end: last, optional })
    start = -1
  }
  for (let i = at; i < text.length; ++i) {
    const c = text[i]
    if (c === '"') quoted = !quoted
    if (quoted) { if (start === -1) start = i; continue }
    // ⚠ L'ACCOLADE FERME D'ABORD LE PARAMÈTRE EN COURS : dans
    // `<amount>{,<account ID>}`, c'est ce qui la suit qui est facultatif.
    if (c === '{' && depth === 0) { close(i); optional = true; continue }
    if (c === '<' || c === '(' || c === '[') ++depth
    else if (c === '>' || c === ')' || c === ']') {
      if (depth === 0 && c === ')') { close(i); break }
      --depth
    } else if (depth === 0 && c === ',') { close(i); continue } else if (depth === 0 && c === ';') { close(i); break }
    if (start === -1 && !/[\s}]/.test(c)) start = i
  }
  close(text.length)
  return { text, parameters, repeats: text.includes('...') }
}

export function parseScriptDocs (text: string): Map<string, CommandDoc> {
  const docs = new Map<string, CommandDoc>()
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; ++i) {
    if (SIGNATURE_LINE.exec(lines[i]) === null) continue
    // Le bloc des signatures, puis l'explication jusqu'au premier blanc après elle.
    const block: Array<{ name: string, text: string }> = []
    while (i < lines.length) {
      const match = SIGNATURE_LINE.exec(lines[i])
      if (match === null) break
      block.push({ name: match[1], text: lines[i].slice(1).trim() })
      ++i
    }
    while (i < lines.length && lines[i].trim() === '') ++i
    const summary: string[] = []
    while (i < lines.length && lines[i].trim() !== '' && SIGNATURE_LINE.exec(lines[i]) === null && !lines[i].startsWith('---')) {
      summary.push(lines[i].trim())
      ++i
    }
    --i
    for (const { name, text: signature } of block) {
      const key = name.toLowerCase()
      let doc = docs.get(key)
      if (doc === undefined) docs.set(key, doc = { name, signatures: [], summary: summary.join(' ') })
      if (!doc.signatures.some(known => known.text === signature)) doc.signatures.push(parseSignature(signature, name))
    }
  }
  return docs
}

// La signature qui convient au rang `arg`, et le paramètre à mettre en avant.
export function activeOf (doc: CommandDoc, arg: number): { signature: number, parameter: number } {
  const fits = doc.signatures.findIndex(s => s.repeats || s.parameters.length > arg)
  const signature = fits === -1 ? 0 : fits
  const count = doc.signatures[signature].parameters.length
  return { signature, parameter: Math.min(arg, Math.max(count - 1, 0)) }
}
