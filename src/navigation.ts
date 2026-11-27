'use strict'

// Plan du fichier (PNJ, fonctions, étiquettes) et « aller à la définition »
// pour callfunc, callsub, goto, donpcevent "Pnj::OnX", duplicate(Source), et
// pour une commande, jusqu'à son code C++ dans le serveur.

import * as vscode from 'vscode'
import { TextDecoder } from 'util'
import { analyze } from './documentCache'
import { type BuiltinTarget, parseBuiltins } from './builtins'
import { regionAt, contentOf } from './lexer'
import { type NamedLine, type NpcHeader, type ParsedScript, npcKeys, parseScript } from './npcSyntax'

// Les scripts du dépôt : .npc partout, .txt sous un dossier npc/ (l'upstream).
const SCRIPT_GLOB = '{**/*.npc,**/npc/**/*.txt}'
const EXCLUDE_GLOB = '**/node_modules/**'
const IDENTIFIER = /[A-Za-z_][A-Za-z0-9_]*/
const LABEL_SEPARATOR = '::'
// Le source du serveur qui définit les commandes de script.
const BUILTINS_GLOB = '**/src/map/script.cpp'
// Le 1252 décode tout octet ; un nom de PNJ y est lisible tel qu'écrit.
const decoder = new TextDecoder('latin1')

// Les commandes du serveur ouvert dans l'espace de travail, relues quand
// script.cpp change.
class BuiltinIndex {
  private loaded: Promise<Array<{ uri: vscode.Uri, targets: Map<string, BuiltinTarget> }>> | undefined

  reset (): void {
    this.loaded = undefined
  }

  async find (command: string): Promise<vscode.Location[]> {
    if (this.loaded === undefined) {
      this.loaded = (async () => {
        const uris = await vscode.workspace.findFiles(BUILTINS_GLOB, EXCLUDE_GLOB)
        return await Promise.all(uris.map(async uri => ({
          uri,
          targets: parseBuiltins(decoder.decode(await vscode.workspace.fs.readFile(uri)))
        })))
      })()
    }
    const found: vscode.Location[] = []
    for (const { uri, targets } of await this.loaded) {
      const target = targets.get(command.toLowerCase())
      if (target !== undefined) found.push(new vscode.Location(uri, new vscode.Position(target.line, target.column)))
    }
    return found
  }
}

// ---------------------------------------------------------------- plan

function headerKind (header: NpcHeader): vscode.SymbolKind {
  switch (header.kind) {
    case 'function': return vscode.SymbolKind.Function
    case 'shop': return vscode.SymbolKind.Struct
    case 'warp': return vscode.SymbolKind.Interface
    default: return vscode.SymbolKind.Class
  }
}

function lineSymbol (doc: vscode.TextDocument, item: NamedLine, kind: vscode.SymbolKind): vscode.DocumentSymbol {
  const line = doc.lineAt(item.line)
  const selection = new vscode.Range(item.line, item.column, item.line, item.column + item.name.length)
  return new vscode.DocumentSymbol(item.name, '', kind, line.range, selection)
}

function documentSymbols (doc: vscode.TextDocument): vscode.DocumentSymbol[] {
  const script = analyze(doc).script()
  const lastLine = doc.lineCount - 1
  const roots: vscode.DocumentSymbol[] = []
  const npcSymbols = script.headers.map((header, index) => {
    const next = script.headers[index + 1]
    const endLine = next !== undefined ? Math.max(header.line, next.line - 1) : lastLine
    const range = new vscode.Range(header.line, 0, endLine, doc.lineAt(endLine).text.length)
    const selection = new vscode.Range(header.line, header.nameStart, header.line, header.nameEnd)
    const detail = header.duplicateOf !== undefined ? `duplicate(${header.duplicateOf})` : header.kind
    const symbol = new vscode.DocumentSymbol(header.name, detail, headerKind(header), range, selection)
    roots.push(symbol)
    return symbol
  })
  const attach = (item: NamedLine, kind: vscode.SymbolKind): void => {
    const symbol = lineSymbol(doc, item, kind)
    if (item.owner >= 0) npcSymbols[item.owner].children.push(symbol)
    else roots.push(symbol)
  }
  script.labels.forEach(label => {
    attach(label, label.name.startsWith('On') ? vscode.SymbolKind.Event : vscode.SymbolKind.Key)
  })
  script.localFunctions.forEach(fn => { attach(fn, vscode.SymbolKind.Method) })
  npcSymbols.forEach(symbol => { symbol.children.sort((a, b) => a.range.start.line - b.range.start.line) })
  return roots
}

