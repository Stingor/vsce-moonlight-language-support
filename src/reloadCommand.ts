'use strict'

// « RECHARGER CE SCRIPT SUR LE SERVEUR » : la commande, la connexion au canal
// d'administration, et les problèmes posés sur les lignes du fichier.
//
// ⚠ LA CONNEXION PART DE LÀ OÙ TOURNE L'EXTENSION. Sous Remote-SSH, c'est la
// machine du serveur : le canal se joint en local, et sa conf se lit dans
// l'espace de travail ouvert. Hors de là, il faut un hôte et un secret dans les
// réglages.

import * as net from 'net'
import * as path from 'path'
import * as vscode from 'vscode'
import { isRathena } from './documentCache'
import { exists, readText, serverRoot } from './serverFiles'
import {
  type AdminConf, type ChannelLine, collectProblems, loadAdminConf, readChannelLine, reloadablePath
} from './serverReload'

const ADMIN_CONF = 'conf/admin.conf'
// Le pire cas : un gros fichier de quêtes rechargé pendant que le serveur sert.
const RELOAD_TIMEOUT_MS = 20000

const output = { channel: undefined as vscode.OutputChannel | undefined }

function log (line: string): void {
  output.channel ??= vscode.window.createOutputChannel('Moonlight — serveur')
  output.channel.appendLine(line)
}

// `conf/admin.conf` et ses imports, lus comme le serveur les lit.
async function adminConf (root: vscode.Uri): Promise<AdminConf> {
  return await loadAdminConf(ADMIN_CONF, async relative => {
    const uri = vscode.Uri.joinPath(root, relative)
    return await exists(uri) ? await readText(uri) : undefined
  })
}

interface Exchange {
  lines: ChannelLine[]
  final: ChannelLine
}

