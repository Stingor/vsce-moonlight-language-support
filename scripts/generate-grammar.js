'use strict'

// Construit syntaxes/rathena.json depuis scripts/grammar-skeleton.json et les
// sources du serveur, pour que la coloration connaisse exactement ce que le
// serveur accepte : ses commandes (BUILDIN_DEF), ses paramètres de personnage
// (export_parameter), ses constantes (export_constant) et ses cartes
// (db/map_index.txt et son import).
//
//   node scripts/generate-grammar.js --server ../moonlight
//   node scripts/generate-grammar.js --server ../moonlight --check   (échoue si la grammaire n'est plus à jour)

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const SKELETON = path.join(__dirname, 'grammar-skeleton.json')
const OUTPUT = path.join(ROOT, 'syntaxes', 'rathena.json')
const PLACEHOLDER = 'GENERATED'

// Ce que le motif des mots-clés colore déjà : les retirer des commandes évite
// qu'une même chose ait deux couleurs selon l'ordre des motifs.
const KEYWORDS = new Set(['if', 'else', 'switch', 'case', 'break', 'continue', 'default',
  'for', 'do', 'while', 'return', 'goto', 'end', 'function'])

function argument (name) {
  const at = process.argv.indexOf(name)
  return at === -1 ? undefined : process.argv[at + 1]
}

function read (file) {
  return fs.readFileSync(file, 'latin1')
}

function uniqueSorted (names) {
  return [...new Set(names)].sort()
}

function escape (name) {
  return name.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')
}

function alternation (names, flags = '') {
  return `\\b${flags}(${names.map(escape).join('|')})\\b`
}

// Les commandes de rAthena, et celles qu'un serveur personnalisé déclare dans
// src/custom/script_def.inc, que script.cpp inclut.
function commands (server) {
  const custom = path.join(server, 'src', 'custom', 'script_def.inc')
  const source = read(path.join(server, 'src', 'map', 'script.cpp')) +
    (fs.existsSync(custom) ? '\n' + read(custom) : '')
  const names = []
  for (const match of source.matchAll(/^\s*BUILDIN_DEF\(\s*(\w+)\s*,/gm)) names.push(match[1])
  for (const match of source.matchAll(/^\s*BUILDIN_DEF2\(\s*\w+\s*,\s*"(\w+)"/gm)) names.push(match[1])
  return uniqueSorted(names.filter(name => !KEYWORDS.has(name)))
}

// Sans les #define : leurs paramètres formels (« a », « b ») ne sont pas des constantes.
function constantsSource (server) {
  return read(path.join(server, 'src', 'map', 'script_constants.hpp'))
    .split('\n').filter(line => !/^\s*#\s*define\b/.test(line)).join('\n')
}

function parameters (source) {
  return uniqueSorted([...source.matchAll(/export_parameter\(\s*"(\w+)"/g)].map(m => m[1]))
}

// Les constantes en MAJUSCULES_SOULIGNÉES sont colorées par un motif général.
// Restent celles en casse mixte : par préfixe (« Job_ », « Option_ ») quand
// elles en ont un, sinon nommément.
function mixedCaseConstants (source) {
  const names = [
    ...[...source.matchAll(/export_(?:deprecated_)?constant\(\s*(\w+)\s*\)/g)].map(m => m[1]),
    ...[...source.matchAll(/export_(?:deprecated_)?constant2\(\s*"(\w+)"/g)].map(m => m[1])
  ]
  const generic = /^[A-Z][A-Z0-9]*_[A-Z0-9_]+$/
  const bonus = /^b[A-Z][A-Za-z0-9]*$/
  const prefixes = new Set()
  const loose = new Set()
  for (const name of names) {
    if (generic.test(name) || bonus.test(name)) continue
    const underscore = name.indexOf('_')
    if (underscore > 0) prefixes.add(name.slice(0, underscore))
    else loose.add(name)
  }
  const parts = []
  if (prefixes.size > 0) parts.push(`(?:${uniqueSorted(prefixes).map(escape).join('|')})_[A-Za-z0-9_]+`)
  if (loose.size > 0) parts.push(...uniqueSorted(loose).map(escape))
  return { pattern: `\\b(${parts.join('|')})\\b`, prefixes: prefixes.size, loose: loose.size }
}

function maps (server) {
  const files = [path.join(server, 'db', 'map_index.txt'), path.join(server, 'db', 'import', 'map_index.txt')]
  const names = []
  for (const file of files) {
    if (!fs.existsSync(file)) continue
    for (const line of read(file).split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed === '' || trimmed.startsWith('//')) continue
      names.push(trimmed.split(/\s+/)[0])
    }
  }
  return uniqueSorted(names)
}

function fill (node, field, value) {
  if (node[field] !== PLACEHOLDER) throw new Error(`motif sans ${PLACEHOLDER} : ${JSON.stringify(node)}`)
  node[field] = value
}

function main () {
  const server = argument('--server')
  if (server === undefined) {
    console.error('usage : node scripts/generate-grammar.js --server <dépôt du serveur> [--check]')
    process.exit(2)
  }
  const grammar = JSON.parse(fs.readFileSync(SKELETON, 'utf8'))
  const repo = grammar.repository
  const source = constantsSource(server)

  const commandNames = commands(server)
  const parameterNames = parameters(source)
  const mixed = mixedCaseConstants(source)
  const mapNames = maps(server)

  // Les commandes ne tiennent pas compte de la casse, comme le serveur.
  fill(repo.functions, 'match', alternation(commandNames, '(?i)'))
  fill(repo.parameters, 'match', alternation(parameterNames, '(?i)'))
  fill(repo.constants.patterns.find(p => p.match === PLACEHOLDER), 'match', mixed.pattern)
  fill(repo.maps, 'match', alternation(mapNames))

  const output = JSON.stringify(grammar, null, '\t') + '\n'
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : ''
    if (current !== output) {
      console.error('syntaxes/rathena.json n\'est plus à jour : relancer sans --check')
      process.exit(1)
    }
    console.log('syntaxes/rathena.json est à jour')
    return
  }
  fs.writeFileSync(OUTPUT, output)
  console.log(`${commandNames.length} commandes, ${parameterNames.length} paramètres, ` +
    `${mixed.prefixes} préfixes et ${mixed.loose} constantes en casse mixte, ${mapNames.length} cartes`)
}

main()
