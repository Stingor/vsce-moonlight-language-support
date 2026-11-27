'use strict'

import * as assert from 'assert'
import { scanRegions } from '../lexer'
import { blankRegions } from '../scriptChecks'
import {
  argumentContext, describeEntry, idAt, isRenewal, loadDbTable, readDbFile
} from '../idHover'

function at (text: string, marker: string): ReturnType<typeof idAt> {
  return idAt(blankRegions(text, scanRegions(text)), text.indexOf(marker) + 1)
}

// Une table d'objets minimale : en-tête, corps, imports.
function table (body: string[], imports: string[] = [], clear = false): string {
  return [
    'Header:', '  Type: ITEM_DB', '  Version: 3', ...(clear ? ['  Clear: true'] : []),
    'Body:', ...body,
    ...(imports.length > 0 ? ['Footer:', '  Imports:', ...imports] : [])
  ].join('\r\n')
}

function files (contents: Record<string, string>): (relative: string) => Promise<string | undefined> {
  return async relative => contents[relative]
}

describe('readDbFile', () => {
  it('lit Id, AegisName, Name et Level, sans les noms d\'une liste plus bas', () => {
    const file = readDbFile(table([
      '  - Id: 1002',
      '    AegisName: PORING',
      '    Name: Poring',
      '    Level: 1',
      '    Drops:',
      '      - Item: Jellopy',
      '        Name: pas-un-nom',
      '  - Id: 501',
      '    AegisName: Red_Potion',
      '    Name: "Carte #1"'
    ]))
    assert.deepEqual(file.entries, [
      { id: 1002, line: 4, aegis: 'PORING', name: 'Poring', level: 1 },
      { id: 501, line: 11, aegis: 'Red_Potion', name: 'Carte #1' }
    ])
  })

  it('lit les imports du pied, leur mode, et saute ceux en commentaire', () => {
    const file = readDbFile(table([], [
      '  # - Path: db/re/item_db.yml',
      '  - Path: db/pre-re/item_db.yml',
      '    Mode: Prerenewal',
      '  - Path: db/gen.yml',
      '    Generator: true',
      '  - Path: db/import/item_db.yml'
    ], true))
    assert.equal(file.clear, true)
    assert.deepEqual(file.imports, [
      { path: 'db/pre-re/item_db.yml', mode: 'Prerenewal', generator: false },
      { path: 'db/gen.yml', generator: true },
      { path: 'db/import/item_db.yml', generator: false }
    ])
  })
})

describe('loadDbTable', () => {
  it('charge chaque import EN ENTIER avant le suivant, comme le serveur', async () => {
    // a importe b puis c ; b importe b1. Ordre du serveur : a, b, b1, c.
    const read = files({
      a: table(['  - Id: 1', '    AegisName: A', '    Name: depuis a'], ['  - Path: b', '  - Path: c']),
      b: table([], ['  - Path: b1']),
      b1: table(['  - Id: 1', '    Name: depuis b1']),
      c: table(['  - Id: 1', '    Name: depuis c'])
    })
    const entry = (await loadDbTable('a', read, false)).get(1)
    // c, lu en dernier, gagne ; le champ qu'aucun import ne réécrit reste.
    assert.deepEqual(entry, { id: 1, aegis: 'A', name: 'depuis c', source: { path: 'c', line: 4 } })
  })

  it('suit le mode compilé, saute le générateur, et obéit à Clear', async () => {
    const read = files({
      root: table([], [
        '  - Path: re', '    Mode: Renewal',
        '  - Path: pre', '    Mode: Prerenewal',
        '  - Path: gen', '    Generator: true',
        '  - Path: reset'
      ]),
      re: table(['  - Id: 2', '    Name: renewal']),
      pre: table(['  - Id: 3', '    Name: pre-renewal']),
      gen: table(['  - Id: 4', '    Name: générateur']),
      reset: table(['  - Id: 5', '    Name: après Clear'], [], true)
    })
    const pre = await loadDbTable('root', read, false)
    assert.deepEqual([...pre.keys()], [5])
    const withoutClear = files({ ...{ root: table([], ['  - Path: re', '    Mode: Renewal', '  - Path: pre', '    Mode: Prerenewal']) }, re: table(['  - Id: 2', '    Name: r']), pre: table(['  - Id: 3', '    Name: p']) })
    assert.deepEqual([...(await loadDbTable('root', withoutClear, true)).keys()], [2])
    assert.deepEqual([...(await loadDbTable('root', withoutClear, false)).keys()], [3])
  })

  it('ne tourne pas sans fin sur un import qui se reboucle', async () => {
    const read = files({ a: table(['  - Id: 7', '    Name: x'], ['  - Path: a']) })
    assert.equal((await loadDbTable('a', read, false)).get(7)?.name, 'x')
  })
})

describe('isRenewal', () => {
  it('lit le #define RENEWAL actif, pas commenté', () => {
    assert.equal(isRenewal('// #define RENEWAL - LE SERVEUR EST PRE-RENEWAL\n#define RENEWAL_CAST'), false)
    assert.equal(isRenewal('#define RENEWAL\n'), true)
    assert.equal(isRenewal(undefined), true)
  })
})

describe('idAt', () => {
  it('nomme l\'objet d\'un getitem, pas sa quantité', () => {
    const text = '\tgetitem 501, 3;'
    assert.deepEqual(at(text, ' 501'), { kind: 'item', id: 501, start: 9, end: 12 })
    assert.equal(at(text, ' 3;'), undefined)
  })

  it('lit l\'appel parenthésé le plus proche', () => {
    const text = '\tif (countitem(909) > 10) set .@n, getitemname(512);'
    assert.equal(at(text, '(909')?.id, 909)
    assert.equal(at(text, ' 10)'), undefined)
    assert.equal(at(text, '(512')?.id, 512)
  })

  it('trouve le monstre d\'un monster, après une chaîne qui porte des virgules', () => {
    const text = '\tmonster "prontera",150,150,"Un, deux",1002,1,"Pnj::OnMort";'
    assert.deepEqual(at(text, ',1002'), { kind: 'mob', id: 1002, start: text.indexOf('1002'), end: text.indexOf('1002') + 4 })
    assert.equal(at(text, ',150,'), undefined)
  })

  it('ne lit pas un chiffre d\'un nom de variable, ni un nombre d\'une autre commande', () => {
    assert.equal(at('\tgetitem .@id2, 1;', 'd2'), undefined)
    assert.equal(at('\tset Zeny, Zeny - 501;', ' 501'), undefined)
  })

  it('ne nomme pas un nombre qui n\'est qu\'un morceau d\'expression', () => {
    assert.equal(at('\tif (countitem(.@base+1) > 0) end;', '+1'), undefined)
    assert.equal(at('\tdelitem .@liste[.@i+1], 1;', '+1'), undefined)
  })

  it('reconnaît une commande après une étiquette de cas', () => {
    assert.deepEqual(argumentContext('case 1: delitem 7420, 5;', 16), { command: 'delitem', arg: 0 })
  })
})

describe('describeEntry', () => {
  it('dit le nom, le nom Aegis et la nature, en texte simple', () => {
    assert.deepEqual(describeEntry('mob', { id: 1002, aegis: 'PORING', name: 'Poring', level: 1 }),
      { name: 'Poring', detail: ' (PORING) — monstre 1002, niveau 1' })
  })
})
