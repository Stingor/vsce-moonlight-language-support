'use strict'

// LES IDENTIFIANTS D'OBJETS ET DE MONSTRES DANS L'ÉDITEUR : survol, aller à la
// définition, complétion par le nom, et signalement de ceux que le serveur ne
// connaît pas.
//
// Les tables sont celles que charge le serveur ouvert, comme il les charge
// (`loadDbTable`) : `db/item_db.yml` et `db/mob_db.yml`, leurs imports en
// profondeur, au mode que compile `src/config/renewal.hpp`. Lues une fois par
// racine, et relues quand une table change.

import * as vscode from 'vscode'
import { analyze, isRathena } from './documentCache'
import { type DbEntry, type IdKind, describeEntry, isRenewal, loadDbTable } from './idHover'
import { type IdRef, allRefs, idSlotAt, refAt } from './idRefs'
import {
  type IdInsertion, constantOf, insertionFor, readConstantTable, readHardcodedConstants, sharedAegisNames
} from './scriptConstants'
import { blankRegions } from './scriptChecks'
import { readText, serverRoot } from './serverFiles'

const TABLES: Record<IdKind, string> = { item: 'db/item_db.yml', mob: 'db/mob_db.yml', quest: 'db/quest_db.yml' }
const RENEWAL_HEADER = 'src/config/renewal.hpp'
const UPDATE_DELAY_MS = 500

const HARDCODED_CONSTANTS = 'src/map/script_constants.hpp'
const CONSTANT_TABLE = 'db/const.yml'
// Une chaîne d'imports qui se reboucle ne doit pas tourner sans fin.
const MAX_CONSTANT_FILES = 32

interface Table {
  byId: Map<number, DbEntry>
  // ⚠ SANS CASSE : le serveur retrouve un nom Aegis sans tenir compte de la casse.
  byAegis: Map<string, DbEntry>
  // Les noms Aegis portés par plusieurs entrées : aucune constante sûre.
  shared: Set<string>
}

interface Tables {
  root: vscode.Uri
  item: Table
  mob: Table
  quest: Table
  // Les constantes déjà posées quand les tables arrivent : un nom Aegis qui
  // les heurte n'obtient pas la sienne.
  reserved: Set<string>
}

async function loadReserved (root: vscode.Uri): Promise<Set<string>> {
  const reserved = readHardcodedConstants(await readOrNothing(root, HARDCODED_CONSTANTS) ?? '')
  const pending = [CONSTANT_TABLE]
  const seen = new Set<string>()
  while (pending.length > 0 && seen.size < MAX_CONSTANT_FILES) {
    const relative = pending.shift() as string
    if (seen.has(relative)) continue
    seen.add(relative)
    const text = await readOrNothing(root, relative)
    if (text === undefined) continue
    const table = readConstantTable(text)
    table.names.forEach(name => reserved.add(name))
    pending.push(...table.imports)
  }
  return reserved
}

async function readOrNothing (root: vscode.Uri, relative: string): Promise<string | undefined> {
  try {
    return await readText(vscode.Uri.joinPath(root, relative))
  } catch {
    return undefined
  }
}

async function loadTables (root: vscode.Uri): Promise<Tables> {
  const renewal = isRenewal(await readOrNothing(root, RENEWAL_HEADER))
  const load = async (kind: IdKind): Promise<Table> => {
    const byId = await loadDbTable(TABLES[kind], async relative => await readOrNothing(root, relative), renewal)
    const byAegis = new Map<string, DbEntry>()
    for (const entry of byId.values()) if (entry.aegis !== '') byAegis.set(entry.aegis.toLowerCase(), entry)
    return { byId, byAegis, shared: sharedAegisNames(byId.values()) }
  }
  return { root, item: await load('item'), mob: await load('mob'), quest: await load('quest'), reserved: await loadReserved(root) }
}

