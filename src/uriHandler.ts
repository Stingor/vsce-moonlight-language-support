'use strict'

// `vscode://stingor.moonlight-language-support/mes?source=…&text=…` : le client
// du jeu demande d'ouvrir le script d'un PNJ au `mes` qui a dit `text`.
// `source` est l'adresse que le serveur donne pour ce PNJ, à la ligne de son
// en-tête.
//
// ⚠ L'ADRESSE ARRIVE À LA DERNIÈRE FENÊTRE ACTIVE. Quand elle ne voit pas le
// fichier — une autre connexion, ou aucune —, on rend la main à VSCode avec
// l'adresse du serveur, qui ouvre au moins l'en-tête du PNJ.

import * as vscode from 'vscode'
import { findSpokenLine, readSourceAddress } from './spokenLine'

// Le fichier dans l'espace de travail de CETTE fenêtre : sous Remote-SSH, il
// prend le schéma des dossiers ouverts, quel qu'il soit.
function fileInWorkspace (path: string): vscode.Uri | undefined {
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const root = folder.uri.path.replace(/\/$/, '')
    if (path.toLowerCase().startsWith(root.toLowerCase() + '/')) return folder.uri.with({ path })
  }
  return undefined
}

async function openSpoken (source: string, text: string): Promise<void> {
  const address = readSourceAddress(source)
  const fallback = async (): Promise<void> => { await vscode.env.openExternal(vscode.Uri.parse(source, true)) }
  const sameRemote = address !== undefined && (address.remote === undefined
    ? vscode.env.remoteName === undefined
    : address.remote.startsWith(`${vscode.env.remoteName ?? ''}+`))
  const uri = address !== undefined && sameRemote ? fileInWorkspace(address.path) : undefined
  if (address === undefined || uri === undefined) {
    await fallback()
    return
  }
  let doc: vscode.TextDocument
  try {
    doc = await vscode.workspace.openTextDocument(uri)
  } catch {
    await fallback()
    return
  }
  const lines = doc.getText().split(/\r?\n/)
  const found = findSpokenLine(lines, address.line - 1, text)
  const line = found ?? Math.max(address.line - 1, 0)
  const range = doc.lineAt(Math.min(line, doc.lineCount - 1)).range
  const editor = await vscode.window.showTextDocument(doc, { selection: range })
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter)
  if (found === undefined) {
    void vscode.window.setStatusBarMessage('Ligne du dialogue introuvable : ouvert à l\'en-tête du PNJ.', 5000)
  }
}

export function registerSpokenLineHandler (context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.window.registerUriHandler({
    handleUri (uri: vscode.Uri) {
      if (uri.path !== '/mes') return
      const query = new URLSearchParams(uri.query)
      const source = query.get('source') ?? ''
      if (!source.startsWith('vscode://')) return
      void openSpoken(source, query.get('text') ?? '')
    }
  }))
}