// ------------------------------------------------- index de l'espace de travail

interface Target { uri: vscode.Uri, line: number, column: number }

interface IndexedFile {
  npcs: Map<string, Target[]>
  labels: Map<string, Target[]>
  // Pour la complétion : les fonctions globales, et les événements sous leur
  // nom complet « Pnj::OnX ».
  functions: string[]
  events: string[]
  npcNames: string[]
}

export class WorkspaceIndex {
  // Par fichier, pour qu'une modification ne réindexe que lui.
  private readonly files = new Map<string, IndexedFile>()
  private ready: Promise<void> | undefined

  async npcs (name: string): Promise<Target[]> {
    await this.load()
    return this.collect(entry => entry.npcs.get(name))
  }

  async label (npc: string, label: string): Promise<Target[]> {
    await this.load()
    return this.collect(entry => entry.labels.get(npc + LABEL_SEPARATOR + label))
  }

  update (uri: vscode.Uri, text: string): void {
    const script = parseScript(text)
    const npcs = new Map<string, Target[]>()
    const labels = new Map<string, Target[]>()
    const push = (map: Map<string, Target[]>, key: string, target: Target): void => {
      const list = map.get(key)
      if (list === undefined) map.set(key, [target])
      else list.push(target)
    }
    for (const header of script.headers) {
      for (const key of npcKeys(header.name)) {
        push(npcs, key, { uri, line: header.line, column: header.nameStart })
      }
    }
    for (const label of script.labels) {
      if (label.owner < 0) continue
      for (const key of npcKeys(script.headers[label.owner].name)) {
        push(labels, key + LABEL_SEPARATOR + label.name, { uri, line: label.line, column: label.column })
      }
    }
    const functions = script.headers.filter(header => header.kind === 'function').map(header => header.name)
    // Un PNJ se désigne par son nom UNIQUE, celui d'après « :: » s'il y en a un.
    const uniqueName = (header: NpcHeader): string => {
      const keys = npcKeys(header.name)
      return keys.length > 1 ? keys[1] : keys[0]
    }
    const npcNames = script.headers.filter(header => header.kind !== 'function').map(uniqueName)
    const events: string[] = []
    for (const label of script.labels) {
      if (label.owner < 0 || !label.name.startsWith('On')) continue
      events.push(`${uniqueName(script.headers[label.owner])}${LABEL_SEPARATOR}${label.name}`)
    }
    this.files.set(uri.toString(), { npcs, labels, functions, events, npcNames })
  }

  remove (uri: vscode.Uri): void {
    this.files.delete(uri.toString())
  }

  async updateFromDisk (uri: vscode.Uri): Promise<void> {
    try {
      this.update(uri, decoder.decode(await vscode.workspace.fs.readFile(uri)))
    } catch {
      this.remove(uri)
    }
  }

  // Les noms d'un genre, sans doublon, pour la complétion.
  async names (kind: 'functions' | 'events' | 'npcNames'): Promise<string[]> {
    await this.load()
    const names = new Set<string>()
    this.files.forEach(entry => { entry[kind].forEach(name => names.add(name)) })
    return [...names]
  }

  private collect (pick: (entry: IndexedFile) => Target[] | undefined): Target[] {
    const found: Target[] = []
    this.files.forEach(entry => { found.push(...(pick(entry) ?? [])) })
    return found
  }

