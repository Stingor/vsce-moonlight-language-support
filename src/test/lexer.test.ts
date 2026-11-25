'use strict'

import * as assert from 'assert'
import { contentOf, regionAt, scanRegions } from '../lexer'

describe('scanRegions', () => {
  it('trouve chaînes et commentaires', () => {
    const text = 'mes "a"; // b\n/* c */ mes "d";'
    const { strings, comments } = scanRegions(text)
    assert.deepEqual(strings.map(s => text.slice(s.start, s.end)), ['"a"', '"d"'])
    assert.deepEqual(comments.map(c => text.slice(c.start, c.end)), ['// b', '/* c */'])
  })

  it('ne voit pas de commentaire dans une chaîne, ni de chaîne dans un commentaire', () => {
    const text = 'mes "http://x"; // "pas une chaîne"'
    const { strings, comments } = scanRegions(text)
    assert.equal(strings.length, 1)
    assert.equal(text.slice(strings[0].start, strings[0].end), '"http://x"')
    assert.equal(comments.length, 1)
  })

  it('respecte les guillemets échappés', () => {
    const text = 'mes "il dit \\"oui\\"";'
    const { strings } = scanRegions(text)
    assert.equal(strings.length, 1)
    assert.equal(strings[0].closed, true)
    assert.equal(text.slice(strings[0].start, strings[0].end), '"il dit \\"oui\\""')
  })

  it('arrête une chaîne non fermée en fin de ligne', () => {
    const text = 'mes "oubli;\nmes "ok";'
    const { strings } = scanRegions(text)
    assert.equal(strings.length, 2)
    assert.equal(strings[0].closed, false)
    const content = contentOf(strings[0])
    assert.equal(text.slice(content.start, content.end), 'oubli;')
  })

  it('retrouve la région d\'un décalage', () => {
    const text = 'a "bc" d "ef"'
    const { strings } = scanRegions(text)
    assert.equal(regionAt(strings, 3), strings[0])
    assert.equal(regionAt(strings, 7), undefined)
    assert.equal(regionAt(strings, 10), strings[1])
  })
})
