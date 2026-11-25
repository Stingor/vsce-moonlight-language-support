'use strict'

// Rendu des codes couleur ^RRGGBB : le texte prend sa couleur jusqu'au code
// suivant ou jusqu'à la fin de sa chaîne, comme en jeu. Les codes eux-mêmes
// sont masqués, sauf dans la chaîne où se trouve le curseur.

import * as vscode from 'vscode'
import { analyze, isRathena } from './documentCache'
import { type ColorCode, CODE_LENGTH, RESET_HEX } from './colorCodes'
import { indexOfRegionAt } from './lexer'

const UPDATE_DELAY_MS = 200

// Masque un code sans le retirer du texte : invisible et sans largeur.
const hiddenCodeType = vscode.window.createTextEditorDecorationType({
  letterSpacing: '-.54em',
  opacity: '0',
  textDecoration: 'none; display: inline-block; width: 0;'
})
const colorTypes = new Map<string, vscode.TextEditorDecorationType>()

// Les plages calculées pour une version de document : un mouvement du curseur
// ne refait que le masquage, pas le calcul.
interface RenderedDocument {
  version: number
  spansByHex: Map<string, vscode.Range[]>
  codes: Array<{ code: ColorCode, range: vscode.Range }>
}
const rendered = new Map<string, RenderedDocument>()
// Par éditeur : la chaîne dont les codes sont visibles.
const revealedString = new WeakMap<vscode.TextEditor, number>()

function setting (name: string): boolean {
  return vscode.workspace.getConfiguration('rathena').get<boolean>(name, true)
}

function colorType (hex: string): vscode.TextEditorDecorationType {
  let type = colorTypes.get(hex)
  if (type === undefined) {
    type = vscode.window.createTextEditorDecorationType({ color: `#${hex}` })
    colorTypes.set(hex, type)
  }
  return type
}

function render (doc: vscode.TextDocument): RenderedDocument {
  const key = doc.uri.toString()
  const cached = rendered.get(key)
  if (cached !== undefined && cached.version === doc.version) return cached
  const { colors } = analyze(doc)
  const spansByHex = new Map<string, vscode.Range[]>()
  for (const span of colors.spans) {
    let ranges = spansByHex.get(span.hex)
    if (ranges === undefined) {
      ranges = []
      spansByHex.set(span.hex, ranges)
    }
    ranges.push(new vscode.Range(doc.positionAt(span.start), doc.positionAt(span.end)))
  }
  const codes = colors.codes.map(code => ({
    code,
    range: new vscode.Range(doc.positionAt(code.start), doc.positionAt(code.end))
  }))
  const result = { version: doc.version, spansByHex, codes }
  rendered.set(key, result)
  return result
}

function cursorString (editor: vscode.TextEditor): number {
  const { regions } = analyze(editor.document)
  const offset = editor.document.offsetAt(editor.selection.active)
  return indexOfRegionAt(regions.strings, offset)
}

function clear (editor: vscode.TextEditor): void {
  editor.setDecorations(hiddenCodeType, [])
  colorTypes.forEach(type => { editor.setDecorations(type, []) })
}

function applyHidden (editor: vscode.TextEditor, doc: RenderedDocument, revealed: number): void {
  if (!setting('hideColorCodes')) {
    editor.setDecorations(hiddenCodeType, [])
    return
  }
  // Un ^000000 seul ne colore rien : il reste visible pour qu'on le voie.
  const hidden = doc.codes
    .filter(({ code }) => code.stringIndex !== revealed && (code.hex !== RESET_HEX || code.closesColor))
    .map(({ range }) => range)
  editor.setDecorations(hiddenCodeType, hidden)
}

function update (editor: vscode.TextEditor): void {
  if (!isRathena(editor.document) || !setting('renderColors')) {
    clear(editor)
    return
  }
  const doc = render(editor.document)
  colorTypes.forEach((type, hex) => {
    if (!doc.spansByHex.has(hex)) editor.setDecorations(type, [])
  })
  doc.spansByHex.forEach((ranges, hex) => { editor.setDecorations(colorType(hex), ranges) })
  const revealed = cursorString(editor)
  revealedString.set(editor, revealed)
  applyHidden(editor, doc, revealed)
}

function onSelection (editor: vscode.TextEditor): void {
  if (!isRathena(editor.document) || !setting('renderColors')) return
  const revealed = cursorString(editor)
  if (revealedString.get(editor) === revealed) return
  revealedString.set(editor, revealed)
  applyHidden(editor, render(editor.document), revealed)
}

function hexToColor (hex: string): vscode.Color {
  const channel = (at: number): number => parseInt(hex.slice(at, at + 2), 16) / 255
  return new vscode.Color(channel(0), channel(2), channel(4), 1)
}

function colorToHex (color: vscode.Color): string {
  const channel = (value: number): string => Math.round(value * 255).toString(16).padStart(2, '0')
  return channel(color.red) + channel(color.green) + channel(color.blue)
}

export function registerColorDecorations (context: vscode.ExtensionContext): void {
  const pending = new Map<string, NodeJS.Timeout>()
  const updateDocumentLater = (doc: vscode.TextDocument): void => {
    const key = doc.uri.toString()
    const timer = pending.get(key)
    if (timer !== undefined) clearTimeout(timer)
    pending.set(key, setTimeout(() => {
      pending.delete(key)
      vscode.window.visibleTextEditors.filter(e => e.document === doc).forEach(update)
    }, UPDATE_DELAY_MS))
  }

  vscode.window.visibleTextEditors.forEach(update)
  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(editors => { editors.forEach(update) }),
    vscode.workspace.onDidChangeTextDocument(event => { updateDocumentLater(event.document) }),
    vscode.window.onDidChangeTextEditorSelection(event => { onSelection(event.textEditor) }),
    vscode.workspace.onDidCloseTextDocument(doc => { rendered.delete(doc.uri.toString()) }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('rathena')) vscode.window.visibleTextEditors.forEach(update)
    }),
    vscode.languages.registerColorProvider('rathena', {
      // Le sélecteur ne dépend pas du rendu : il relit l'analyse du document.
      provideDocumentColors (document) {
        if (!setting('showColorPicker')) return []
        return analyze(document).colors.codes
          .filter(code => !code.closesColor)
          .map(code => new vscode.ColorInformation(
            new vscode.Range(document.positionAt(code.start), document.positionAt(code.start + CODE_LENGTH)),
            hexToColor(code.hex)))
      },
      provideColorPresentations (color) {
        return [new vscode.ColorPresentation('^' + colorToHex(color))]
      }
    }),
    {
      dispose: () => {
        pending.forEach(timer => { clearTimeout(timer) })
        hiddenCodeType.dispose()
        colorTypes.forEach(type => { type.dispose() })
        colorTypes.clear()
        rendered.clear()
      }
    }
  )
}
