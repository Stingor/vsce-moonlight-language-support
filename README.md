# Moonlight Language Support

Coloration, extraits et navigation pour les scripts rAthena du serveur Moonlight.

## Fichiers reconnus

- Les extensions `.npc` et `.rascript`.
- Tout fichier dont la première ligne commence par `//===== rAthena Script`, `//===== Moonlight` ou `//!rathena`.

## Encodage : Windows 1252, jamais deviné

Les scripts sont en Windows-1252, avec des îlots CP949 (noms de fichiers de la GRF dans les `cutin` et `soundeffect`, noms de PNJ) que le serveur lit octet par octet. La détection automatique de VSCode ne lit que le début d'un fichier : sur un script dont le premier accent est loin, elle choisit UTF-8, et l'enregistrement remplace par « � » chaque octet qu'elle n'a pas su lire.

- Un script s'ouvre donc en **Windows 1252**, sans détection. Aucun octet n'y est indéfini : un îlot coréen s'affiche en bouillie, mais ressort intact.
- Un script reconnu par sa seule première ligne, et donc ouvert avant que son langage soit connu, est rouvert en 1252 s'il n'est pas de l'UTF-8 valide (`rathena.reopenInWindows1252`).
- Un caractère perdu (U+FFFD) est signalé comme une erreur. Un avertissement apparaît à l'ouverture d'un tel fichier, et une alerte s'il vient d'être enregistré ainsi.

## Codes couleur

- Le texte d'une chaîne prend la couleur de son code `^RRGGBB` jusqu'au code suivant ou jusqu'à la fin de la chaîne, comme en jeu.
- Les codes sont masqués, sauf dans la chaîne où se trouve le curseur.
- Un code tronqué (`^00000`, qu'en jeu le client affiche tel quel) est signalé.
- Un sélecteur de couleur s'affiche sur chaque code, et le menu contextuel entoure une sélection d'un code (`^ff0000…^000000`).

| Réglage | Effet |
|---|---|
| `rathena.renderColors` | Colorer le texte selon ses codes |
| `rathena.hideColorCodes` | Masquer les codes hors de la chaîne du curseur |
| `rathena.showColorPicker` | Proposer le sélecteur de couleur |
| `rathena.reopenInWindows1252` | Rouvrir en 1252 un script reconnu par sa première ligne |

## Navigation

- **Plan du fichier** : PNJ, fonctions, boutiques et warps, avec leurs étiquettes (`OnInit:`, `L_Menu:`) et leurs fonctions locales. Il alimente la vue Structure, le fil d'Ariane et `Ctrl+Shift+O`.
- **Aller à la définition** (`F12`) :
  - sur une étiquette (`callsub L_X`, `goto L_X`), cherchée d'abord dans le même PNJ ;
  - sur une fonction (`callfunc "F_X"`) ou un PNJ (`duplicate(Source)`, `enablenpc "Nom"`) ;
  - sur un événement (`donpcevent "Pnj::OnX"`).

  L'index couvre les `.npc` de l'espace de travail et les `.txt` des dossiers `npc/`.
- Le double-clic sélectionne une variable entière, préfixe compris : `.@var$`, `$@var`, `##var`, `'var`.

## Grammaire

`syntaxes/rathena.json` est généré depuis `scripts/grammar-skeleton.json` et les sources du serveur : les commandes déclarées par `BUILDIN_DEF`, les paramètres et constantes de `script_constants.hpp`, et les cartes de `db/map_index.txt`. Après un ajout côté serveur :

```
npm run generate
```

Le script suppose le serveur dans `../moonlight` ; sinon, `node scripts/generate-grammar.js --server <chemin>`. Avec `--check`, il échoue si la grammaire n'est plus à jour.

## Extraits

`defnpc`, `defnpcfloat`, `defwarp`, `defshop`, `deffunction`, `On:`, `if`, `for`, `while` et `do`.

## Développer

```
npm install
npm test          # compile, puis lance les essais (dont la grammaire sous le vrai moteur TextMate)
npm run lint
vsce package
```

## Licence et origine

Licence MIT. L'extension descend de [language-athena](https://github.com/JoWei/language-athena) de JoWei pour Atom, portée sous VSCode par secretdataz, puis maintenue par l'équipe rAthena.
