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
  - sur un événement (`donpcevent "Pnj::OnX"`) ;
  - sur une commande (`getmotherid`, `mes`, `close3`), jusqu'à son `BUILDIN_FUNC` dans le `src/map/script.cpp` du serveur ouvert dans l'espace de travail ; un alias mène au code qu'il nomme.

  L'index couvre les `.npc` de l'espace de travail et les `.txt` des dossiers `npc/`.
- Le double-clic sélectionne une variable entière, préfixe compris : `.@var$`, `$@var`, `##var`, `'var`.

## Recharger sur le serveur

`Ctrl+Alt+R`, le bouton ⟳ de la barre de l'éditeur ou le menu contextuel : **Recharger ce script sur le serveur**. Le fichier est enregistré, puis rechargé par le canal d'administration du map-server (`@reloadnpcfile`). Ce que la console du serveur dit du fichier pendant le rechargement — erreurs de script, avertissements — se pose sur ses lignes, dans l'onglet Problèmes ; le reste est ignoré. Le compte rendu complet est dans la sortie « Moonlight — serveur ».

- Sous Remote-SSH, l'extension tourne sur la machine du serveur : elle joint le canal en `127.0.0.1`, et lit le port et le secret dans `conf/admin.conf` et ses imports. `admin_allow` doit laisser passer `127.0.0.1`.
- Un secret enregistré en MD5 (`admin_secret_md5: yes`) ne sert pas à se présenter : le vrai se pose dans `rathena.reload.secret`.
- Seuls les scripts de `moon/` se rechargent : ce sont les seuls que le serveur charge.

| Réglage | Effet |
|---|---|
| `rathena.reload.onSave` | Recharger à chaque enregistrement |
| `rathena.reload.host` | L'hôte du canal (`127.0.0.1`) |
| `rathena.reload.secret` | Le secret, s'il ne se lit pas dans la conf |

## Vérifications pendant la frappe

Sans attendre le serveur (`rathena.checkScripts`) :

- les accolades d'un PNJ qui ne s'équilibrent pas ;
- une étiquette appelée par `goto` ou `callsub` qui n'existe pas dans le même PNJ ;
- un `case N` qu'un `switch (select("…"))` ne peut pas choisir, faute d'autant d'options.

Chaque vérification préfère se taire que se tromper : un menu composé à l'exécution n'est pas compté.

## Survol des identifiants

Survoler l'identifiant d'un objet ou d'un monstre donne son nom, son nom Aegis et, pour un monstre, son niveau — lus dans les tables que charge le serveur ouvert (`db/item_db.yml`, `db/mob_db.yml` et leurs imports actifs). Un identifiant absent de ces tables le dit. Le nombre n'est nommé que par la commande qui le lit (`getitem`, `countitem`, `delitem`, `monster`, `areamonster`…) et s'il est l'argument entier.

## Depuis le jeu

Le client moonclient du staff ouvre les scripts dans VSCode :

- **Ouvrir la source**, dans la barre de titre du dialogue d'un PNJ ou dans ses propriétés, ouvre son script à la ligne de son en-tête ;
- **Alt+clic sur une ligne du dialogue** ouvre le script au `mes` qui l'a dite. Le client passe par l'adresse `vscode://stingor.moonlight-language-support/mes`, que l'extension reçoit dans la dernière fenêtre active : elle y cherche, dans le PNJ, la ligne dont les chaînes couvrent le plus le texte lu — codes couleur et morceaux calculés compris. Introuvable, le script s'ouvre à l'en-tête du PNJ.

La fenêtre qui reçoit l'adresse doit voir le fichier : pour la prod, celle connectée en Remote-SSH au serveur.

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
