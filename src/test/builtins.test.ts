'use strict'

import * as assert from 'assert'
import { parseBuiltins } from '../builtins'

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
