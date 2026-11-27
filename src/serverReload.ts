'use strict'

// RECHARGER UN SCRIPT SUR LE SERVEUR : ce qui se lit et se décide sans VSCode
// ni réseau, donc s'éprouve seul.
//
// Le rechargement passe par le canal d'administration du map-server : une
// connexion TCP qui parle par lignes. `AUTH <secret>`, `LOG on` pour recevoir
// la console, puis `ATCMD reloadnpcfile <chemin>`. Le serveur n'a qu'un fil :
// tout ce que la console écrit pendant la commande arrive avant sa réponse
// (`OK …` ou `ERR …`), en lignes `* <niveau> <texte>`. Ce que la commande dit
// au joueur arrive en lignes `: <texte>`.

// Les niveaux de la console du serveur (`enum msg_type` de showmsg.hpp).
export const MSG_SQL = 2
export const MSG_WARNING = 5
export const MSG_ERROR = 7
export const MSG_FATALERROR = 8

export interface AdminConf {
  enabled: boolean
  port: number
  secret: string
  // Le secret de la conf est alors une empreinte MD5 : il ne sert pas à se
  // présenter, et il faut le vrai dans les réglages.
  secretIsMd5: boolean
  imports: string[]
}

export const DEFAULT_ADMIN_CONF: AdminConf = {
  enabled: true,
  port: 7799,
  secret: '',
  secretIsMd5: false,
  imports: []
}

// Lit un fichier de conf rAthena (`clé: valeur`, commentaires `//`) par-dessus
// `base` : une conf importée gagne sur celle qui l'importe.
export function readAdminConf (text: string, base: AdminConf = DEFAULT_ADMIN_CONF): AdminConf {
  const conf: AdminConf = { ...base, imports: [] }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, '').trim()
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    const key = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()
    switch (key) {
      case 'admin_enable': conf.enabled = /^(yes|on|true|1)$/i.test(value); break
      case 'admin_port': conf.port = Number.parseInt(value, 10); break
      case 'admin_secret': conf.secret = value; break
      case 'admin_secret_md5': conf.secretIsMd5 = /^(yes|on|true|1)$/i.test(value); break
      case 'import': conf.imports.push(value); break
    }
  }
  return conf
}

export type ChannelLine =
  | { kind: 'console', level: number, text: string }
  | { kind: 'said', text: string }
  | { kind: 'ok', text: string }
  | { kind: 'err', text: string }
  | { kind: 'other', text: string }

export function readChannelLine (line: string): ChannelLine {
  const record = /^\* (\d+) (.*)$/.exec(line)
  if (record !== null) return { kind: 'console', level: Number(record[1]), text: cleanConsole(record[2]) }
  if (line.startsWith(': ')) return { kind: 'said', text: line.slice(2) }
  if (line === 'OK' || line.startsWith('OK ')) return { kind: 'ok', text: line.slice(3) }
  if (line === 'ERR' || line.startsWith('ERR ')) return { kind: 'err', text: line.slice(4) }
  return { kind: 'other', text: line }
}

// Les couleurs de la console et la sonnerie d'une erreur de script.
export function cleanConsole (text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x07/g, '')
}

export interface ReloadProblem {
  severity: 'error' | 'warning'
  // À partir de 1. Absente : le serveur n'a pas dit où.
  line?: number
  message: string
}

const SCRIPT_REPORT = /^script (error|warning) on (.+?) line (\d+)\s*$/
// Une ligne de code citée sous une erreur de script : « *   12 : … » ou « ␣   12 : … ».
const QUOTED_CODE = /^[* ]\s*\d+ : /
const LINE_MENTION = /line\s*'?(\d+)'?/

function severityOf (level: number): 'error' | 'warning' | undefined {
  if (level === MSG_WARNING) return 'warning'
  if (level === MSG_ERROR || level === MSG_FATALERROR || level === MSG_SQL) return 'error'
  return undefined
}

// LES PROBLÈMES QUE LA CONSOLE A DITS SUR `file`, pendant le rechargement.
//
// ⚠ ON NE GARDE QUE CE QUI NOMME LE FICHIER : entre l'abonnement à la console
// et la commande, le serveur a pu écrire pour tout autre chose — un joueur, un
// autre script —, et ce bruit-là n'a rien à faire dans les problèmes du fichier.
export function collectProblems (lines: ChannelLine[], file: string): ReloadProblem[] {
  const problems: ReloadProblem[] = []
  const target = file.toLowerCase()
  let open: ReloadProblem | undefined
  for (const line of lines) {
    if (line.kind !== 'console') continue
    const text = line.text
    const report = SCRIPT_REPORT.exec(text)
    if (report !== null) {
      open = undefined
      if (report[2].toLowerCase() !== target) continue
      open = { severity: report[1] === 'error' ? 'error' : 'warning', line: Number(report[3]), message: '' }
      problems.push(open)
      continue
    }
    if (open !== undefined) {
      // Le message suit l'en-tête, indenté ; puis viennent les lignes citées.
      if (QUOTED_CODE.test(text)) continue
      if (open.message === '' && text.startsWith('    ')) {
        open.message = text.trim()
        continue
      }
      open = undefined
    }
    const severity = severityOf(line.level)
    if (severity === undefined || !text.toLowerCase().includes(target)) continue
    const mention = LINE_MENTION.exec(text)
    problems.push({
      severity,
      line: mention !== null ? Number(mention[1]) : undefined,
      message: text.trim()
    })
  }
  for (const problem of problems) {
    if (problem.message === '') problem.message = `Erreur de script (${problem.severity})`
  }
  return problems
}

// Le chemin que la commande attend : relatif à la racine du serveur, en `/`.
// ⚠ `@reloadnpcfile` préfixe `moon/` à ce qui n'y est pas : seul ce dossier est
// chargé par le serveur, et un autre chemin y deviendrait faux.
export function reloadablePath (relative: string): string | undefined {
  const path = relative.replace(/\\/g, '/').replace(/^\.\//, '')
  if (!path.startsWith('moon/') || path.split('/').includes('..')) return undefined
  return path
}
