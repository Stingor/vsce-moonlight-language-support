'use strict'

import * as assert from 'assert'
import { collectProblems, loadAdminConf, readChannelLine, reloadablePath } from '../serverReload'

const FILE = 'moon/quests/quests_19.npc'

function console (level: number, text: string): string {
  return `* ${level} ${text}`
}

function files (contents: Record<string, string[]>): (relative: string) => Promise<string | undefined> {
  return async relative => contents[relative]?.join('\r\n')
}

describe('loadAdminConf', () => {
  it('lit port, secret et interrupteurs, en ignorant les commentaires', async () => {
    const conf = await loadAdminConf('conf/admin.conf', files({
      'conf/admin.conf': [
        '// le canal',
        'admin_enable: yes',
        'admin_port: 7799        // map-server',
        'admin_secret: s3cret',
        'admin_secret_md5: no'
      ]
    }))
    assert.deepEqual(conf, { enabled: true, port: 7799, secret: 's3cret', secretIsMd5: false })
  })

  it('lit un import à sa ligne, en profondeur, comme le serveur', async () => {
    const conf = await loadAdminConf('conf/admin.conf', files({
      'conf/admin.conf': ['admin_secret: CHANGE-ME-please', 'import: conf/import/a.txt', 'admin_port: 7000'],
      'conf/import/a.txt': ['admin_port: 6000', 'import: conf/import/b.txt'],
      'conf/import/b.txt': ['admin_secret: vrai', 'admin_secret_md5: oui']
    }))
    // Le secret de l'import du second rang gagne ; le port écrit APRÈS l'import aussi.
    assert.equal(conf.secret, 'vrai')
    assert.equal(conf.secretIsMd5, true)
    assert.equal(conf.port, 7000)
  })

  it('suit config_switch : « true » vaut faux, un nombre non nul vaut vrai', async () => {
    const read = async (value: string): Promise<boolean> =>
      (await loadAdminConf('c', files({ c: [`admin_enable: ${value}`] }))).enabled
    assert.equal(await read('true'), false)
    assert.equal(await read('1'), true)
    assert.equal(await read('off'), false)
  })

  it('ne tourne pas sans fin sur un import qui se reboucle', async () => {
    const conf = await loadAdminConf('a', files({ a: ['admin_port: 1', 'import: a'] }))
    assert.equal(conf.port, 1)
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

  it('refuse un saut de ligne, qui glisserait une seconde commande au canal', () => {
    assert.equal(reloadablePath('moon/a.npc\nATCMD shutdown'), undefined)
    assert.equal(reloadablePath('moon/a\r.npc'), undefined)
  })
})
