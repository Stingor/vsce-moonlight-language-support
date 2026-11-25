'use strict'

import * as assert from 'assert'
import { npcKeys, parseHeaderLine, parseScript } from '../npcSyntax'

describe('parseHeaderLine', () => {
  it('lit un PNJ, ses options et son nom', () => {
    const header = parseHeaderLine('wolfvill,140,112,5\tscript(CLOAKED)\tSuad#sms01\t4_EP18_SUAD,{', 0)
    assert.equal(header?.kind, 'script')
    assert.equal(header?.name, 'Suad#sms01')
  })

  it('lit une fonction globale', () => {
    const header = parseHeaderLine('function\tscript\tF_Moon\t{', 3)
    assert.equal(header?.kind, 'function')
    assert.equal(header?.name, 'F_Moon')
    assert.equal(header?.line, 3)
  })

  it('lit la source d\'un duplicate', () => {
    const header = parseHeaderLine('prontera,150,150,4\tduplicate(Kafra)\tKafra#prt\t4_F_KAFRA1', 0)
    assert.equal(header?.kind, 'duplicate')
    assert.equal(header?.duplicateOf, 'Kafra')
  })

  it('ignore un monstre, un commentaire et du code', () => {
    assert.equal(parseHeaderLine('prt_fild08\t0,0\tmonster\tPoring\t1002,10', 0), undefined)
    assert.equal(parseHeaderLine('//prontera,1,1,1\tscript\tX\t-1,{', 0), undefined)
    assert.equal(parseHeaderLine('\tmes "x";', 0), undefined)
  })
})

describe('npcKeys', () => {
  it('donne le nom entier, la partie unique et le nom affiché', () => {
    assert.deepEqual(npcKeys('Guide#1::Guide_prt'), ['Guide#1::Guide_prt', 'Guide_prt', 'Guide#1'])
    assert.deepEqual(npcKeys('Kafra'), ['Kafra'])
  })
})

describe('parseScript', () => {
  const text = [
    '-\tscript\tA\t-1,{',
    'OnInit:',
    '\tcallsub L_Go;',
    '\tend;',
    'L_Go:',
    '\tswitch (.@a) {',
    '\tdefault:',
    '\t}',
    '\tfunction Local {',
    '\t\treturn;',
    '\t}',
    '/*',
    'L_Commented:',
    '*/',
    '}',
    'function\tscript\tF_B\t{',
    'S_Sub:',
    '}'
  ].join('\n')
  const script = parseScript(text)

  it('trouve les en-têtes', () => {
    assert.deepEqual(script.headers.map(h => h.name), ['A', 'F_B'])
  })

  it('rattache les étiquettes à leur PNJ, sans default ni commentaire', () => {
    assert.deepEqual(script.labels.map(l => [l.name, l.owner]), [['OnInit', 0], ['L_Go', 0], ['S_Sub', 1]])
  })

  it('trouve les fonctions locales et leur colonne', () => {
    assert.equal(script.localFunctions.length, 1)
    assert.equal(script.localFunctions[0].name, 'Local')
    assert.equal(script.localFunctions[0].column, '\tfunction '.length)
  })
})
