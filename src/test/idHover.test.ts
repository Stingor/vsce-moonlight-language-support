'use strict'

import * as assert from 'assert'
import { scanRegions } from '../lexer'
import { blankRegions } from '../scriptChecks'
import { argumentContext, describeEntry, idAt, readDbEntries, readDbImports } from '../idHover'

function at (text: string, marker: string): ReturnType<typeof idAt> {
  return idAt(blankRegions(text, scanRegions(text)), text.indexOf(marker) + 1)
}

describe('readDbEntries', () => {
  it('lit Id, AegisName, Name et Level, sans les noms d\'une liste plus bas', () => {
    const text = [
      'Body:',
      '  - Id: 1002',
      '    AegisName: PORING',
      '    Name: Poring',
      '    Level: 1',
      '    Drops:',
      '      - Item: Jellopy',
      '        Name: pas-un-nom',
      '  - Id: 501',
      '    AegisName: Red_Potion',
      '    Name: "Red Potion"'
    ].join('\r\n')
    assert.deepEqual(readDbEntries(text), [
      { id: 1002, aegis: 'PORING', name: 'Poring', level: 1 },
      { id: 501, aegis: 'Red_Potion', name: 'Red Potion' }
    ])
  })

  it('suit les imports actifs, pas ceux en commentaire', () => {
    const text = 'Footer:\n  Imports:\n  # - Path: db/re/item_db.yml\n  - Path: db/import/item_db.yml\n'
    assert.deepEqual(readDbImports(text), ['db/import/item_db.yml'])
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
  it('dit le nom, le nom Aegis et la nature', () => {
    assert.equal(describeEntry('mob', { id: 1002, aegis: 'PORING', name: 'Poring', level: 1 }),
      '**Poring** (`PORING`) — monstre 1002, niveau 1')
  })
})
