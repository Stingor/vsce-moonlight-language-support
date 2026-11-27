'use strict'

// LE SURVOL D'UN IDENTIFIANT D'OBJET OU DE MONSTRE.
//
// Les tables sont celles que charge le serveur ouvert : `db/item_db.yml` et
// `db/mob_db.yml`, puis ce qu'ils importent, dans l'ordre — une entrée lue plus
// tard remplace la précédente, comme chez lui. Lues une fois par racine, et
// relues quand une table change.

import * as vscode from 'vscode'
import { analyze, isRathena } from './documentCache'
import { type DbEntry, type IdKind, describeEntry, idAt, readDbEntries, readDbImports } from './idHover'
import { blankRegions } from './scriptChecks'
import { readText, serverRoot } from './serverFiles'

const TABLES: Record<IdKind, string> = { item: 'db/item_db.yml', mob: 'db/mob_db.yml' }
// Une chaîne d'imports qui se reboucle ne doit pas tourner sans fin.
const MAX_TABLE_FILES = 200

type Table = Map<number, DbEntry>

async function loadTable (root: vscode.Uri, first: string): Promise<Table> {
  const table: Table = new Map()
  const pending = [first]
  const seen = new Set<string>()
  while (pending.length > 0 && seen.size < MAX_TABLE_FILES) {
    const relative = pending.shift() as string
    if (seen.has(relative)) continue
    seen.add(relative)
    let text: string
    try {
      text = await readText(vscode.Uri.joinPath(root, relative))
    } catch {
      continue
    }
    for (const entry of readDbEntries(text)) table.set(entry.id, entry)
    pending.push(...readDbImports(text))
  }
  return table
}

export function registerIdHover (context: vscode.ExtensionContext): void {
  const tables = new Map<string, Promise<Table>>()
  const tableOf = async (root: vscode.Uri, kind: IdKind): Promise<Table> => {
    const key = `${root.toString()}|${kind}`
    let table = tables.get(key)
    if (table === undefined) tables.set(key, table = loadTable(root, TABLES[kind]))
    return await table
  }

  const watcher = vscode.workspace.createFileSystemWatcher('**/db/**/*.yml')
  const forget = (): void => { tables.clear() }
  context.subscriptions.push(
    watcher, watcher.onDidChange(forget), watcher.onDidCreate(forget), watcher.onDidDelete(forget),
    vscode.languages.registerHoverProvider({ language: 'rathena' }, {
      async provideHover (doc, position) {
        if (!isRathena(doc)) return undefined
        const analysis = analyze(doc)
        const id = idAt(blankRegions(doc.getText(), analysis.regions), doc.offsetAt(position))
        if (id === undefined) return undefined
        const root = await serverRoot(doc.uri, TABLES[id.kind])
        if (root === undefined) return undefined
        const entry = (await tableOf(root, id.kind)).get(id.id)
        const range = new vscode.Range(doc.positionAt(id.start), doc.positionAt(id.end))
        const text = entry !== undefined
          ? describeEntry(id.kind, entry)
          : `⚠ Aucun ${id.kind === 'item' ? 'objet' : 'monstre'} ${id.id} dans les tables du serveur.`
        return new vscode.Hover(new vscode.MarkdownString(text), range)
      }
    })
  )
}
