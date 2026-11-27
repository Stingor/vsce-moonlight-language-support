'use strict'

import * as assert from 'assert'
import {
  DEFAULT_ADMIN_CONF, collectProblems, readAdminConf, readChannelLine, reloadablePath
} from '../serverReload'

const FILE = 'moon/quests/quests_19.npc'

function console (level: number, text: string): string {
  return `* ${level} ${text}`
}

describe('readAdminConf', () => {
  it('lit port, secret et imports, en ignorant les commentaires', () => {
    const conf = readAdminConf([
      'admin_enable: yes',
      'admin_port: 7799        // map-server',
      'admin_secret: s3cret',
      'admin_secret_md5: no',
      'import: conf/import/admin_conf.txt'
    ].join('\r\n'))
    assert.equal(conf.enabled, true)
    assert.equal(conf.port, 7799)
    assert.equal(conf.secret, 's3cret')
    assert.equal(conf.secretIsMd5, false)
    assert.deepEqual(conf.imports, ['conf/import/admin_conf.txt'])
  })

  it('un import gagne sur la conf qui l\'importe', () => {
    const base = readAdminConf('admin_secret: CHANGE-ME-please\nadmin_port: 7799')
    const conf = readAdminConf('admin_secret: vrai\nadmin_secret_md5: yes', base)
    assert.equal(conf.secret, 'vrai')
    assert.equal(conf.port, 7799)
    assert.equal(conf.secretIsMd5, true)
    assert.deepEqual(DEFAULT_ADMIN_CONF.imports, [])
  })
})

describe('readChannelLine', () => {
  it('distingue console, parole, réponse', () => {
    assert.deepEqual(readChannelLine('* 7 \x1b[1;37mtexte\x1b[0m'), { kind: 'console', level: 7, text: 'texte' })
    assert.deepEqual(readChannelLine(': Script loaded.'), { kind: 'said', text: 'Script loaded.' })
    assert.deepEqual(readChannelLine('OK @reloadnpcfile x'), { kind: 'ok', text: '@reloadnpcfile x' })
    assert.deepEqual(readChannelLine('ERR bad secret'), { kind: 'err', text: 'bad secret' })
  })
})

describe('collectProblems', () => {
  it('lit une erreur de script : sa ligne et son message, pas le code cité', () => {
    const lines = [
      console(7, '\x07'),
      console(7, `script error on ${FILE} line 42`),
      console(7, '    parse_line: need \';\''),
      console(7, '    41 : \tmes "a";'),
      console(7, '*   42 : \tmes "b"\'\''),
      console(7, '    43 : \tclose;')
    ].map(readChannelLine)
    assert.deepEqual(collectProblems(lines, FILE), [
      { severity: 'error', line: 42, message: 'parse_line: need \';\'' }
    ])
  })

  it('lit un avertissement qui nomme le fichier et sa ligne', () => {
    const lines = [
      console(5, `npc_parsename: Duplicate unique name in file '${FILE}', line'17'. Renaming 'A' to 'A_1'.`)
    ].map(readChannelLine)
    const problems = collectProblems(lines, FILE)
    assert.equal(problems.length, 1)
    assert.equal(problems[0].severity, 'warning')
    assert.equal(problems[0].line, 17)
  })

  it('ignore ce qui parle d\'un autre fichier ou n\'est pas une faute', () => {
    const lines = [
      console(7, 'script error on moon/autre.npc line 3'),
      console(7, '    parse_line: need \';\''),
      console(7, 'Erreur de connexion d\'un joueur'),
      console(1, `NPC file '${FILE}' was reloaded.`),
      ': Script loaded.'
    ].map(readChannelLine)
    assert.deepEqual(collectProblems(lines, FILE), [])
  })
})

describe('reloadablePath', () => {
  it('ne prend que les scripts de moon/', () => {
    assert.equal(reloadablePath('moon/a/b.npc'), 'moon/a/b.npc')
    assert.equal(reloadablePath('moon\\a\\b.npc'), 'moon/a/b.npc')
    assert.equal(reloadablePath('npc/re/x.txt'), undefined)
    assert.equal(reloadablePath('moon/../conf/x.txt'), undefined)
  })
})
