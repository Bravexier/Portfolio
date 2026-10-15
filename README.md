# Portfolio — Xavier Erb

CV et portfolio en une page statique, affichable dans trois thèmes : **Pro** (classique), **Tech** (terminal) et **JDR** (fiche de personnage).
Le contenu est le même dans les trois ; seul l'habillage change.

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
ou si la page s'affiche avant la feuille de son thème. Sur une image ou un dégradé, le contraste ne se mesure pas : l'audit affiche
alors un ⚠ à vérifier à l'œil, sans échouer.

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
| `dist/assets/` | `base.css`, `app.js`, `themes/<id>.css` |

`cv.md` et `resume.json` reprennent tout le contenu de la page ; les données structurées schema.org (`Person`) embarquées dans la page
en sont un résumé. Rien n'est caché aux humains pour être servi aux machines.

## Thèmes

Le sélecteur est dans le coin haut droit : discret au repos, il s'ouvre au survol du coin à la souris, ou d'un clic, d'un appui
ou de la touche Entrée sur son bouton. Échap, un clic ailleurs ou la sortie du clavier le referment.
Le choix est mémorisé dans le navigateur, et `?theme=tech` ou `?theme=jdr` dans l'adresse force un thème (pratique pour partager un lien).

Un thème est une seule feuille de style, [static/themes/](static/themes/)`<id>.css`, chargée seule : elle n'a pas à préfixer ses sélecteurs
et ne peut pas casser les autres. [static/base.css](static/base.css) ne contient que le socle (remise à zéro, sélecteur de thème).

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
| `.entry[data-kind]` | `cdi`, `cdd`, `stage`, `formation` ; `[data-current]` sur le poste en cours ; `--i` (rang) |
| `.entry__*` | `title`, `org`, `meta` (`period`, `contract`, `place`), `summary`, `highlights`, `about` |
| `a.mention` | Organisation citée dans le texte d'un poste (client, donneur d'ordre) |
| `.tags > .tag` | Technologies |
| `.project` | `.project__name`, `__period`, `__desc`, `__highlights`, `__link` |
| `.colophon` | Pied de page |

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
static/    base.css, app.js, photo.jpg, themes/
tools/     serveur local, captures d'écran, audit navigateur, vérification des liens
test/      tests (node --test)
build.mjs  construit dist/
.github/   publication sur GitHub Pages
```