function entryOf (tables: Tables, ref: IdRef): DbEntry | undefined {
  const table = tables[ref.kind]
  if (ref.id !== undefined) return table.byId.get(ref.id)
  if (ref.constant === undefined) return table.byAegis.get((ref.aegis ?? '').toLowerCase())
  // Une constante : `Red_Potion`, ou `MOB_PORING` pour un monstre. Elle ne
  // désigne l'entrée que si le serveur la lui a bien donnée.
  const aegis = ref.kind === 'mob' ? /^MOB_(.+)$/i.exec(ref.constant)?.[1] : ref.constant
  const entry = aegis !== undefined ? table.byAegis.get(aegis.toLowerCase()) : undefined
  return entry !== undefined && constantOf(ref.kind, entry, tables.reserved, table.shared) !== undefined ? entry : undefined
}

// Une constante inconnue ne se signale que si elle ne peut pas être une
// variable : `MOB_…` en est une, un nom d'objet nu peut-être pas.
function isReportable (ref: IdRef): boolean {
  return ref.constant === undefined || (ref.kind === 'mob' && /^MOB_/i.test(ref.constant))
}

function whatOf (ref: IdRef): string {
  const noun = ref.kind === 'item' ? 'objet' : ref.kind === 'mob' ? 'monstre' : 'quête'
  return ref.id !== undefined ? `${noun} ${ref.id}` : `${noun} « ${ref.constant ?? ref.aegis ?? ''} »`
}

