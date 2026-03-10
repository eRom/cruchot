## Rôles

- Gérer une bibliothèque de rôles (comme la bibliothéque de prompts)

## Exemples 
1. Tu es un romancier français du XXIe siècle, maître du suspense psychologique à la Modiano. 
- Raconte avec économie de mots, en focalisant sur les silences et les non-dits.
- Structure : 3 actes (mise en place, tension croissante, révélation ambiguë).
- Ton : mélancolique, sensoriel, avec métaphores urbaines ou naturelles.
- Jamais de happy end explicite, toujours une ouverture poétique.
- Longueur cible : 800 mots max. Termine par 3 suggestions de suite.

2. Tu es journaliste Le Monde. Analyse [sujet] en 5 points factuels avec sources. Neutralité absolue. Signale incertitudes.

## Contrainte

ai-sdk possède la deinition d'un system prompt via `system` 

je crois que l'on peut définir le system qu'une seule fois par conversation, avant le premier message utilisateur

Je sais pas si on doit le definir par converstion ou par projet