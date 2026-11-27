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
- Un secret enregistré en MD5 (`admin_secret_md5: yes`) ne sert pas à se présenter : le vrai est demandé au premier rechargement, par une saisie masquée, puis gardé dans le coffre de secrets de VSCode — jamais dans un fichier. Refusé par le serveur, il est oublié et redemandé ; **Oublier le secret du canal d'administration** l'efface.
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

## Identifiants d'objets, de monstres et de quêtes

Une quête se reconnaît par son numéro dans `setquest`, `completequest`, `erasequest`, `checkquest`, `isbegin_quest` et les deux premiers arguments de `changequest`. Son titre vient de `db/quest_db.yml` et de ses imports. Le survol, F12, la complétion par le titre et le signalement d'une quête inconnue fonctionnent comme pour un objet. Une quête n'a pas de constante : la complétion insère toujours son numéro.

Un objet ou un monstre se reconnaît sous quatre formes :

- un nombre, argument entier d'une commande qui le lit (`getitem 501,1`, `countitem(909)`, `monster …,1002,1`) ;
- sa constante de script, au même endroit : le serveur enregistre le nom Aegis de chaque objet (`getitem Red_Potion,1`) et `MOB_` suivi de celui de chaque monstre (`monster …,MOB_PORING,1`) ;
- un nom Aegis en chaîne, là où la commande l'accepte (`getitem "Red_Potion",1`) ;
- une balise du texte d'un dialogue, que lit le client moonclient : `^i[501]`, `<ITMR>501:nom</ITMR>`, `<ITEM>nom<INFO>501</INFO></ITEM>`, `<MOBL>1002:rang:nom</MOBL>`, `<MOBS>1002</MOBS>`, `<MOBP>1002</MOBP>`.

Sur chacune :

- **le survol** donne son nom, son nom Aegis, le niveau d'un monstre, et le fichier qui l'a défini ;
- **F12** ouvre son entrée dans le `.yml` qui l'a écrite en dernier — celui dont la valeur l'emporte, donc celui où la corriger ;
- **un identifiant absent des tables** que charge le serveur est signalé pendant la frappe (`rathena.checkScripts`) : un `getitem` ou un `monster` qui ne donnera rien.

À la place d'un identifiant, **la complétion propose les objets ou les monstres par leur nom** — `red pot` trouve Red Potion ; le nom Aegis et le nombre se cherchent aussi. Elle insère **la constante** (`Red_Potion`, `MOB_PORING`), qui documente le script d'elle-même et vaut dans toute commande (`rathena.completeIdsAs` : `constant` ou `id`). Sans constante sûre, le nom en chaîne si la commande l'accepte (`getitem "Valkyrja's_Shield"`), sinon le numéro :

- un nom que le moteur ne lit pas comme un mot : un caractère hors lettres, chiffres et `_` (`Valkyrja's_Shield` — l'apostrophe ouvre une variable d'instance), ou des chiffres seuls. Un chiffre en tête ne gêne pas : `getitem 3D_Glasses` se lit comme `getitem Moonlight_Coin` ;
- un nom qui heurte une constante déjà posée (`script_constants.hpp`, `db/const.yml`) ou un autre objet : le serveur ne l'enregistre pas, et il vaudrait l'autre.

Une constante d'objet inconnue n'est pas signalée — ce peut être une variable de personnage, qui s'écrit sans préfixe ; un `MOB_…` inconnu l'est.

Les tables sont lues comme le serveur les charge : `db/item_db.yml` et `db/mob_db.yml`, puis chaque import du `Footer` chargé en entier, ses propres imports compris, avant le suivant ; un import dont le `Mode` n'est pas celui que compile `src/config/renewal.hpp` est sauté, comme un `Generator` ; `Header: Clear` vide la table ; une entrée déjà lue n'est complétée que des champs que l'import réécrit.

## Depuis le jeu

Le client moonclient du staff ouvre les scripts dans VSCode :

- **Ouvrir la source**, dans la barre de titre du dialogue d'un PNJ ou dans ses propriétés, ouvre son script à la ligne de son en-tête ;
- **Alt+clic sur une ligne du dialogue** ouvre le script au `mes` qui l'a dite. Le client passe par l'adresse `vscode://stingor.moonlight-language-support/mes`, que l'extension reçoit dans la dernière fenêtre active : elle y cherche, dans le PNJ, la ligne dont les chaînes couvrent le plus le texte lu — codes couleur et morceaux calculés compris. Introuvable, le script s'ouvre à l'en-tête du PNJ.

La fenêtre qui reçoit l'adresse doit voir le fichier : pour la prod, celle connectée en Remote-SSH au serveur.

## Sécurité

- **L'adresse `vscode://…/mes` peut venir de n'importe où**, une page web comprise. Elle n'ouvre qu'un fichier des dossiers ouverts dans la fenêtre, sans `..`, et ne fait que le montrer : ni écriture, ni commande, ni réseau, ni renvoi vers une autre adresse.
- **Le rechargement est refusé dans un espace de travail non fiable.** `rathena.reload.host` et `rathena.reload.secret` sont des réglages de la machine : un dossier ouvert ne peut pas les poser, donc ni détourner le secret vers un autre hôte, ni le remplacer.
- **Le canal d'administration est la vraie porte** : il exécute toute commande @ au niveau 99. L'extension n'y envoie que `@reloadnpcfile` sur le chemin du fichier ouvert, refusé s'il porte un caractère de contrôle. Le canal lui-même se garde côté serveur : `admin_secret` changé, `admin_allow` restreint, port fermé au pare-feu.
- Les noms des tables s'affichent en texte échappé : un nom écrit comme un lien ou une image ne charge rien.

## Écrire

- **Signature** : pendant qu'on tape une commande, ses écritures et ses paramètres s'affichent, celui qu'on remplit en gras, avec le premier paragraphe de son explication — lus dans `doc/script_commands.txt` du serveur ouvert.
- **Survol d'une commande** : la même documentation — ses écritures et son explication — en survolant `getitem`, `mes`, `warp`… Une étiquette ou une fonction locale du même nom passe devant.
- **Complétion** :
  - en début d'instruction, les commandes, avec leur signature ;
  - après `goto` ou `callsub`, les étiquettes du PNJ ;
  - dans la chaîne d'un `callfunc`, les fonctions ; d'un `donpcevent`, `doevent`, `addtimer`, `deltimer`, ou de l'événement d'un `monster` / `areamonster`, les événements « Pnj::OnX » ; d'un `enablenpc`, `disablenpc`, `hideonnpc`…, les PNJ par leur nom unique.
- **Renommer** (`F2`) une étiquette ou une fonction locale : sa définition, ses `goto`, `callsub`, appels et `menu`, dans son PNJ seulement, sans tenir compte de la casse — comme le moteur. Une étiquette `On…` est un événement qu'un autre PNJ peut appeler par son nom : elle ne se renomme pas d'ici, et un nouveau nom ne peut pas en devenir une.

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
