'use strict'

import * as assert from 'assert'
import { mergeBuiltins, parseBuiltins } from '../builtins'

describe('parseBuiltins', () => {
  const source = [
    '#define BUILDIN_FUNC(x) int32 buildin_ ## x (struct script_state* st)',
    'BUILDIN_FUNC(mes)',
    '{',
    '}',
    'BUILDIN_FUNC( camerainfo ){',
    '}',
    'BUILDIN_FUNC(close)',
    'struct script_function buildin_func[] = {',
    '\tBUILDIN_DEF(mes,"s*"),',
    '\tBUILDIN_DEF2(close, "close3", ""),',
    '\tBUILDIN_DEF2(missing, "ghost", ""),'
  ].join('\n')
  const targets = parseBuiltins(source)

  it('trouve chaque BUILDIN_FUNC, espaces compris, mais pas le #define', () => {
    assert.deepEqual(targets.get('mes'), { line: 1, column: 'BUILDIN_FUNC('.length })
    assert.deepEqual(targets.get('camerainfo'), { line: 4, column: 'BUILDIN_FUNC( '.length })
    assert.equal(targets.has('x'), false)
  })

  it('mène un alias au code de sa commande', () => {
    assert.deepEqual(targets.get('close3'), targets.get('close'))
  })

  it('ignore un alias sans code', () => {
    assert.equal(targets.has('ghost'), false)
  })
})

describe('mergeBuiltins', () => {
  it('lit les commandes personnalisées et résout un alias déclaré dans un autre fichier', () => {
    const merged = mergeBuiltins([
      { key: 'script.cpp', text: ['/*BUILDIN_FUNC(instance_create)', '{', '}*/', 'BUILDIN_FUNC(getitem)', '{', '}'].join('\n') },
      { key: 'custom/script.inc', text: ['BUILDIN_FUNC(instance_create)', '{', '}', 'BUILDIN_FUNC(restartnpc)', '{', '}'].join('\n') },
      { key: 'custom/script_def.inc', text: '\tBUILDIN_DEF2(restartnpc,"gotomain",""),' }
    ])
    // L'original mis en commentaire ne compte pas : c'est la version personnalisée.
    assert.equal(merged.get('instance_create')?.key, 'custom/script.inc')
    assert.equal(merged.get('getitem')?.key, 'script.cpp')
    assert.deepEqual(merged.get('gotomain'), merged.get('restartnpc'))
  })
})
