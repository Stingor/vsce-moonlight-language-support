'use strict'

import * as assert from 'assert'
import * as fs from 'fs'
import * as path from 'path'
import { FIRST_LINE_PATTERN, isRathenaHeader } from '../rathena'

describe('isRathenaHeader', () => {
  it('ne reconnaît pas un document vide', () => {
    assert.equal(isRathenaHeader(''), false)
  })

  it('reconnaît l\'en-tête long de rAthena', () => {
    assert.equal(isRathenaHeader('//===== rAthena Script ====='), true)
  })

  it('reconnaît l\'en-tête de Moonlight', () => {
    assert.equal(isRathenaHeader('//===== Moonlight-Destiny =========='), true)
  })

  it('reconnaît l\'en-tête court', () => {
    assert.equal(isRathenaHeader('//!rathena'), true)
  })

  it('ne reconnaît ni eAthena ni Hercules', () => {
    assert.equal(isRathenaHeader('//===== eAthena Script ====='), false)
    assert.equal(isRathenaHeader('//================= Hercules Script'), false)
  })

  it('porte la même expression que package.json', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'))
    assert.equal(manifest.contributes.languages[0].firstLine, FIRST_LINE_PATTERN)
  })
})
