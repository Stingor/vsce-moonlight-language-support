'use strict'

import * as assert from 'assert'
import { scanRegions } from '../lexer'
import { parseScript } from '../npcSyntax'
import { type CheckProblem, checkScript } from '../scriptChecks'

function check (text: string): CheckProblem[] {
  return checkScript(text, scanRegions(text), parseScript(text))
}

function quoted (text: string, problem: CheckProblem): string {
  return text.slice(problem.start, problem.end)
}

const HEAD = 'prontera,150,150,4\tscript\tGuide\t123,{\n'

describe('checkScript — accolades', () => {
  it('se tait sur un PNJ équilibré, accolades des chaînes et commentaires comprises', () => {
    const text = HEAD + '\tif (.@a) { mes "{"; } // }\n\tclose;\n}\n'
    assert.deepEqual(check(text), [])
  })

  it('signale une accolade fermante en trop', () => {
    const text = HEAD + '\tclose;\n}\n}\n'
    const problems = check(text)
    assert.equal(problems.length, 1)
    assert.equal(problems[0].severity, 'error')
    assert.match(problems[0].message, /sans accolade ouvrante/)
  })

  it('compte les accolades manquantes par PNJ, sans déborder sur le suivant', () => {
    const text = HEAD + '\tif (.@a) {\n\tclose;\n}\n' +
      '-\tscript\tAutre\t-1,{\n\tend;\n}\n'
    const problems = check(text)
    assert.equal(problems.length, 1)
    assert.match(problems[0].message, /Il manque 1 accolade/)
    assert.ok(problems[0].start < text.indexOf('Autre'))
  })

  it('ignore les boutiques et les duplicates', () => {
    assert.deepEqual(check('prontera,1,1,4\tshop\tVendeur\t83,501:-1\n' +
      'prontera,2,2,4\tduplicate(Guide)\tGuide#2\t123\n'), [])
  })
})

describe('checkScript — étiquettes', () => {
  it('trouve l\'étiquette dans le même PNJ, même suivie de code', () => {
    const text = HEAD + '\tgoto L_Fin;\n\tcallsub S_Aide;\nL_Fin: close;\nS_Aide:\n\treturn;\n}\n'
    assert.deepEqual(check(text), [])
  })

  it('trouve l\'étiquette sans tenir compte de la casse, comme le moteur', () => {
    assert.deepEqual(check(HEAD + '\tcallsub S_Warpchar,"prontera";\nS_WarpChar:\n\tend;\n}\n'), [])
  })

  it('signale une étiquette d\'un autre PNJ, ou absente', () => {
    const text = HEAD + '\tgoto L_Ailleurs;\n}\n' + '-\tscript\tAutre\t-1,{\nL_Ailleurs:\n\tend;\n}\n'
    const problems = check(text)
    assert.equal(problems.length, 1)
    assert.equal(quoted(text, problems[0]), 'L_Ailleurs')
  })

  it('ne lit pas un goto écrit dans une chaîne ou un commentaire', () => {
    assert.deepEqual(check(HEAD + '\tmes "goto L_X";\n\t// callsub L_Y;\n\tclose;\n}\n'), [])
  })
})

describe('checkScript — menus', () => {
  it('signale un case qu\'un menu ne peut pas choisir', () => {
    const text = HEAD + '\tswitch (select("Oui:Non")) {\n\tcase 1: close;\n\tcase 3: end;\n\t}\n}\n'
    const problems = check(text)
    assert.equal(problems.length, 1)
    assert.equal(quoted(text, problems[0]), 'case 3:')
  })

  it('compte les options de plusieurs chaînes, et ignore un switch imbriqué', () => {
    const text = HEAD + '\tswitch (select("A:B", "C")) {\n\tcase 3:\n' +
      '\t\tswitch (.@x) { case 9: break; }\n\t\tclose;\n\t}\n}\n'
    assert.deepEqual(check(text), [])
  })

  it('se tait quand le menu se compose à l\'exécution', () => {
    assert.deepEqual(check(HEAD + '\tswitch (select(.@menu$)) {\n\tcase 7: close;\n\t}\n}\n'), [])
  })
})
