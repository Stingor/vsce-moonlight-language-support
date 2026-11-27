'use strict'

// `vscode://stingor.moonlight-language-support/mes?source=…&text=…` : le client
// du jeu demande d'ouvrir le script d'un PNJ au `mes` qui a dit `text`.
// `source` est l'adresse que le serveur donne pour ce PNJ, à la ligne de son
// en-tête.
//
// ⚠ L'ADRESSE ARRIVE À LA DERNIÈRE FENÊTRE ACTIVE, ET N'IMPORTE QUI PEUT
// L'ÉCRIRE : une page web aussi. D'où trois règles.
// - Elle n'ouvre qu'un fichier d'un dossier ouvert dans CETTE fenêtre, sans
//   « .. » : rien hors de l'espace de travail ne s'affiche.
// - Elle ne rebondit vers AUCUNE autre adresse : renvoyer `source` à VSCode
//   ferait de l'extension un relais vers n'importe quelle adresse `vscode://`,
//   connexion SSH comprise.
// - Elle ne fait qu'ouvrir et montrer : ni écriture, ni commande, ni réseau.

import * as vscode from 'vscode'
import { type SourceAddress, findSpokenLine, readMesQuery, readSourceAddress } from './spokenLine'

// Le fichier dans l'espace de travail de CETTE fenêtre : sous Remote-SSH, il
// prend le schéma des dossiers ouverts, quel qu'il soit.
export function fileInWorkspace (path: string): vscode.Uri | undefined {
  // eslint-disable-next-line no-control-regex
  if (path.split('/').includes('..') || /[\x00-\x1f]/.test(path)) return undefined
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const root = folder.uri.path.replace(/\/$/, '')
    if (path.toLowerCase().startsWith(root.toLowerCase() + '/')) return folder.uri.with({ path })
  }
  return undefined
}

// Le message dit ce qui était visé, et d'où : c'est ce qui permet de voir si
// l'hôte ou le dossier ne correspond pas.
function notFound (address: SourceAddress | undefined): void {
  const where = address === undefined
    ? 'adresse illisible'
    : `${address.path} (${address.remote ?? 'local'}), fenêtre : ${vscode.env.remoteName ?? 'locale'}`
  void vscode.window.showWarningMessage(`Ce script n'est pas dans les dossiers ouverts de cette fenêtre — ${where}.`)
}

async function openSpoken (source: string, text: string): Promise<void> {
  const address = readSourceAddress(source)
  const sameRemote = address !== undefined && (address.remote === undefined
    ? vscode.env.remoteName === undefined
    : address.remote.startsWith(`${vscode.env.remoteName ?? ''}+`))
  const uri = address !== undefined && sameRemote ? fileInWorkspace(address.path) : undefined
  if (address === undefined || uri === undefined) {
    notFound(address)
    return
  }
  let doc: vscode.TextDocument
  try {
    doc = await vscode.workspace.openTextDocument(uri)
  } catch {
    notFound(address)
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
      const query = readMesQuery(uri.query)
      if (query === undefined || !query.source.startsWith('vscode://')) return
      void openSpoken(query.source, query.text)
    }
  }))
}
