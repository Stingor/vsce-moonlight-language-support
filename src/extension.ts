'use strict'

import * as vscode from 'vscode'
import { registerDocumentCache } from './documentCache'
import { registerColorDecorations } from './colorDecorations'
import { registerDiagnostics } from './diagnostics'
import { registerEncodingGuard } from './encoding'
import { registerNavigation } from './navigation'
import { registerReloadCommand } from './reloadCommand'
import { registerIdHover } from './idHoverProvider'
import { registerAssist } from './assist'
import { registerSpokenLineHandler } from './uriHandler'

const DEFAULT_WRAP_HEX = 'ff0000'
const RESET_CODE = '^000000'

function wrapWithColorCodes (editor: vscode.TextEditor): void {
  editor.edit(editBuilder => {
    for (const selection of editor.selections) {
      if (selection.isEmpty) continue
      const text = editor.document.getText(selection)
      editBuilder.replace(selection, `^${DEFAULT_WRAP_HEX}${text}${RESET_CODE}`)
    }
  })
}

export function activate (context: vscode.ExtensionContext): void {
  registerDocumentCache(context)
  registerEncodingGuard(context)
  registerDiagnostics(context)
  registerColorDecorations(context)
  const index = registerNavigation(context)
  registerReloadCommand(context)
  registerIdHover(context)
  registerAssist(context, index)
  registerSpokenLineHandler(context)
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand('rathena.wrapWithColorCodes', wrapWithColorCodes)
  )
}

export function deactivate (): void {}
