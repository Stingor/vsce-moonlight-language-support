'use strict'

// LES FICHIERS DU SERVEUR, lus par `vscode.workspace.fs` : sous Remote-SSH, ce
// sont ceux de la machine distante, sans rien changer au code.

import * as vscode from 'vscode'

// Au-delà, on ne cherche plus : ce n'est pas un dépôt de serveur.
const MAX_PARENT_HOPS = 12

export async function exists (uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri)
    return true
  } catch {
    return false
  }
}

// ⚠ EN LATIN-1 : les fichiers du serveur sont en Windows-1252, et un octet
// lu ainsi ressort intact.
export async function readText (uri: vscode.Uri): Promise<string> {
  return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('latin1')
}

// La racine du serveur : le premier dossier parent de `file` qui porte `marker`.
export async function serverRoot (file: vscode.Uri, marker: string): Promise<vscode.Uri | undefined> {
  let dir = vscode.Uri.joinPath(file, '..')
  for (let hop = 0; hop < MAX_PARENT_HOPS; ++hop) {
    if (await exists(vscode.Uri.joinPath(dir, marker))) return dir
    const parent = vscode.Uri.joinPath(dir, '..')
    if (parent.path === dir.path) break
    dir = parent
  }
  return undefined
}