// Une conversation avec le canal : chaque ligne envoyée attend sa réponse,
// `OK …` ou `ERR …` ; ce qui arrive entre-temps est gardé.
async function converse (host: string, port: number, requests: string[]): Promise<Exchange[]> {
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port })
    const exchanges: Exchange[] = []
    let current: ChannelLine[] = []
    let buffer = ''
    let next = 0
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error(`pas de réponse du serveur en ${RELOAD_TIMEOUT_MS / 1000} s`))
    }, RELOAD_TIMEOUT_MS)
    const send = (): void => {
      if (next >= requests.length) {
        clearTimeout(timer)
        socket.end('QUIT\n')
        resolve(exchanges)
        return
      }
      socket.write(requests[next++] + '\n')
    }
    socket.setEncoding('latin1')
    socket.on('connect', send)
    socket.on('data', (chunk: string) => {
      buffer += chunk
      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = readChannelLine(buffer.slice(0, newline).replace(/\r$/, ''))
        buffer = buffer.slice(newline + 1)
        newline = buffer.indexOf('\n')
        if (line.kind === 'ok' || line.kind === 'err') {
          exchanges.push({ lines: current, final: line })
          current = []
          if (line.kind === 'err') {
            clearTimeout(timer)
            socket.destroy()
            resolve(exchanges)
            return
          }
          send()
        } else {
          current.push(line)
        }
      }
    })
    socket.on('error', error => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

function toDiagnostics (doc: vscode.TextDocument, exchange: Exchange, file: string): vscode.Diagnostic[] {
  return collectProblems(exchange.lines, file).map(problem => {
    const line = Math.min(Math.max((problem.line ?? 1) - 1, 0), Math.max(doc.lineCount - 1, 0))
    const range = doc.lineAt(line).range
    const diagnostic = new vscode.Diagnostic(range, problem.message,
      problem.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning)
    diagnostic.source = 'serveur'
    return diagnostic
  })
}

// LE SECRET DU CANAL, dans cet ordre : le réglage de la machine ; celui de la
// conf, s'il est en clair ; sinon le coffre de secrets de VSCode, rempli une
// fois par une saisie masquée. ⚠ JAMAIS EN CLAIR DANS UN FICHIER quand la conf
// le garde en MD5 : c'est précisément ce qu'elle protège.
async function channelSecret (conf: AdminConf, secrets: vscode.SecretStorage, key: string): Promise<string | undefined> {
  const configured = vscode.workspace.getConfiguration('rathena.reload').get<string>('secret', '')
  if (configured !== '') return configured
  if (!conf.secretIsMd5 && conf.secret !== '') return conf.secret
  const stored = await secrets.get(key)
  if (stored !== undefined && stored !== '') return stored
  return await vscode.window.showInputBox({
    title: 'Secret du canal d\'administration du map-server',
    prompt: 'La conf ne garde que son empreinte MD5. Il sera rangé dans le coffre de secrets de VSCode, une fois accepté.',
    password: true,
    ignoreFocusOut: true
  })
}

async function reload (doc: vscode.TextDocument, collection: vscode.DiagnosticCollection,
  secrets: vscode.SecretStorage): Promise<void> {
  // 🔴 UN DOSSIER NON FIABLE NE RECHARGE RIEN : il pourrait porter une fausse
  // conf, et faire parler le canal d'administration à sa place.
  if (!vscode.workspace.isTrusted) {
    void vscode.window.showErrorMessage('Rechargement refusé : cet espace de travail n\'est pas marqué comme fiable.')
    return
  }
  const settings = vscode.workspace.getConfiguration('rathena.reload')
  const root = await serverRoot(doc.uri, ADMIN_CONF)
  if (root === undefined) {
    void vscode.window.showErrorMessage(`Aucun ${ADMIN_CONF} au-dessus de ce fichier : ce n'est pas un script du serveur ouvert.`)
    return
  }
  const file = reloadablePath(path.posix.relative(root.path, doc.uri.path))
  if (file === undefined) {
    void vscode.window.showErrorMessage('Seuls les scripts de moon/ sont chargés par le serveur.')
    return
  }
  const conf = await adminConf(root)
  if (!conf.enabled || conf.port === 0) {
    void vscode.window.showErrorMessage('Le canal d\'administration du map-server est coupé (admin_enable, admin_port).')
    return
  }
  const host = settings.get<string>('host', '127.0.0.1')
  const secretKey = secretKeyOf(host, conf.port)
  const secret = await channelSecret(conf, secrets, secretKey)
  if (secret === undefined || secret === '') return
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(secret)) {
    void vscode.window.showErrorMessage('Le secret ne peut pas porter de caractère de contrôle.')
    return
  }
  if (doc.isDirty) await doc.save()

  log(`→ ${host}:${conf.port} reloadnpcfile ${file}`)
  let exchanges: Exchange[]
  try {
    exchanges = await converse(host, conf.port, [
      `AUTH ${secret}`, 'NAME VSCode', 'LOG on', `ATCMD reloadnpcfile ${file}`
    ])
  } catch (error) {
    void vscode.window.showErrorMessage(`Canal d'administration injoignable : ${String(error)}`)
    return
  }
  const last = exchanges[exchanges.length - 1]
  for (const exchange of exchanges) {
    for (const line of exchange.lines) log(`  ${line.kind === 'console' ? `[${line.level}] ` : ''}${line.text}`)
    log(`  ${exchange.final.kind.toUpperCase()} ${exchange.final.text}`)
  }
  // Le premier échange est l'authentification : refusée, un secret gardé est faux.
  const authenticated = exchanges.length > 0 && exchanges[0].final.kind === 'ok'
  if (!authenticated) {
    await secrets.delete(secretKey)
  } else if (vscode.workspace.getConfiguration('rathena.reload').get<string>('secret', '') === '' &&
    (conf.secretIsMd5 || conf.secret === '')) {
    await secrets.store(secretKey, secret)
  }
  if (exchanges.length < 4 || last.final.kind !== 'ok') {
    collection.delete(doc.uri)
    const refused = authenticated ? '' : ' Le secret gardé est oublié : il sera redemandé.'
    void vscode.window.showErrorMessage(`Le serveur a refusé : ${last?.final.text ?? 'connexion fermée'}.${refused}`)
    return
  }
  const diagnostics = toDiagnostics(doc, last, file)
  collection.set(doc.uri, diagnostics)
  const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length
  const warnings = diagnostics.length - errors
  const failed = last.lines.some(line => line.kind === 'said' && /could not be loaded/i.test(line.text))
  if (errors > 0 || failed) {
    void vscode.window.showErrorMessage(`${file} : ${errors} erreur(s), ${warnings} avertissement(s) au rechargement.`, 'Voir les problèmes')
      .then(choice => { if (choice !== undefined) void vscode.commands.executeCommand('workbench.actions.view.problems') })
  } else {
    void vscode.window.setStatusBarMessage(`$(check) ${file} rechargé${warnings > 0 ? `, ${warnings} avertissement(s)` : ''}`, 5000)
  }
}

// Un secret par canal : l'hôte et le port le désignent.
function secretKeyOf (host: string, port: number): string {
  return `rathena.reload.secret:${host}:${port}`
}

export function registerReloadCommand (context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection('moonlight-serveur')
  const running = new Set<string>()
  const run = async (doc: vscode.TextDocument): Promise<void> => {
    const key = doc.uri.toString()
    if (running.has(key)) return
    running.add(key)
    try {
      await reload(doc, collection, context.secrets)
    } finally {
      running.delete(key)
    }
  }
  context.subscriptions.push(
    collection,
    vscode.commands.registerTextEditorCommand('rathena.reloadNpcFile', editor => { void run(editor.document) }),
    vscode.commands.registerCommand('rathena.forgetReloadSecret', async () => {
      const host = vscode.workspace.getConfiguration('rathena.reload').get<string>('host', '127.0.0.1')
      const port = await vscode.window.showInputBox({ title: 'Port du canal à oublier', value: '7799' })
      if (port === undefined) return
      await context.secrets.delete(secretKeyOf(host, Number.parseInt(port, 10)))
      void vscode.window.setStatusBarMessage('$(check) Secret du canal oublié.', 5000)
    }),
    vscode.workspace.onDidSaveTextDocument(doc => {
      if (isRathena(doc) && vscode.workspace.getConfiguration('rathena.reload').get<boolean>('onSave', false)) {
        void run(doc)
      }
    })
  )
}
