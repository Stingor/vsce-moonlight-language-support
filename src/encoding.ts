'use strict'

// Les scripts sont en Windows-1252, avec des îlots CP949 (noms de fichiers de
// la GRF, noms de PNJ) lus octet par octet. Aucun octet n'y est indéfini en
// 1252 : ouvert ainsi, un script ressort intact à l'enregistrement. Ouvert en
// UTF-8, chaque octet invalide devient U+FFFD et l'enregistrement le perd.
//
// La valeur par défaut du langage fixe déjà le 1252 pour un .npc. Elle n'agit
// pas sur un fichier reconnu par sa première ligne, dont l'encodage est choisi
// avant le langage : celui-là est rouvert ici, s'il n'est pas de l'UTF-8 valide.

import * as vscode from 'vscode'
import { TextDecoder } from 'util'
import { isRathena } from './documentCache'
import { REPLACEMENT_CHAR } from './diagnostics'

export const SCRIPT_ENCODING = 'windows1252'
const REOPEN_ACTION = 'Rouvrir en Windows 1252'

function isValidUtf8 (bytes: Uint8Array): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return true
  } catch {
    return false
  }
}

async function reopenInScriptEncoding (doc: vscode.TextDocument): Promise<vscode.TextDocument> {
  return await vscode.workspace.openTextDocument(doc.uri, { encoding: SCRIPT_ENCODING })
}

async function checkEncoding (doc: vscode.TextDocument): Promise<void> {
  if (!isRathena(doc) || doc.uri.scheme !== 'file' || doc.isDirty) return
  if (doc.encoding === SCRIPT_ENCODING) return
  const enabled = vscode.workspace.getConfiguration('rathena', doc).get<boolean>('reopenInWindows1252', true)

  if (enabled) {
    const bytes = await vscode.workspace.fs.readFile(doc.uri)
    if (!isValidUtf8(bytes)) {
      await reopenInScriptEncoding(doc)
      return
    }
  }
  if (doc.getText().includes(REPLACEMENT_CHAR)) {
    const choice = await vscode.window.showWarningMessage(
      `${vscode.workspace.asRelativePath(doc.uri)} contient des caractères perdus (U+FFFD) : ` +
      'il a été lu dans un autre encodage que le sien. L\'enregistrer les perdrait pour de bon.',
      REOPEN_ACTION)
    if (choice === REOPEN_ACTION && !doc.isDirty) await reopenInScriptEncoding(doc)
  }
}

function warnAfterSave (doc: vscode.TextDocument): void {
  if (!isRathena(doc) || !doc.getText().includes(REPLACEMENT_CHAR)) return
  vscode.window.showErrorMessage(
    `${vscode.workspace.asRelativePath(doc.uri)} vient d'être enregistré avec des caractères ` +
    'perdus (U+FFFD). Repartir de la version de git : git restore -- <fichier>, puis rouvrir ' +
    'le fichier en Windows 1252.',
    { modal: true })
}

export function registerEncodingGuard (context: vscode.ExtensionContext): void {
  vscode.workspace.textDocuments.forEach(doc => { checkEncoding(doc) })
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc => { checkEncoding(doc) }),
    vscode.workspace.onDidSaveTextDocument(warnAfterSave)
  )
}