  private async load (): Promise<void> {
    if (this.ready === undefined) {
      this.ready = (async () => {
        const uris = await vscode.workspace.findFiles(SCRIPT_GLOB, EXCLUDE_GLOB)
        await Promise.all(uris.map(async uri => { await this.updateFromDisk(uri) }))
      })()
    }
    await this.ready
  }
}

// ------------------------------------------------------- aller à la définition

function toLocation (target: Target): vscode.Location {
  return new vscode.Location(target.uri, new vscode.Position(target.line, target.column))
}

// Le PNJ qui contient la ligne, -1 hors de tout PNJ.
function ownerAt (script: ParsedScript, line: number): number {
  let owner = -1
  script.headers.forEach((header, index) => { if (header.line <= line) owner = index })
  return owner
}

function localTargets (doc: vscode.TextDocument, script: ParsedScript, name: string, line: number): vscode.Location[] {
  const owner = ownerAt(script, line)
  // ⚠ SANS CASSE : le moteur de script range étiquettes et fonctions locales
  // par un hachage en minuscules (`calc_hash`, `strcasecmp`), et `goto L_fin`
  // mène à `L_Fin:`.
  const wanted = name.toLowerCase()
  const matches = [...script.labels, ...script.localFunctions].filter(item => item.name.toLowerCase() === wanted)
  const sameNpc = matches.filter(item => item.owner === owner)
  return (sameNpc.length > 0 ? sameNpc : matches)
    .map(item => new vscode.Location(doc.uri, new vscode.Position(item.line, item.column)))
}

async function definitions (index: WorkspaceIndex, builtins: BuiltinIndex, doc: vscode.TextDocument, position: vscode.Position): Promise<vscode.Location[]> {
  const analysis = analyze(doc)
  const offset = doc.offsetAt(position)
  const inString = regionAt(analysis.regions.strings, offset)

  if (inString !== undefined) {
    const content = contentOf(inString)
    const value = doc.getText().slice(content.start, content.end)
    const separator = value.indexOf(LABEL_SEPARATOR)
    if (separator !== -1) {
      const npc = value.slice(0, separator)
      const label = value.slice(separator + LABEL_SEPARATOR.length)
      return (await index.label(npc, label)).map(toLocation)
    }
    return (await index.npcs(value)).map(toLocation)
  }

  const wordRange = doc.getWordRangeAtPosition(position, IDENTIFIER)
  if (wordRange === undefined) return []
  const word = doc.getText(wordRange)
  // Une étiquette ou une fonction locale masque une commande du même nom.
  const local = localTargets(doc, analysis.script(), word, position.line)
  if (local.length > 0) return local
  const command = await builtins.find(word)
  if (command.length > 0) return command
  return (await index.npcs(word)).map(toLocation)
}

export function registerNavigation (context: vscode.ExtensionContext): WorkspaceIndex {
  const index = new WorkspaceIndex()
  const builtins = new BuiltinIndex()
  const watcher = vscode.workspace.createFileSystemWatcher(SCRIPT_GLOB)
  const builtinsWatcher = vscode.workspace.createFileSystemWatcher(BUILTINS_GLOB)
  context.subscriptions.push(
    watcher,
    builtinsWatcher,
    builtinsWatcher.onDidCreate(() => { builtins.reset() }),
    builtinsWatcher.onDidChange(() => { builtins.reset() }),
    builtinsWatcher.onDidDelete(() => { builtins.reset() }),
    watcher.onDidCreate(uri => { index.updateFromDisk(uri) }),
    watcher.onDidChange(uri => { index.updateFromDisk(uri) }),
    watcher.onDidDelete(uri => { index.remove(uri) }),
    vscode.languages.registerDocumentSymbolProvider('rathena', {
      provideDocumentSymbols: documentSymbols
    }),
    vscode.languages.registerDefinitionProvider('rathena', {
      provideDefinition: async (doc, position) => await definitions(index, builtins, doc, position)
    })
  )
  return index
}
