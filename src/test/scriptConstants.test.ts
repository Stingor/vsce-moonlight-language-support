'use strict'

import * as assert from 'assert'
import { type DbEntry } from '../idHover'
import {
  constantOf, insertionFor, readConstantTable, readHardcodedConstants, sharedAegisNames
} from '../scriptConstants'

const potion: DbEntry = { id: 501, aegis: 'Red_Potion', name: 'Red Potion' }
const glasses: DbEntry = { id: 5788, aegis: '3D_Glasses', name: '3D Glasses' }
const shield: DbEntry = { id: 2115, aegis: 'Valkyrja\'s_Shield', name: 'Valkyrja\'s Shield' }
const digits: DbEntry = { id: 9000, aegis: '2024', name: 'Année' }
const poring: DbEntry = { id: 1002, aegis: 'PORING', name: 'Poring' }
const NONE = new Set<string>()

describe('readHardcodedConstants', () => {
  it('lit les quatre écritures, et retire le préfixe d\'export_constant_npc', () => {
    const names = readHardcodedConstants([
      '\texport_constant(INT_MIN);',
      '\texport_constant2("Job_SuperNovice",JOB_SUPER_NOVICE);',
      '\texport_parameter("StatusPoint",SP_STATUSPOINT);',
      '\texport_deprecated_constant2("bc_npc",BC_NPC);',
      '\texport_constant_npc(JT_WARPNPC);'
    ].join('\n'))
    assert.deepEqual([...names].sort(), ['bc_npc', 'int_min', 'job_supernovice', 'statuspoint', 'warpnpc'])
  })

  it('lit les noms et les imports d\'une table de constantes', () => {
    const table = readConstantTable('Body:\n  - Name: Ma_Constante\n    Value: 1\nFooter:\n  Imports:\n  - Path: db/import/const.yml\n')
    assert.deepEqual(table, { names: ['ma_constante'], imports: ['db/import/const.yml'] })
  })
})

describe('constantOf', () => {
  it('donne le nom Aegis d\'un objet, chiffre en tête compris, et MOB_ et le nom d\'un monstre', () => {
    assert.equal(constantOf('item', potion, NONE, NONE), 'Red_Potion')
    // `is_number` ne prend pas « 3D_Glasses » pour un nombre : c'est un mot.
    assert.equal(constantOf('item', glasses, NONE, NONE), '3D_Glasses')
    assert.equal(constantOf('mob', poring, NONE, NONE), 'MOB_PORING')
  })

  it('n\'en donne pas à un nom hors mot, de chiffres seuls, déjà pris, ou partagé', () => {
    assert.equal(constantOf('item', shield, NONE, NONE), undefined)
    assert.equal(constantOf('item', digits, NONE, NONE), undefined)
    assert.equal(constantOf('item', potion, new Set(['red_potion']), NONE), undefined)
    assert.equal(constantOf('item', potion, NONE, sharedAegisNames([potion, { ...potion, id: 9999 }])), undefined)
  })
})

describe('insertionFor', () => {
  const free = { byName: true, quoted: false }
  it('insère la constante, sinon le nom en chaîne si la commande l\'accepte, sinon le numéro', () => {
    assert.equal(insertionFor('item', potion, free, 'constant', NONE, NONE), 'Red_Potion')
    assert.equal(insertionFor('item', glasses, free, 'constant', NONE, NONE), '3D_Glasses')
    assert.equal(insertionFor('item', shield, free, 'constant', NONE, NONE), '"Valkyrja\'s_Shield"')
    assert.equal(insertionFor('item', shield, { byName: false, quoted: false }, 'constant', NONE, NONE), '2115')
    assert.equal(insertionFor('mob', poring, { byName: false, quoted: false }, 'constant', NONE, NONE), 'MOB_PORING')
  })

  it('insère le nom seul dans une chaîne, et le numéro si le réglage le veut', () => {
    assert.equal(insertionFor('item', glasses, { byName: true, quoted: true }, 'constant', NONE, NONE), '3D_Glasses')
    assert.equal(insertionFor('item', potion, free, 'id', NONE, NONE), '501')
  })
})
