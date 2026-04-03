---
name: cruchot-landing-section
description: "Ajouter une section feature avec screenshot a la landing page Cruchot. Triggers: /cruchot-landing-section. Gere le placement, l'alternance des backgrounds, et la lightbox clickable."
user-invocable: true
---

# /cruchot-landing-section - Ajouter une section a la landing Cruchot

Ajoute une nouvelle section feature avec screenshot a `web-landing/index.html`.

---

## Contexte

La landing page est un fichier HTML statique unique : `web-landing/index.html`.
Deploy Vercel : https://cruchot.vercel.app

---

## Etape 1 : Rassembler les informations

Demander a Romain (ou deduire du contexte) :

1. **Nom de la feature** (label de section)
2. **Titre** (h2, peut contenir un `<br />`)
3. **Description** (1-2 phrases)
4. **Liste de points cles** (4 items avec check mark)
5. **Screenshot** (chemin dans `web-landing/screenshots/`)
6. **Position** : avant quelle section existante ?
7. **Couleur du label** : une des CSS vars (`--blue`, `--cyan`, `--emerald`, `--violet`, `--amber`, `--pink`, `--brand`)

Si un screenshot est mentionne, le lire avec Read pour verifier qu'il existe.

---

## Etape 2 : Analyser l'alternance des backgrounds

Les sections alternent entre deux fonds :
- **Default** : pas de style inline (fond `var(--bg)`)
- **Elevated** : `background: var(--bg-elevated)` + `border-top/bottom: 1px solid var(--border)`

**Regle stricte** : deux sections consecutives ne doivent JAMAIS avoir le meme fond.

### Procedure

1. Lire le fichier et lister les sections dans l'ordre avec leur fond actuel
2. Determiner le fond de la nouvelle section en fonction de ses voisines
3. Si l'insertion casse l'alternance, corriger les sections suivantes jusqu'a la fin

### Sections speciales (attention)

- `.privacy-section` : a son propre fond via CSS class — verifier dans le `<style>`
- `.cta-section` : section finale, generalement default
- `Tech Stack` : peut avoir un fond inline
- `Stats bar` : section courte, ne compte pas dans l'alternance

---

## Etape 3 : Choisir le layout

Deux layouts disponibles pour les sections feature :

### Layout standard (texte a gauche, image a droite)
```html
<div class="feature-row reveal">
```

### Layout inverse (image a gauche, texte a droite)
```html
<div class="feature-row reverse reveal">
```

Alterner avec la section precedente pour varier visuellement.

---

## Etape 4 : Inserer la section

### Template

```html
<!-- ======== Feature: {NOM} ======== -->
<section
    style="
        background: var(--bg-elevated);
        border-top: 1px solid var(--border);
        border-bottom: 1px solid var(--border);
    "
>
    <div class="section-inner">
        <div class="feature-row reverse reveal">
            <div class="feature-text">
                <div class="section-label" style="color: var(--cyan)">
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <!-- SVG icon path ici -->
                    </svg>
                    {LABEL}
                </div>
                <h2 class="section-title">
                    {TITRE LIGNE 1}<br />{TITRE LIGNE 2}
                </h2>
                <p class="section-desc">
                    {DESCRIPTION}
                </p>
                <ul class="feature-list">
                    <li>
                        <span class="check">&#10003;</span> {POINT 1}
                    </li>
                    <li>
                        <span class="check">&#10003;</span> {POINT 2}
                    </li>
                    <li>
                        <span class="check">&#10003;</span> {POINT 3}
                    </li>
                    <li>
                        <span class="check">&#10003;</span> {POINT 4}
                    </li>
                </ul>
            </div>
            <div class="feature-media">
                <img
                    src="screenshots/{FILENAME}"
                    alt="{ALT TEXT}"
                    width="1920"
                    height="1080"
                    loading="lazy"
                />
            </div>
        </div>
    </div>
</section>
```

**Si la section est en fond default**, retirer le bloc `style="..."` de la `<section>`.

### Lightbox automatique

Les images sont automatiquement cliquables grace au script en bas de page :
```js
document.querySelectorAll('img[src^="screenshots/"]').forEach(...)
```

**Condition** : le `src` DOIT commencer par `screenshots/`. Ne pas utiliser de chemin absolu ou prefixe.

### Icone SVG

Choisir une icone Lucide appropriee. Exemples courants deja utilises :
- Recherche : `<circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />`
- Settings : path complexe engrenage
- Multi-LLM : cercle + rayons
- Chat : bulle de message
- Outils : cle/wrench

---

## Etape 5 : Verifier l'alternance complete

Apres insertion, lister toutes les sections avec leur fond pour confirmer l'alternance :

```
Section          | Fond
-----------------|-----------
Multi-LLM        | default
Chat             | elevated
...              | ...
{NOUVELLE}       | {correct}
...              | ...
```

Si deux sections consecutives ont le meme fond, corriger.

---

## Etape 6 : Resume

```
Section "{NOM}" ajoutee a la landing page.
Position : avant "{SECTION SUIVANTE}"
Layout : {standard | reverse}
Fond : {default | elevated}
Screenshot : {filename}
Alternance : OK
```
