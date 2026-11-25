'use strict'

// La grammaire passée au moteur TextMate de VSCode (Oniguruma) : une
// expression que JavaScript accepte peut y échouer, et l'ordre des motifs
// décide de la couleur.

import * as assert from 'assert'
import * as fs from 'fs'
import * as path from 'path'
import * as oniguruma from 'vscode-oniguruma'
import * as textmate from 'vscode-textmate'

const ROOT = path.join(__dirname, '..', '..')
const GRAMMAR_PATH = path.join(ROOT, 'syntaxes', 'rathena.json')

let grammar: textmate.IGrammar

before(async () => {
  const wasm = fs.readFileSync(path.join(ROOT, 'node_modules', 'vscode-oniguruma', 'release', 'onig.wasm'))
  await oniguruma.loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength))
  const registry = new textmate.Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (sources: string[]) => new oniguruma.OnigScanner(sources),
      createOnigString: (text: string) => new oniguruma.OnigString(text)
    }),
    loadGrammar: async () => textmate.parseRawGrammar(fs.readFileSync(GRAMMAR_PATH, 'utf8'), GRAMMAR_PATH)
  })
  const loaded = await registry.loadGrammar('source.rathena')
  if (loaded === null) throw new Error('grammaire introuvable')
  grammar = loaded
})

// Le scope le plus précis de chaque morceau de la ligne.
function tokens (line: string): Array<[string, string]> {
  const result = grammar.tokenizeLine(line, textmate.INITIAL)
  return result.tokens.map(token => [
    line.slice(token.startIndex, token.endIndex),
    token.scopes[token.scopes.length - 1]
  ])
}

function scopeOf (line: string, text: string): string | undefined {
  return tokens(line).find(([piece]) => piece === text)?.[1]
}

describe('grammaire', () => {
  it('colore le type et le nom d\'un PNJ, option comprise', () => {
    const line = 'wolfvill,140,112,5\tscript(CLOAKED)\tSuad#sms01\t4_EP18_SUAD,{'
    assert.equal(scopeOf(line, 'script'), 'entity.name.type.script.rathena')
    assert.equal(scopeOf(line, 'CLOAKED'), 'storage.modifier.rathena')
    assert.equal(scopeOf(line, 'Suad#sms01'), 'entity.name.function.npc.rathena')
    assert.equal(scopeOf(line, 'wolfvill'), 'constant.language.maps.rathena')
  })

  it('colore un duplicate et sa source', () => {
    const line = 'prontera,150,150,4\tduplicate(Kafra)\tKafra#prt\t4_F_KAFRA1'
    assert.equal(scopeOf(line, 'duplicate'), 'entity.name.type.script.rathena')
    assert.equal(scopeOf(line, 'Kafra'), 'storage.modifier.rathena')
  })

  it('colore toutes les étiquettes, pas default', () => {
    assert.equal(scopeOf('L_Menu:', 'L_Menu'), 'entity.name.label.rathena')
    assert.equal(scopeOf('OnInit:', 'OnInit'), 'entity.name.label.rathena')
    assert.notEqual(scopeOf('\tdefault:', 'default'), 'entity.name.label.rathena')
  })

  it('ne colore pas un chiffre au milieu d\'un identifiant', () => {
    assert.equal(tokens('\tcallfunc "F_Foo2";').some(([, scope]) => scope === 'constant.numeric.rathena'), false)
    assert.equal(scopeOf('\t.@a = 42;', '42'), 'constant.numeric.rathena')
  })

  it('reconnaît les commandes du serveur, sans tenir compte de la casse', () => {
    assert.equal(scopeOf('\tvoicegrant;', 'voicegrant'), 'support.function.rathena')
    assert.equal(scopeOf('\tMes "x";', 'Mes'), 'support.function.rathena')
  })

  it('reconnaît variables, constantes et paramètres', () => {
    const line = '\tset .@count$, Zeny + EQI_HEAD_TOP + bStr + Job_Novice;'
    assert.equal(scopeOf(line, '.@count$'), 'variable.other.scope.rathena')
    assert.equal(scopeOf(line, 'Zeny'), 'variable.language.parameter.rathena')
    assert.equal(scopeOf(line, 'EQI_HEAD_TOP'), 'constant.language.rathena')
    assert.equal(scopeOf(line, 'bStr'), 'constant.language.bonus.rathena')
    assert.equal(scopeOf(line, 'Job_Novice'), 'constant.language.rathena')
  })

  it('garde une chaîne et un commentaire entiers', () => {
    assert.equal(scopeOf('\tmes "if prontera 12";', '"if prontera 12"'), 'string.quoted.double.rathena')
    assert.equal(scopeOf('\tend; // mes "x" 12', '// mes "x" 12'), 'comment.line.double-slash.rathena')
  })
})
