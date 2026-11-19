# Portfolio — Xavier Erb

CV et portfolio en une page statique, affichable dans cinq thèmes : **Pro** (classique), **Tech** (terminal), **JDR** (fiche de personnage),
**Manga** (planche de manga sur un ciel d'animé) et **Rétro** (page perso de l'an 2000 dans un navigateur d'époque).
Le contenu est le même dans les cinq ; seul l'habillage change.

## Démarrage

Prérequis : Node.js ≥ 22.12. Aucune dépendance à installer.

```bash
npm run dev      # http://localhost:4322, reconstruit à chaque modification
npm test         # tests unitaires
npm run build    # site statique dans dist/
npm run shots    # captures d'écran et PDF de chaque thème dans shots/
npm run audit    # vérifie chaque thème dans un vrai navigateur
npm run links    # vérifie que chaque adresse du CV répond encore (réseau requis)
```

`dist/index.html` s'ouvre aussi directement dans un navigateur, sans serveur.

`shots` et `audit` pilotent Chrome ou Edge sans fenêtre, avec un profil jetable (chemin forcé par la variable `CHROME_PATH` si besoin).
L'audit échoue si un thème masque, rogne, recouvre ou réduit à l'illisible un texte du CV, si un contraste est insuffisant sur fond uni,
si la page déborde en largeur entre 360 et 1920 px, si le sélecteur de thème est inatteignable ou change mal de feuille de style,
si la page s'affiche avant la feuille de son thème, si l'animation de construction ne démarre pas au chargement, ne finit pas
seule, laisse la page décalée ou floue, ou dessine des agents en thème Tech, ou si le décor animé ne suit pas le thème, passe devant la fiche ou capte la souris. Sur une image ou un dégradé, le contraste ne se mesure pas : l'audit affiche alors un ⚠ à vérifier à l'œil, sans échouer.
Pour tout le reste, l'audit passe l'animation (bouton « Passer ») et juge la page finie ; `shots` capture la page sans animation.

## Modifier le CV

Tout le texte est dans [content/resume.json](content/resume.json), au format [JSON Resume](https://jsonresume.org/schema) avec quelques champs en plus :

- dans `basics` : `tagline`, `highlights`, `status`, `contactUrl`, `mobility`, `location.label` ;
- sur les postes : `contract`, `keywords` ;
- sur les formations : `title` (obligatoire, c'est l'intitulé affiché), `summary`, `location` ;
- `category` sur les compétences, `certifications` sur les langues ;
- à la racine : `organisations`, la liste des clients et donneurs d'ordre (`name`, `url`) ;
- dans `meta` : `compactSkillCategories`, les catégories de compétences à passer au second plan.

Règles à connaître :

- Dates en `AAAA-MM` (ou `AAAA`). Un poste sans `endDate` est le poste en cours.
- `contract` vaut `CDI`, `CDD` ou `Stage` ; les stages sont regroupés dans leur propre bloc.
- `level` d'une compétence vaut `Débutant`, `Intermédiaire`, `Bon niveau`, `Avancé` ou `Expert`.
- Les compétences s'affichent par catégorie, dans l'ordre du fichier : la première catégorie est la plus en vue.
- Liens : `url` sur un poste ou une formation lie le nom de l'employeur ou de l'école. Une organisation de la liste `organisations`
  est liée automatiquement là où son nom apparaît dans le `summary` ou les `highlights` d'un poste (une fois par poste).
  Le build refuse une organisation qui n'est citée nulle part.
- `basics.email` est l'adresse affichée sur le bouton de contact. À défaut, le bouton pointe vers `basics.contactUrl`.
- `basics.image` est la photo, sous la forme `assets/photo.jpg` : le fichier lui-même est dans `static/`. Sans ce champ, pas de photo.
- `basics.url` : adresse publique du site une fois hébergé (balises `canonical` et Open Graph).
- Les adresses commencent par `http://` ou `https://`.

Le build refuse un contenu incomplet ou une adresse invalide, et dit quelle ligne corriger.

## Ce que produit le build

| Fichier | Rôle |
| --- | --- |
| `dist/index.html` | La page, lisible sans JavaScript (thème Pro) |
| `dist/cv.md` | Le CV complet en Markdown |
| `dist/resume.json` | Les données au format JSON Resume |
| `dist/llms.txt` | Point d'entrée pour un assistant IA ([llmstxt.org](https://llmstxt.org)) |
| `dist/assets/` | `base.css`, `app.js`, `build.js`, `ambient.js`, `themes/<id>.css`, `ambient/` (dessins du décor) |

`cv.md` et `resume.json` reprennent tout le contenu de la page ; les données structurées schema.org (`Person`) embarquées dans la page
en sont un résumé. Rien n'est caché aux humains pour être servi aux machines.

## Thèmes

Le sélecteur est dans le coin haut droit : discret au repos, il s'ouvre au survol du coin à la souris, ou d'un clic, d'un appui
ou de la touche Entrée sur son bouton. Échap, un clic ailleurs ou la sortie du clavier le referment.
Le choix est mémorisé dans le navigateur, et `?theme=tech` ou `?theme=jdr` dans l'adresse force un thème (pratique pour partager un lien).

Un thème est une seule feuille de style, [static/themes/](static/themes/)`<id>.css`, chargée seule : elle n'a pas à préfixer ses sélecteurs
et ne peut pas casser les autres. [static/base.css](static/base.css) ne contient que le socle (remise à zéro, sélecteur de thème,
animation de construction).

### Animation de construction

Au chargement et à chaque changement de thème, la fiche s'assemble calque par calque sous une barre d'état (avancement, puis
bilan avec **Rejouer**). C'est un effet, codé dans [static/build.js](static/build.js), habillé selon le thème :

- **Pro** : une nuée de curseurs (jusqu'à 24 agents) portant chacun son nom d'agent (« Instance-1 », « Designer-2 »…),
  avec quelques relecteurs en gris qui passent sans rien poser ; bilan : « Page livrée par 24 agents en 3,6 s ».
- **Tech** : personne ne construit, la page arrive comme un signal brouillé. L'écran s'allume comme un vieux moniteur, une
  neige d'image sans signal se retire à mesure que les blocs apparaissent, de haut en bas et par salves, avec leurs ratés
  (aberration chromatique, tranches décalées, coupures) ; des bandes de déchirure traversent l'écran et la page tressaute
  par instants, puis « ACCÈS AUTORISÉ » s'affiche une seconde.
- **JDR** : un grand cercle d'invocation se trace au centre ; des feux follets posent un sceau sur chaque calque, le relient
  au cercle par une ligne d'arcane, et le contenu se matérialise dans un éclat doré.
- **Manga** : la planche se fabrique sous nos yeux. Le cadre des cases se crayonne au bleu, puis chaque bloc s'encre d'un coup
  de pinceau dans le sens de lecture japonais (de droite à gauche, puis de haut en bas), ponctué d'onomatopées (ドン！,
  シャキーン…). Pour finir, des lignes de vitesse et le titre de l'épisode : « 開発者、参上！ », le développeur entre en scène.
- **Rétro** : une télé cathodique s'allume. Un point lumineux s'étire en trait et s'ouvre sur la neige d'une chaîne sans
  signal ; la télé cherche la chaîne (« RECHERCHE UHF 471,25 MHz » en vert) pendant que les blocs se posent sous la neige.
  Puis le signal s'accroche : l'image arrive floue, en gros pixels, terne et mal calée, et se précise par paliers jusqu'à
  l'image nette (filtre SVG redessiné par `build.js`, `html[data-tube]`). Lignes de balayage et bord du tube jusqu'au bout,
  puis « PR 01 CV » s'affiche une seconde.

Un habillage (`SKINS` dans `build.js`) choisit l'équipe et ses dessins, ou s'en passe avec son propre calendrier
(`schedule`, comme Tech, Manga et Rétro) ; la feuille du thème les met en forme. Un thème sans habillage reçoit les curseurs de base, et la
barre d'état reprend toujours les couleurs du sélecteur.

- Seule la partie visible de la page est animée, le reste s'affiche tout de suite. L'ensemble dure au plus 3,6 s : une grande
  page ou une grande équipe resserre tout le plan.
- **Passer**, Échap, l'impression ou un changement de largeur de la fenêtre la terminent aussitôt.
- Rien pour qui a activé « réduire les animations » dans son système, ni sans JavaScript, ni à l'impression.
- Si `build.js` n'arrive pas, la fiche s'affiche d'elle-même au bout de 3 s. Si la page cesse de dessiner des images (rendu
  sans écran, robot), elle s'affiche au bout d'une seconde. Un onglet ouvert en arrière-plan joue l'animation quand on y revient.

Un calque est le plus haut élément de la fiche qui peint du contenu : texte, image, ou petite pièce sans enfant comme une jauge.
Les cadres et les fonds (sections, cartes) restent affichés et servent d'échafaudage.

### Décor animé

Derrière la fiche, chaque thème a son décor permanent, codé dans [static/ambient.js](static/ambient.js) :

- **Pro** : halos pastel et vagues « corporate » qui glissent au pied de l'écran ; sur les côtés, le vocabulaire des fiches de
  poste (« Force de proposition », « Fit culturel 98 % », « Une équipe, une vision, un impact ») monte lentement.
- **Tech** : pluie de glyphes et grille néon ; des terminaux (déploiement, htop, hexdump, scan réseau…) et des éditeurs
  (VS Code, vim) qui tapent du code s'ouvrent, défilent et se referment.
- **JDR** : paysage au crépuscule (deux lunes, montagnes, château sur sa falaise, forêt, brume), un dragon qui traverse le ciel
  de temps en temps et, dans le coin bas gauche, un archimage plongé dans son grimoire. Les dessins sont des SVG animés,
  dans [static/ambient/](static/ambient/).
- **Manga** : grand ciel d'été d'animé, cumulus ombrés en aplats, reflets du soleil, une ville au loin, un train de banlieue
  qui passe, les poteaux électriques et leurs fils au premier plan ; des pétales de cerisier tombent dans les marges, des
  onomatopées verticales y surgissent et, dans le coin bas gauche, une mascotte en chibi code sur sa pile de mangas en
  commentant (« Compilation… ドキドキ »).
- **Rétro** : le bureau d'un PC de l'an 2000, bleu canard, avec sa barre des tâches et son horloge (l'heure réelle) et,
  là où la place le permet, ses icônes (« Poste de travail », « Corbeille », « CV_final_v3_DEFINITIF.doc »…). Dans les
  marges, des fenêtres d'époque s'ouvrent et se ferment : messagerie qui « wizze », téléchargement interminable en 56k,
  connexion par modem, chaîne de courriels de Tata Josiane, défragmentation, lecteur de musique et, parfois, le programme
  qui « a effectué une opération non conforme » et laisse sa traînée de fenêtres.

C'est de la décoration : le calque est peint sous la fiche opaque, ne capte jamais la souris, et ses éléments de côté ne
s'affichent que là où la place existe (150 px libres au moins ; l'archimage et la mascotte en demandent 220). Sur un écran où la fiche occupe
toute la largeur, il ne se voit donc presque pas : c'est le cas du thème Tech sous 1426 px. Rien à l'impression, sans
JavaScript ni avec « réduire les animations » ; les minuteurs se taisent quand l'onglet est caché.

### Ajouter un thème

1. Ajouter `{ id, label }` dans [src/themes.mjs](src/themes.mjs).
2. Créer `static/themes/<id>.css`.

### Points d'accroche du HTML

Le balisage est produit par [src/render-html.mjs](src/render-html.mjs) ; `dist/index.html` en est la référence.

| Sélecteur | Contenu |
| --- | --- |
| `main.sheet` | La fiche : `header.identity`, `#profil`, `.sheet__side`, `.sheet__main` |
| `.sheet__side` | `#competences`, `#langues` |
| `.sheet__main` | `#experiences` (dont `#stages`), `#formations`, `#projets` |
| `.identity[data-initials][data-since]` | Nom, intitulé, accroche, `.identity__status`, `dl.facts`, `.identity__links` |
| `img.identity__photo` | La photo, premier enfant de `.identity` quand `basics.image` est renseigné ; au thème de la dimensionner |
| `.fact[data-key]` | `poste`, `lieu`, `mobilite` |
| `.action[data-kind]` | `contact`, `github`, `print` |
| `.section[data-section]` | `.section__title`, `.section__body` |
| `.skill-group[data-group]` | Une catégorie de compétences ; `[data-display="compact"]` sur celles à passer au second plan |
| `.skill[data-level="1…5"]` | `--level`, `.skill__name`, `.skill__level`, `.skill__meter` (vide, décoratif) |
| `.timeline--*` | `postes`, `compact` (stages et projets, au second plan), `formations` |
| `.entry[data-kind]` | `cdi`, `cdd`, `stage`, `formation`, `projet` ; `[data-current]` sur le poste en cours ; `--i` (rang) |
| `.entry__*` | `title`, `org`, `meta` (`period`, `contract`, `place`), `summary`, `highlights`, `about` ; un projet n'a ni `org` ni contrat |
| `a.mention` | Organisation citée dans le texte d'un poste (client, donneur d'ordre) |
| `.tags > .tag` | Technologies |
| `.colophon` | Pied de page |
| `html[data-build]`, `[data-layer]` | Posés par `build.js` pendant l'animation de construction, retirés à la fin ; de même `html[data-glitch]` (Tech) et `html[data-tube]` (Rétro) |
| `.cv-build`, `.cv-build-flash` | Dessins de l'animation de construction et salut final d'un habillage, à mettre en forme par le thème |
| `.cv-ambient[data-scene]` | Décor animé du thème ; `--room-left`, `--room-right` (place libre de chaque côté de la fiche), `[data-wide]` |

