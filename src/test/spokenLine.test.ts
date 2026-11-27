'use strict'

import * as assert from 'assert'
import { findSpokenLine, normalizeSpoken, readMesQuery, readSourceAddress } from '../spokenLine'

describe('readSourceAddress', () => {
  it('lit une adresse locale et une adresse Remote-SSH', () => {
    assert.deepEqual(readSourceAddress('vscode://file/G:/GitHub/moonlight/moon/a.npc:12:1'),
      { remote: undefined, path: '/G:/GitHub/moonlight/moon/a.npc', line: 12 })
    assert.deepEqual(readSourceAddress('vscode://vscode-remote/ssh-remote+serveur.exemple/srv/moon/b%20c.npc:7:1'),
      { remote: 'ssh-remote+serveur.exemple', path: '/srv/moon/b c.npc', line: 7 })
    assert.equal(readSourceAddress('https://exemple.org/x'), undefined)
  })
})

describe('readMesQuery', () => {
  it('garde le « + » de l\'hôte et le « & » du texte d\'une requête déjà décodée', () => {
    // Ce que VSCode remet : la requête décodée, telle quelle.
    const query = 'source=vscode://vscode-remote/ssh-remote+serveur.exemple/srv/moon/a.npc:7:1&text=Pain & beurre + sel'
    assert.deepEqual(readMesQuery(query), {
      source: 'vscode://vscode-remote/ssh-remote+serveur.exemple/srv/moon/a.npc:7:1',
      text: 'Pain & beurre + sel'
    })
    assert.equal(readSourceAddress(readMesQuery(query)?.source ?? '')?.remote, 'ssh-remote+serveur.exemple')
  })

  it('décode une fois une requête restée encodée, et refuse une requête étrangère', () => {
    assert.deepEqual(readMesQuery('source=vscode%3A%2F%2Ffile%2Fx.npc%3A2%3A1&text=a%2Bb'),
      { source: 'vscode://file/x.npc:2:1', text: 'a+b' })
    assert.equal(readMesQuery('text=a&source=b'), undefined)
  })
})

describe('findSpokenLine', () => {
  const script = [
    'prontera,150,150,4\tscript\tGuide\t123,{',
    '\tmes "[Guide]";',
    '\tmes "^0000FFBienvenue^000000 à Prontera, " + strcharinfo(0) + " !";',
    '\tset .@prix, 500;',
    '\tmes "Le prix est de " + .@prix + " zénys.";',
    '\tclose;',
    '}',
    '-\tscript\tAutre\t-1,{',
    '\tmes "Bienvenue à Prontera, toi aussi !";',
    '}'
  ]

  it('retrouve un mes malgré les codes couleur et les morceaux calculés', () => {
    assert.equal(findSpokenLine(script, 0, 'Bienvenue à Prontera, Alice !'), 2)
    assert.equal(findSpokenLine(script, 0, 'Le prix est de 500 zénys.'), 4)
  })

  it('ne sort pas du PNJ de l\'en-tête', () => {
    assert.equal(findSpokenLine(script, 7, 'Bienvenue à Prontera, toi aussi !'), 8)
    assert.equal(findSpokenLine(script, 0, 'Texte que personne n\'a écrit'), undefined)
  })

  it('compare sans casse ni espaces doublés', () => {
    assert.equal(normalizeSpoken('^FF0000Un  Texte^000000 '), 'un texte')
  })
})
