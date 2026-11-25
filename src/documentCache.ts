'use strict'

// Une analyse par version de document : la couleur, les diagnostics et le plan
// relisent la même, au lieu de rebalayer le texte à chaque frappe ou à chaque
// mouvement du curseur.

import * as vscode from 'vscode'
import { type Regions, scanRegions } from './lexer'
import { type ColorAnalysis, analyzeColors } from './colorCodes'
import { type ParsedScript, parseScript } from './npcSyntax'

export interface DocumentAnalysis {
  version: number
  regions: Regions
  colors: ColorAnalysis
  // Calculé à la demande : le plan n'est pas toujours ouvert.
  script: () => ParsedScript
}

const cache = new Map<string, DocumentAnalysis>()

export function analyze (doc: vscode.TextDocument): DocumentAnalysis {
  const key = doc.uri.toString()
  const cached = cache.get(key)
  if (cached !== undefined && cached.version === doc.version) return cached
  const text = doc.getText()
  const regions = scanRegions(text)
  let script: ParsedScript | undefined
  const analysis: DocumentAnalysis = {
    version: doc.version,
    regions,
    colors: analyzeColors(text, regions.strings),
    script: () => {
      if (script === undefined) script = parseScript(text)
      return script
    }
  }
  cache.set(key, analysis)
  return analysis
}

export function registerDocumentCache (context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc => {
    cache.delete(doc.uri.toString())
  }))
}

export function isRathena (doc: vscode.TextDocument): boolean {
  return doc.languageId === 'rathena'
}
