'use strict'

import * as assert from 'assert'
import { slotAt } from '../completionSlots'
import { scanRegions } from '../lexer'
import { parseScript } from '../npcSyntax'
import { checkNewName, planRename } from '../rename'
import { blankRegions } from '../scriptChecks'
import { activeOf, parseScriptDocs } from '../scriptDocs'

function parts (text: string): { blank: string, regions: ReturnType<typeof scanRegions> } {
  const regions = scanRegions(text)
  return { blank: blankRegions(text, regions), regions }
}

describe('parseScriptDocs', () => {
  const docs = parseScriptDocs([
    '*getitem <item id>,<amount>{,<account ID>};',
    '*getitem "<item name>",<amount>{,<account ID>};',
    '',
    'This command will give an amount of specified items',
    'to the invoking character.',
    '',
    '\tgetitem 502,10',
    '---------------------------------------',
    '*select("<option>"{,"<option>",...})',
    '',
    'A handy replacement for menu.'
  ].join('\r\n'))

  it('lit chaque écriture, ses paramètres et ce qui est facultatif', () => {
    const getitem = docs.get('getitem')
    assert.ok(getitem !== undefined)
    assert.equal(getitem.signatures.length, 2)
    assert.deepEqual(getitem.signatures[0].parameters.map(p => [p.label, p.optional]),
      [['<item id>', false], ['<amount>', false], ['<account ID>', true]])
    assert.equal(getitem.summary, 'This command will give an amount of specified items to the invoking character.')
  })

  it('situe chaque paramètre dans sa signature, pour la mise en gras', () => {
    const signature = docs.get('getitem')?.signatures[0]
    const amount = signature?.parameters[1]
    assert.equal(signature?.text.slice(amount?.start, amount?.end), '<amount>')
  })

  it('reconnaît un paramètre qui se répète, et choisit le dernier au-delà', () => {
    const select = docs.get('select')
    assert.ok(select !== undefined)
    assert.equal(select.signatures[0].repeats, true)
    assert.deepEqual(activeOf(select, 5), { signature: 0, parameter: 1 })
  })
})

describe('slotAt', () => {
  const at = (text: string, marker: string, after = 0): ReturnType<typeof slotAt> => {
    const { blank, regions } = parts(text)
    return slotAt(text, blank, regions, text.indexOf(marker) + after)
  }

  it('propose les commandes en début d\'instruction, pas au milieu', () => {
    assert.equal(at('{\n\tge\n', 'ge', 2)?.kind, 'command')
    assert.equal(at('\tif (.@a) wa', 'wa', 2)?.kind, 'command')
    assert.equal(at('\tset .@a, ge', 'ge', 2), undefined)
  })

  it('propose les étiquettes après goto et callsub', () => {
    assert.equal(at('\tgoto L_', 'L_', 2)?.kind, 'label')
    assert.equal(at('\tcallsub S_', 'S_', 2)?.kind, 'label')
  })

  it('propose fonctions, événements et PNJ dans la chaîne que lit la commande', () => {
    assert.equal(at('\tcallfunc "F_"', 'F_', 2)?.kind, 'function')
    assert.equal(at('\tdonpcevent "Pnj::"', 'Pnj', 1)?.kind, 'event')
    assert.equal(at('\tenablenpc "Gar"', 'Gar', 1)?.kind, 'npc')
    assert.equal(at('\tmes "texte"', 'texte', 1), undefined)
  })
})

describe('planRename', () => {
  const HEAD = 'prontera,150,150,4\tscript\tGuide\t123,{\n'
  const plan = (text: string, marker: string): ReturnType<typeof planRename> => {
    const { blank } = parts(text)
    return planRename(text, blank, parseScript(text), text.indexOf(marker))
  }

  it('renomme définition, goto, callsub et menu, sans casse, dans le PNJ seul', () => {
    const text = HEAD + '\tgoto L_Fin;\n\tcallsub l_fin;\n\tmenu "a",L_Fin,"b",-;\nL_Fin:\n\tend;\n}\n' +
      '-\tscript\tAutre\t-1,{\nL_Fin:\n\tend;\n}\n'
    const result = plan(text, 'L_Fin;')
    assert.ok(!('error' in result))
    assert.equal(result.edits.length, 4)
    assert.ok(result.edits.every(edit => edit.start < text.indexOf('Autre')))
  })

  it('renomme une fonction locale et ses appels', () => {
    const text = HEAD + '\tF_Aide();\n\tend;\nfunction F_Aide {\n\treturn;\n}\n}\n'
    const result = plan(text, 'F_Aide();')
    assert.ok(!('error' in result))
    assert.equal(result.edits.length, 2)
  })

  it('refuse un événement, et un nouveau nom déjà pris ou en « On… »', () => {
    const text = HEAD + '\tgoto L_A;\nL_A:\nL_B:\n\tend;\nOnInit:\n\tend;\n}\n'
    assert.ok('error' in plan(text, 'OnInit'))
    const result = plan(text, 'L_A;')
    assert.ok(!('error' in result))
    const { blank } = parts(text)
    assert.notEqual(checkNewName(blank, text, parseScript(text), result, 'L_B'), undefined)
    assert.notEqual(checkNewName(blank, text, parseScript(text), result, 'OnX'), undefined)
    assert.equal(checkNewName(blank, text, parseScript(text), result, 'L_Nouveau'), undefined)
  })
})
