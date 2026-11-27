'use strict'

// L'AIDE À L'ÉCRITURE : signature de la commande en cours, complétion
// (commandes, étiquettes, fonctions, événements, PNJ) et renommage d'une
// étiquette ou d'une fonction locale.

import * as vscode from 'vscode'
import { slotAt } from './completionSlots'
import { analyze, isRathena } from './documentCache'
import { argumentContext } from './idHover'
import { type WorkspaceIndex } from './navigation'
import { checkNewName, planRename } from './rename'
import { type CommandDoc, activeOf, parseScriptDocs } from './scriptDocs'
import { blankRegions } from './scriptChecks'
import { readText, serverRoot } from './serverFiles'

const SCRIPT_DOCS = 'doc/script_commands.txt'

type Docs = Map<string, CommandDoc>

function partsOf (doc: vscode.TextDocument): { text: string, blank: string, analysis: ReturnType<typeof analyze> } {
  const analysis = analyze(doc)
  const text = doc.getText()
  return { text, blank: blankRegions(text, analysis.regions), analysis }
}

function signatureOf (command: CommandDoc): vscode.SignatureInformation[] {
  return command.signatures.map(signature => {
    const info = new vscode.SignatureInformation(signature.text, command.summary)
    info.parameters = signature.parameters.map(p => new vscode.ParameterInformation([p.start, p.end]))
    return info
  })
}

export function registerAssist (context: vscode.ExtensionContext, index: WorkspaceIndex): void {
  const cache = new Map<string, Promise<Docs>>()
  const docsFor = async (doc: vscode.TextDocument): Promise<Docs | undefined> => {
    const root = await serverRoot(doc.uri, SCRIPT_DOCS)
    if (root === undefined) return undefined
    const key = root.toString()
    let docs = cache.get(key)
    if (docs === undefined) {
      cache.set(key, docs = readText(vscode.Uri.joinPath(root, SCRIPT_DOCS)).then(parseScriptDocs, () => new Map()))
    }
    return await docs
  }
  const watcher = vscode.workspace.createFileSystemWatcher(`**/${SCRIPT_DOCS}`)
  const forget = (): void => { cache.clear() }

  context.subscriptions.push(
    watcher, watcher.onDidChange(forget), watcher.onDidCreate(forget), watcher.onDidDelete(forget),

    // ── LA SIGNATURE DE LA COMMANDE EN COURS ────────────────────────────────
    vscode.languages.registerSignatureHelpProvider({ language: 'rathena' }, {
      async provideSignatureHelp (doc, position) {
        if (!isRathena(doc)) return undefined
        const { blank, analysis } = partsOf(doc)
        const offset = doc.offsetAt(position)
        if (analysis.regions.comments.some(c => offset > c.start && offset <= c.end)) return undefined
        const call = argumentContext(blank, offset)
        if (call === undefined) return undefined
        const command = (await docsFor(doc))?.get(call.command)
        if (command === undefined) return undefined
        const help = new vscode.SignatureHelp()
        help.signatures = signatureOf(command)
        const active = activeOf(command, call.arg)
        help.activeSignature = active.signature
        help.activeParameter = active.parameter
        return help
      }
    }, ' ', ',', '('),

    // ── LA COMPLÉTION ───────────────────────────────────────────────────────
    vscode.languages.registerCompletionItemProvider({ language: 'rathena' }, {
      async provideCompletionItems (doc, position) {
        if (!isRathena(doc)) return undefined
        const { text, blank, analysis } = partsOf(doc)
        const slot = slotAt(text, blank, analysis.regions, doc.offsetAt(position))
        if (slot === undefined) return undefined
        const range = new vscode.Range(doc.positionAt(slot.start), doc.positionAt(slot.end))
        const item = (label: string, kind: vscode.CompletionItemKind, detail?: string): vscode.CompletionItem => {
          const made = new vscode.CompletionItem(label, kind)
          made.range = range
          if (detail !== undefined) made.detail = detail
          return made
        }
        switch (slot.kind) {
          case 'command': {
            const docs = await docsFor(doc)
            if (docs === undefined) return undefined
            return [...docs.values()].map(command => {
              const made = item(command.name, vscode.CompletionItemKind.Function, command.signatures[0]?.text)
              made.documentation = command.summary
              return made
            })
          }
          case 'label': {
            const script = analysis.script()
            let owner = -1
            script.headers.forEach((header, rank) => { if (header.line <= position.line) owner = rank })
            return script.labels.filter(label => label.owner === owner && !label.name.startsWith('On'))
              .map(label => item(label.name, vscode.CompletionItemKind.Reference, `étiquette, ligne ${label.line + 1}`))
          }
          case 'function':
            return (await index.names('functions')).map(name => item(name, vscode.CompletionItemKind.Function, 'fonction'))
          case 'event':
            return (await index.names('events')).map(name => item(name, vscode.CompletionItemKind.Event, 'événement'))
          case 'npc':
            return (await index.names('npcNames')).map(name => item(name, vscode.CompletionItemKind.Class, 'PNJ'))
        }
        return undefined
      }
    }, '"', ' '),

    // ── LE RENOMMAGE D'UNE ÉTIQUETTE OU D'UNE FONCTION LOCALE ───────────────
    vscode.languages.registerRenameProvider({ language: 'rathena' }, {
      prepareRename (doc, position) {
        const { text, blank, analysis } = partsOf(doc)
        const plan = planRename(text, blank, analysis.script(), doc.offsetAt(position))
        if ('error' in plan) throw new Error(plan.error)
        return new vscode.Range(doc.positionAt(plan.at.start), doc.positionAt(plan.at.end))
      },
      provideRenameEdits (doc, position, newName) {
        const { text, blank, analysis } = partsOf(doc)
        const script = analysis.script()
        const plan = planRename(text, blank, script, doc.offsetAt(position))
        if ('error' in plan) throw new Error(plan.error)
        const refused = checkNewName(blank, text, script, plan, newName)
        if (refused !== undefined) throw new Error(refused)
        const edit = new vscode.WorkspaceEdit()
        for (const region of plan.edits) {
          edit.replace(doc.uri, new vscode.Range(doc.positionAt(region.start), doc.positionAt(region.end)), newName)
        }
        return edit
      }
    })
  )
}