export function registerIdHover (context: vscode.ExtensionContext): void {
  const cache = new Map<string, Promise<Tables>>()
  const diagnostics = vscode.languages.createDiagnosticCollection('moonlight-identifiants')
  const pending = new Map<string, NodeJS.Timeout>()

  const tablesFor = async (doc: vscode.TextDocument): Promise<Tables | undefined> => {
    const root = await serverRoot(doc.uri, TABLES.item)
    if (root === undefined) return undefined
    const key = root.toString()
    let tables = cache.get(key)
    if (tables === undefined) cache.set(key, tables = loadTables(root))
    return await tables
  }
  const refsOf = (doc: vscode.TextDocument): { text: string, blank: string, regions: ReturnType<typeof analyze>['regions'] } => {
    const analysis = analyze(doc)
    const text = doc.getText()
    return { text, blank: blankRegions(text, analysis.regions), regions: analysis.regions }
  }

  // ── LES INCONNUS ──────────────────────────────────────────────────────────
  const check = async (doc: vscode.TextDocument): Promise<void> => {
    if (!isRathena(doc) || !vscode.workspace.getConfiguration('rathena').get<boolean>('checkScripts', true)) {
      diagnostics.delete(doc.uri)
      return
    }
    const tables = await tablesFor(doc)
    if (tables === undefined) return
    const version = doc.version
    const { text, blank, regions } = refsOf(doc)
    const found: vscode.Diagnostic[] = []
    for (const ref of allRefs(text, blank, regions)) {
      if (entryOf(tables, ref) !== undefined || !isReportable(ref)) continue
      const range = new vscode.Range(doc.positionAt(ref.start), doc.positionAt(ref.end))
      const diagnostic = new vscode.Diagnostic(range,
        `${whatOf(ref)[0].toUpperCase()}${whatOf(ref).slice(1)} absent${ref.kind === 'quest' ? 'e' : ''} des tables que charge le serveur.`,
        vscode.DiagnosticSeverity.Warning)
      diagnostic.source = 'moonlight'
      found.push(diagnostic)
    }
    // Une frappe arrivée pendant la lecture des tables a déjà relancé la vérification.
    if (doc.version === version) diagnostics.set(doc.uri, found)
  }
  const checkLater = (doc: vscode.TextDocument): void => {
    const key = doc.uri.toString()
    const timer = pending.get(key)
    if (timer !== undefined) clearTimeout(timer)
    pending.set(key, setTimeout(() => {
      pending.delete(key)
      void check(doc)
    }, UPDATE_DELAY_MS))
  }
  const recheckAll = (): void => { vscode.workspace.textDocuments.forEach(checkLater) }

  const watcher = vscode.workspace.createFileSystemWatcher('**/{db/**/*.yml,src/config/renewal.hpp}')
  const forget = (): void => {
    cache.clear()
    recheckAll()
  }

  context.subscriptions.push(
    diagnostics, watcher, watcher.onDidChange(forget), watcher.onDidCreate(forget), watcher.onDidDelete(forget),
    vscode.workspace.onDidOpenTextDocument(checkLater),
    vscode.workspace.onDidChangeTextDocument(event => { checkLater(event.document) }),
    vscode.workspace.onDidCloseTextDocument(doc => { diagnostics.delete(doc.uri) }),
    vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('rathena.checkScripts')) recheckAll() }),
    { dispose: () => { pending.forEach(timer => { clearTimeout(timer) }) } },

    // ── LE SURVOL ───────────────────────────────────────────────────────────
    vscode.languages.registerHoverProvider({ language: 'rathena' }, {
      async provideHover (doc, position) {
        const { text, blank, regions } = refsOf(doc)
        const ref = refAt(text, blank, regions, doc.offsetAt(position))
        if (ref === undefined) return undefined
        const tables = await tablesFor(doc)
        if (tables === undefined) return undefined
        const entry = entryOf(tables, ref)
        const range = new vscode.Range(doc.positionAt(ref.start), doc.positionAt(ref.end))
        // ⚠ `appendText` : les noms viennent des fichiers, et s'affichent échappés.
        const shown = new vscode.MarkdownString()
        if (entry === undefined) {
          shown.appendText(`⚠ ${ref.kind === 'quest' ? 'Aucune' : 'Aucun'} ${whatOf(ref)} dans les tables que charge le serveur.`)
        } else {
          const described = describeEntry(ref.kind, entry)
          shown.appendMarkdown('**')
          shown.appendText(described.name)
          shown.appendMarkdown('**')
          shown.appendText(described.detail)
          if (entry.source !== undefined) shown.appendText(`\n\n${entry.source.path}:${entry.source.line + 1}`)
        }
        return new vscode.Hover(shown, range)
      }
    }),

    // ── ALLER À LA DÉFINITION : l'entrée du dernier fichier qui l'a écrite ──
    vscode.languages.registerDefinitionProvider({ language: 'rathena' }, {
      async provideDefinition (doc, position) {
        const { text, blank, regions } = refsOf(doc)
        const ref = refAt(text, blank, regions, doc.offsetAt(position))
        if (ref === undefined) return undefined
        const tables = await tablesFor(doc)
        const source = tables !== undefined ? entryOf(tables, ref)?.source : undefined
        if (tables === undefined || source === undefined) return undefined
        return new vscode.Location(vscode.Uri.joinPath(tables.root, source.path), new vscode.Position(source.line, 0))
      }
    }),

    // ── LA COMPLÉTION PAR LE NOM ────────────────────────────────────────────
    vscode.languages.registerCompletionItemProvider({ language: 'rathena' }, {
      async provideCompletionItems (doc, position) {
        const { blank, regions } = refsOf(doc)
        const slot = idSlotAt(blank, regions, doc.offsetAt(position))
        if (slot === undefined) return undefined
        const tables = await tablesFor(doc)
        if (tables === undefined) return undefined
        // LA CONSTANTE, PAR DÉFAUT : `getitem Red_Potion` se lit sans table
        // sous les yeux. Voir `insertionFor` pour les noms qui n'en ont pas.
        const prefer = vscode.workspace.getConfiguration('rathena').get<IdInsertion>('completeIdsAs', 'constant')
        const table = tables[slot.kind]
        const range = new vscode.Range(doc.positionAt(slot.start), doc.positionAt(slot.end))
        const items: vscode.CompletionItem[] = []
        for (const entry of table.byId.values()) {
          if (slot.quoted && entry.aegis === '') continue
          const name = entry.name !== '' ? entry.name : entry.aegis
          const item = new vscode.CompletionItem({ label: name, description: entry.aegis !== '' ? `${entry.id} · ${entry.aegis}` : String(entry.id) },
            slot.kind === 'item' ? vscode.CompletionItemKind.Value : slot.kind === 'mob' ? vscode.CompletionItemKind.Struct : vscode.CompletionItemKind.Event)
          item.insertText = insertionFor(slot.kind, entry, slot, prefer, tables.reserved, table.shared)
          // Le nom, le nom Aegis et le nombre : on retrouve une entrée par l'un des trois.
          item.filterText = `${name} ${entry.aegis} ${entry.id}`
          item.range = range
          items.push(item)
        }
        return new vscode.CompletionList(items, false)
      }
    }, '"')
  )
  vscode.workspace.textDocuments.forEach(checkLater)
}
