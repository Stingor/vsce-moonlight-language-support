'use strict'

import * as assert from 'assert'
import { scanRegions } from '../lexer'
import { blankRegions } from '../scriptChecks'
import { type IdRef, allRefs, idSlotAt, refAt } from '../idRefs'

function parts (text: string): { blank: string, regions: ReturnType<typeof scanRegions> } {
  const regions = scanRegions(text)
  return { blank: blankRegions(text, regions), regions }
}

function at (text: string, marker: string): IdRef | undefined {
  const { blank, regions } = parts(text)
  return refAt(text, blank, regions, text.indexOf(marker))
}

describe('refAt', () => {
  it('lit les balises d\'objet et de monstre du texte d\'un dialogue', () => {
    const text = '\tmes "Apporte ^i[909] <ITMR>512:Pomme</ITMR> et bats <MOBL>1002:0:Poring</MOBL>.";'
    assert.deepEqual(at(text, '909'), { kind: 'item', id: 909, start: text.indexOf('909'), end: text.indexOf('909') + 3 })
    assert.equal(at(text, '512')?.id, 512)
    assert.equal(at(text, '1002')?.kind, 'mob')
    assert.equal(at(text, 'Pomme'), undefined)
  })

  it('ne prend un <INFO> pour un objet que dans un <ITEM>', () => {
    const text = '\tmes "<ITEM>Jellopy<INFO>909</INFO></ITEM> ou <URL>site<INFO>12</INFO></URL>";'
    assert.equal(at(text, '909')?.kind, 'item')
    assert.equal(at(text, '12<'), undefined)
  })

  it('lit un nom Aegis en argument d\'objet, pas une chaîne quelconque', () => {
    const text = '\tgetitem "Red_Potion", 1; mes "Red_Potion";'
    assert.deepEqual(at(text, 'Red_Potion'), { kind: 'item', aegis: 'Red_Potion', start: 10, end: 20 })
    assert.equal(at(text, 'Red_Potion";'), undefined)
  })
})

describe('allRefs', () => {
  it('rend nombres, balises et noms Aegis, dans l\'ordre du texte', () => {
    const text = '\tgetitem 501,1;\n\tmes "^i[909]";\n\tmonster "prt",1,1,"--ja--","PORING",1;'
    const { blank, regions } = parts(text)
    assert.deepEqual(allRefs(text, blank, regions).map(ref => ref.id ?? ref.aegis), [501, 909, 'PORING'])
  })
})

describe('idSlotAt', () => {
  it('reconnaît la place d\'un identifiant en cours de frappe', () => {
    const text = '\tgetitem red\n'
    assert.deepEqual(idSlotAt(parts(text).blank, text.indexOf('red') + 3), { kind: 'item', start: 9, end: 12 })
    const empty = '\tmonster "prt",1,1,"x",'
    assert.equal(idSlotAt(parts(empty).blank, empty.length)?.kind, 'mob')
  })

  it('ne propose rien pour une quantité ou une variable', () => {
    const text = '\tgetitem 501, 3'
    assert.equal(idSlotAt(parts(text).blank, text.length), undefined)
    const variable = '\tgetitem .@id'
    assert.equal(idSlotAt(parts(variable).blank, variable.length), undefined)
  })
})
