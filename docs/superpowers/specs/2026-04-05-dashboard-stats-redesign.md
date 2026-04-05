# Dashboard Statistiques — Redesign

**Goal:** Refonte complete du dashboard statistiques pour afficher tous les couts (chat + background + TTS + images), avec hierarchie visuelle, ventilation par type, tendance, et design system erom.

## Contexte

Le dashboard actuel (6 StatCards generiques + 4 charts Recharts) ne montre pas les couts background (compaction, episodes, onirique, resumes, optimizer, skills, live-memory). La table `llm_costs` vient d'etre ajoutee (S60) pour tracker ces couts. Le dashboard doit les restituer.

## Layout

Structure verticale en 3 zones :

### Zone 1 — Header
- Titre "Statistiques" a gauche
- Filtre temporel a droite : **Auj.** / 7j / 30j / 90j / Tout
  - "Auj." = `1d` (nouveau)
  - Meme composant qu'actuellement (boutons inline dans un conteneur `bg-muted/30 rounded-lg`)

### Zone 2 — KPIs (2 colonnes)

**Colonne gauche — KPIs empiles :**

1. **Card Cout total** (principale)
   - Chiffre : `text-2xl font-bold text-foreground`
   - Label : `text-xs text-muted-foreground` "Cout total"
   - Tendance : `text-xs` en emerald-500 (positif = hausse = rouge destructive, negatif = baisse = emerald) avec `+X.X% vs prec.`
   - Tendance visible uniquement si periode != "Tout" et previous > 0
   - Fond : `var(--card)`, bordure `var(--border)`

2. **2 mini cards cote a cote** (grid 2 cols)
   - Messages : count (filtre `role = 'assistant'` uniquement)
   - Conversations : count distinct

3. **Card Tokens**
   - Total consolide : "797K" en `text-lg font-bold`
   - Sous-texte : "686K in / 111K out" en `text-xs text-muted-foreground`

**Colonne droite — Ventilation des couts :**

Card unique avec :

1. **Titre** : "Ventilation" en `text-sm font-medium`

2. **Stacked bar horizontale** : segments proportionnels, h-2 rounded-full
   - Chat : `blue-500`
   - Systeme : `amber-500`
   - TTS : `cyan-500`
   - Images : `pink-500`

3. **Liste detaillee** avec dots colores (carre 8px rounded-sm) :
   - Chat — `$X.XX` (blue-500)
   - Systeme — `$X.XX` (amber-500)
     - Sous-arborescence indentee (`pl-4 border-l border-border ml-1`) :
       - Compaction — `$X.XX`
       - Episodes — `$X.XX`
       - Onirique — `$X.XX`
       - Resumes — `$X.XX`
       - Optimizer — `$X.XX`
       - Skills — `$X.XX`
       - Live Memory — `$X.XX`
     - Lignes avec montant = 0 masquees
   - TTS — `$X.XX` (cyan-500)
   - Images — `$X.XX` (pink-500)

### Zone 3 — Charts (grille 2x2)

Chaque chart dans une card `bg-card border border-border rounded-lg p-4`. Hauteur 240px.

1. **Evolution des couts** (haut gauche) — BarChart vertical
   - Barres en `var(--brand)` (bleu), `radius: [4,4,0,0]`
   - Axe X : dates MM-DD
   - Axe Y : `$X.XX`
   - Tooltip : fond `var(--card)`, bordure `var(--border)`, `text-xs`

2. **Repartition par provider** (haut droite) — PieChart donut
   - Couleurs : `PROVIDER_COLORS` existant
   - innerRadius 50, outerRadius 80
   - Legende en dessous, `text-xs`

3. **Par projet** (bas gauche) — BarChart horizontal
   - Barres colorees par `project.color`
   - Tooltip custom : cout + messages + conversations

