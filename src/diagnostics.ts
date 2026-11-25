'use strict'

// Deux erreurs qui ne se voient pas à l'œil : un caractère perdu par une
// lecture dans le mauvais encodage, et un code couleur auquel il manque un
// chiffre (« ^00000 » s'affiche tel quel en jeu).

import * as vscode from 'vscode'
import { analyze, isRathena } from './documentCache'

export const REPLACEMENT_CHAR = '�'
// Au-delà, le fichier est perdu dans son ensemble : la liste n'apprend plus rien.
const MAX_REPLACEMENT_DIAGNOSTICS = 50
const UPDATE_DELAY_MS = 300

export function replacementOffsets (text: string, limit: number): number[] {
  const offsets: number[] = []
  let at = text.indexOf(REPLACEMENT_CHAR)
  while (at !== -1 && offsets.length < limit) {
    offsets.push(at)
    at = text.indexOf(REPLACEMENT_CHAR, at + 1)
  }
  return offsets
}

function compute (doc: vscode.TextDocument): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = []
  const text = doc.getText()
  for (const offset of replacementOffsets(text, MAX_REPLACEMENT_DIAGNOSTICS)) {
    const range = new vscode.Range(doc.positionAt(offset), doc.positionAt(offset + 1))
    const diagnostic = new vscode.Diagnostic(range,
      'Caractère perdu (U+FFFD) : le fichier a été lu dans un autre encodage que le sien. ' +
      'Ne pas enregistrer : rouvrir en Windows 1252, ou repartir de la version de git.',
      vscode.DiagnosticSeverity.Error)
    diagnostic.source = 'moonlight'
    diagnostics.push(diagnostic)
  }
  for (const code of analyze(doc).colors.malformed) {
    const range = new vscode.Range(doc.positionAt(code.start), doc.positionAt(code.end))
    const diagnostic = new vscode.Diagnostic(range,
      'Code couleur incomplet : il faut six chiffres hexadécimaux après « ^ », ' +
      'sinon le client affiche le code tel quel.',
      vscode.DiagnosticSeverity.Warning)
    diagnostic.source = 'moonlight'
    diagnostics.push(diagnostic)
  }
  return diagnostics
}

export function registerDiagnostics (context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection('moonlight')
  const pending = new Map<string, NodeJS.Timeout>()

  const refresh = (doc: vscode.TextDocument): void => {
    if (!isRathena(doc)) {
      collection.delete(doc.uri)
      return
    }
    collection.set(doc.uri, compute(doc))
  }
  const refreshLater = (doc: vscode.TextDocument): void => {
    const key = doc.uri.toString()
    const timer = pending.get(key)
    if (timer !== undefined) clearTimeout(timer)
    pending.set(key, setTimeout(() => {
      pending.delete(key)
      refresh(doc)
    }, UPDATE_DELAY_MS))
  }

  vscode.workspace.textDocuments.forEach(refresh)
  context.subscriptions.push(
    collection,
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument(event => { refreshLater(event.document) }),
    vscode.workspace.onDidCloseTextDocument(doc => { collection.delete(doc.uri) }),
    { dispose: () => { pending.forEach(timer => { clearTimeout(timer) }) } }
  )
}