Un thème recolore le sélecteur avec les variables `--switcher-bg`, `--switcher-fg`, `--switcher-border`, `--switcher-active-bg`,
`--switcher-active-fg`, `--switcher-font`, `--switcher-radius` et `--switcher-shadow`.

Chaque thème fournit ses règles `@media print` (fond blanc, pas de coupure au milieu d'un poste) : le bouton « Imprimer / PDF » sert d'export.

## Publier sur GitHub Pages

[.github/workflows/pages.yml](.github/workflows/pages.yml) lance les tests et le build à chaque pull request, et publie `dist/`
sur GitHub Pages à chaque poussée sur `main`. À faire une fois sur GitHub : *Settings → Pages → Source : GitHub Actions*.

Les liens du site sont relatifs : il fonctionne aussi bien à la racine d'un domaine que sous `https://<compte>.github.io/<dépôt>/`.
Une fois l'adresse connue, renseigne `basics.url` dans `content/resume.json` : la page gagne ses balises `canonical` et Open Graph,
et la photo devient une adresse complète pour les aperçus de lien et les données structurées.

L'audit navigateur ne tourne pas sur GitHub : sous Linux, les polices de repli changent la mise en page. Lance `npm run audit`
en local avant de fusionner une modification des thèmes.

## Structure

```
content/   resume.json, la seule source du contenu
src/       rendu : HTML, Markdown, llms.txt, données structurées, validation
static/    base.css, app.js, build.js, ambient.js, photo.jpg, themes/, ambient/ (dessins du décor)
tools/     serveur local, captures d'écran, audit navigateur, vérification des liens
test/      tests (node --test)
build.mjs  construit dist/
.github/   publication sur GitHub Pages
```