4. **Top modeles** (bas droite) — BarChart horizontal + toggle
   - Mini toggle en haut a droite : `$` / `Msgs`
   - Meme style que le filtre temporel mais `text-[10px]` et compact
   - Etat local `useState<'cost' | 'messages'>('cost')`
   - Mode cout : `dataKey="cost"`, top 5 par cout, formatter `$X.XX`
   - Mode messages : `dataKey="messages"`, top 5 par messages
   - Barres colorees par `PROVIDER_COLORS[provider]`

## Backend — Queries

### Nouvelle : `getBackgroundCostsByType(days?)`

```sql
SELECT type, coalesce(sum(cost), 0) as totalCost, count(*) as count
FROM llm_costs
WHERE created_at >= ?
GROUP BY type
ORDER BY totalCost DESC
```

Retourne `BackgroundCostByType[]`.

### Nouvelle : `getPreviousPeriodCost(days)`

Calcule le cout total sur la periode precedente `[now - 2*days, now - days]`.

```sql
SELECT coalesce(sum(cost), 0) as totalCost
FROM messages
WHERE created_at >= ? AND created_at < ?
```

Plus une sous-requete sur `llm_costs` et `tts_usage` pour le meme intervalle.

Retourne `{ totalCost: number }`.

### Fix existant : `getDailyStats`

Ajouter `WHERE role = 'assistant'` pour etre coherent avec les autres queries (bug pre-existant).

## Backend — IPC

2 nouveaux handlers dans `statistics.ipc.ts` :

- `statistics:getBackgroundCosts` : payload `{ days?: number }` → `BackgroundCostByType[]`
- `statistics:getPreviousPeriod` : payload `{ days: number }` → `{ totalCost: number }`

Validation Zod.

## Backend — Preload

Ajouter dans `preload/index.ts` :
- `getBackgroundCosts(days?: number)`
- `getPreviousPeriodCost(days: number)`

Ajouter dans `preload/types.ts` :
```typescript
export interface BackgroundCostByType {
  type: string
  totalCost: number
  count: number
}
```

## Frontend — Store

Ajouter dans `stats.store.ts` :
- `totalBackgroundCost: number`
- `backgroundCostsByType: BackgroundCostByType[]`
- `previousPeriodCost: number | null`

Dans `loadStats()` : ajouter les 2 appels a `Promise.all` :
- `window.api.getBackgroundCosts(days)`
- `window.api.getPreviousPeriodCost(days)` (seulement si `days > 0`)

Lire `totalBackgroundCost` depuis `rawGlobal`.

## Frontend — Composants

### StatsView.tsx (rewrite complet)

Remplace l'actuel. Structure :
- Header + filtre
- Zone KPI (2 colonnes)
- Zone Charts (grille 2x2)

### StatCard.tsx (supprime ou simplifie)

L'actuel StatCard generique n'est plus utilise tel quel. Les mini cards KPI sont du JSX inline dans StatsView (plus simple, pas besoin d'abstraction pour 3 cards).

### Pas de nouveau composant

Tout dans StatsView.tsx — le fichier fait ~320 lignes actuellement, il restera sous 400 avec le nouveau layout. Pas besoin de decomposer.

## Design System erom

- Fonds : `var(--background)` page, `var(--card)` cards
- Bordures : `border border-[var(--border)]` (blanc 10%)
- Texte : `var(--foreground)` principal, `var(--muted-foreground)` secondaire
- Brand : `var(--brand)` pour les barres du chart evolution et elements interactifs
- Couleurs semantiques ventilation : blue-500 (chat), amber-500 (systeme), cyan-500 (TTS), pink-500 (images)
- Radius : `rounded-lg` cards, `rounded-md` boutons/toggles, `rounded-full` stacked bar
- Hover : `hover:shadow-md transition-all duration-200`
- Pas de gradient hero — coherence erom (borders > shadows)
- Icones : lucide-react

## Hors perimetre

- Vue par conversation individuelle (trop granulaire)
- Gemini Live session costs (API ne les expose pas)
- Export CSV des stats
- Graphe de tendance sparkline dans les KPI cards
