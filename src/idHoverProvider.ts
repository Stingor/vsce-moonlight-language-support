'use strict'

// LE SURVOL D'UN IDENTIFIANT D'OBJET OU DE MONSTRE.
//
// Les tables sont celles que charge le serveur ouvert, comme il les charge
// (`loadDbTable`) : `db/item_db.yml` et `db/mob_db.yml`, leurs imports en
// profondeur, au mode que compile `src/config/renewal.hpp`. Lues une fois par
// racine, et relues quand une table change.

import * as vscode from 'vscode'
import { analyze, isRathena } from './documentCache'
import { type DbEntry, type IdKind, describeEntry, idAt, isRenewal, loadDbTable } from './idHover'
import { blankRegions } from './scriptChecks'
import { readText, serverRoot } from './serverFiles'

const TABLES: Record<IdKind, string> = { item: 'db/item_db.yml', mob: 'db/mob_db.yml' }
const RENEWAL_HEADER = 'src/config/renewal.hpp'

type Table = Map<number, DbEntry>

async function readOrNothing (root: vscode.Uri, relative: string): Promise<string | undefined> {
  try {
    return await readText(vscode.Uri.joinPath(root, relative))
  } catch {
    return undefined
  }
}

async function loadTable (root: vscode.Uri, kind: IdKind): Promise<Table> {
  const renewal = isRenewal(await readOrNothing(root, RENEWAL_HEADER))
  return await loadDbTable(TABLES[kind], async relative => await readOrNothing(root, relative), renewal)
}

export function registerIdHover (context: vscode.ExtensionContext): void {
  const tables = new Map<string, Promise<Table>>()
  const tableOf = async (root: vscode.Uri, kind: IdKind): Promise<Table> => {
    const key = `${root.toString()}|${kind}`
    let table = tables.get(key)
    if (table === undefined) tables.set(key, table = loadTable(root, kind))
    return await table
  }

  const watcher = vscode.workspace.createFileSystemWatcher('**/{db/**/*.yml,src/config/renewal.hpp}')
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
        const text = new vscode.MarkdownString()
        if (entry === undefined) {
          text.appendText(`⚠ Aucun ${id.kind === 'item' ? 'objet' : 'monstre'} ${id.id} dans les tables que charge le serveur.`)
        } else {
          const described = describeEntry(id.kind, entry)
          text.appendMarkdown('**')
          text.appendText(described.name)
          text.appendMarkdown('**')
          text.appendText(described.detail)
        }
        return new vscode.Hover(text, range)
      }
    })
  )
}
