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
  const slot = (text: string, offset: number): ReturnType<typeof idSlotAt> => {
    const { blank, regions } = parts(text)
    return idSlotAt(blank, regions, offset)
  }

  it('reconnaît la place d\'un identifiant en cours de frappe', () => {
    const text = '\tgetitem red\n'
    assert.deepEqual(slot(text, text.indexOf('red') + 3), { kind: 'item', byName: true, quoted: false, start: 9, end: 12 })
    const empty = '\tmonster "prt",1,1,"x",'
    assert.equal(slot(empty, empty.length)?.kind, 'mob')
    assert.equal(slot('\tisequipped ', 12)?.byName, false)
  })

  it('reconnaît le contenu d\'une chaîne là où un nom est accepté', () => {
    const text = '\tgetitem "red", 1;'
    assert.deepEqual(slot(text, text.indexOf('red') + 3), { kind: 'item', byName: true, quoted: true, start: 10, end: 13 })
    assert.equal(slot('\tisequipped "red");', 15), undefined)
  })

  it('ne propose rien pour une quantité ou une variable', () => {
    const text = '\tgetitem 501, 3'
    assert.equal(slot(text, text.length), undefined)
    const variable = '\tgetitem .@id'
    assert.equal(slot(variable, variable.length), undefined)
  })
})

describe('numéros de quête', () => {
  it('reconnaît les six commandes, les deux numéros de changequest, pas son personnage', () => {
    const text = '\tsetquest 12072;\n\tif (checkquest(12073,HUNTING) == 2) completequest 12074;\n' +
      '\tchangequest 12075,12076,.@cid;\n\terasequest 12077;\n\tif (isbegin_quest(12078) == 1) end;\n\tsetquest .@quete;'
    const { blank, regions } = parts(text)
    const refs = allRefs(text, blank, regions)
    assert.deepEqual(refs.map(ref => [ref.kind, ref.id ?? ref.constant]),
      [12072, 12073, 12074, 12075, 12076, 12077, 12078].map(id => ['quest', id]))
  })
})

describe('constantes en argument', () => {
  it('reconnaît getitem Red_Potion et MOB_PORING, pas un appel ni une quantité', () => {
    const text = '\tgetitem Red_Potion,1;\n\tmonster "prt",1,1,"x",MOB_PORING,1;\n\tgetitem getarg(0),Nombre;'
    const { blank, regions } = parts(text)
    assert.deepEqual(allRefs(text, blank, regions).map(ref => ref.constant ?? ref.id), ['Red_Potion', 'MOB_PORING'])
    assert.equal(refAt(text, blank, regions, text.indexOf('Potion'))?.constant, 'Red_Potion')
  })

  it('reconnaît une constante qui commence par un chiffre, pas un nombre', () => {
    const text = '\tgetitem 3D_Glasses,1;\n\tgetitem 501,1;'
    const { blank, regions } = parts(text)
    assert.deepEqual(allRefs(text, blank, regions).map(ref => ref.constant ?? ref.id), ['3D_Glasses', 501])
  })
})
