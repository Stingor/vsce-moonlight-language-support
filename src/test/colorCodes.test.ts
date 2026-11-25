'use strict'

import * as assert from 'assert'
import { analyzeColors } from '../colorCodes'
import { scanRegions } from '../lexer'

function analyze (text: string): ReturnType<typeof analyzeColors> {
  return analyzeColors(text, scanRegions(text).strings)
}

describe('analyzeColors', () => {
  it('colore jusqu\'au code de retour', () => {
    const text = 'mes "^FF0000rouge^000000 normal";'
    const { spans, codes } = analyze(text)
    assert.deepEqual(spans.map(s => [text.slice(s.start, s.end), s.hex]), [['rouge', 'ff0000']])
    assert.equal(codes.length, 2)
    assert.equal(codes[1].closesColor, true)
  })

  it('arrête une couleur à la fin de sa chaîne', () => {
    const text = 'mes "^0000ffbleu";\nset .@a, 1;\nmes "suite";'
    const { spans } = analyze(text)
    assert.deepEqual(spans.map(s => text.slice(s.start, s.end)), ['bleu'])
  })

  it('ignore un code hors chaîne', () => {
    assert.equal(analyze('.@a = .@b ^ 0x00ff00;').codes.length, 0)
  })

  it('signale un code tronqué, pas un code complet', () => {
    const text = 'mes "^e5555eVillage^00000.";'
    const { malformed, codes } = analyze(text)
    assert.deepEqual(malformed.map(m => text.slice(m.start, m.end)), ['^00000'])
    assert.equal(codes.length, 1)
  })

  it('ne signale ni un « ^ » sans chiffre, ni un mot, ni une expression', () => {
    assert.equal(analyze('mes "^_^";').malformed.length, 0)
    assert.equal(analyze('mes "^empty";').malformed.length, 0)
    assert.equal(analyze('preg_match("^aeiouy]", .@s$);').malformed.length, 0)
  })
})
