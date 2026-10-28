# Farm & vente : une page d'analyse pour faire du platine

Date : 2026-10-28. Statut : décisions prises en conversation avec le propriétaire ; relu par un builder ; en attente de validation du document.

## Intention

Le joueur se demande régulièrement « qu'est-ce que je farme pour faire du platine ? » et n'a pas de
réponse : il va fouiller warframe.market à la main. La page **Farm & vente** répond à sa place, en
croisant l'état du marché, les sources de drop et le compte du joueur.

Le principe directeur, dans les mots du propriétaire : ne pas farmer un objet à 50 p qui ne se vend
pas, mais un objet à 20 p qui se vend beaucoup, pour vendre vite. **La vitesse d'écoulement compte
autant que le prix.** Le but est l'obtention de platine au sens large : Prime, mods, arcanes,
reliques, tout ce qui se vend sur warframe.market.

## Objectifs

Trois volets sur une même page, construits ensemble :

1. **Marché** : pour chaque objet échangeable, prix, ventes sur 30 jours et variation de prix sur
   7 jours. Les sorties de Prime Access et les unvaults ressortent d'eux-mêmes dans les hausses ;
   aucune détection spéciale.
2. **Où ça tombe** : pour un objet, ses sources de drop (mission, rotation, ennemi, relique,
   bounty) et leurs taux, et le statut vaulted des reliques.
3. **Ton compte** (accès Full) : ce que le joueur peut vendre tout de suite depuis son inventaire,
   les reliques qu'il possède et ce qu'elles rapportent en moyenne à l'ouverture.

Le tout débouche sur une liste d'actions classées : **Vendre**, **Ouvrir**, **Farmer**.

## Non-objectifs (pour cette première version)

- Pas de « plat par heure ». Aucune source ne donne la durée d'une mission, et le propriétaire a
  choisi de ne pas entretenir de table de durées à la main. L'unité est le **plat attendu par run**
  (somme taux de drop × prix). On améliorera plus tard.
- Pas de prévision : on montre des variations observées, jamais un « sera en hausse ».
- Pas de note de difficulté inventée. On affiche le type de mission, la rotation et le taux ; pas
  d'étoiles « facile/difficile ».
- Pas de vente automatique. « Mettre en vente » ouvre le formulaire existant (`SellForm`), le
  joueur valide.

## Anti-objectifs (ce qui en ferait un échec même si ça marche)

- Recommander en tête un objet qui ne se vend pas. C'est exactement le problème de départ.
- Afficher un chiffre estimé comme s'il était mesuré. Principe produit « Honest state » : tout ce
  qui est une moyenne ou une estimation le dit.
- Télécharger des centaines de Mo d'historique ou bombarder l'API warframe.market.
- Toucher au jeu : lecture seule, comme le reste de l'app.

## Données

Ce qui existe déjà :

- `PriceTable` (`crates/warframe-acquisition/src/collection_prices.rs`) : prix médians issus du
  relevé quotidien relics.run, avec rang (`ranked_price_for`) et raffinement de relique, et
  `monthly_trades`, une moyenne glissante des ventes conclues sur 30 jours. C'est la mesure de
  vitesse d'écoulement.
- `RelicRewardIndex` (`relic_catalog.rs`) : récompenses de chaque relique, depuis WFCD
  `Relics.json`.
- Le catalogue warframestat `https://api.warframestat.us/items` (`catalog_cache.rs`), déjà
  téléchargé et mis en cache.
- L'inventaire en accès Full (reliques, pièces, mods, arcanes possédés) et les ordres
  warframe.market du compte lié.

Ce qui manque, et le choix retenu :

- **Variation sur 7 jours** : `PriceTable` ne garde pas les prix d'il y a une semaine. Choix
  (le mien, validé dans son principe) : comparer au relevé relics.run d'il y a 7 jours, soit un
  téléchargement de plus d'environ 4 Mo, mis en cache. Pas de série de 90 relevés. Le builder peut
  préférer conserver localement un instantané des prix par jour si c'est plus simple, tant que le
  poids reste du même ordre.
- **Courbe détaillée d'un objet** (la carte du haut, 7/30/90 j) : chargée **à la demande**, objet
  par objet, depuis les statistiques de warframe.market (API v1 `items/{slug}/statistics`, à
  vérifié : répond 200, fenêtres `48hours` et `90days` ventilées par `mod_rank` ; les vues 7, 30
  et 90 j se tirent de `90days`). Une requête par objet consulté. La limitation de débit de l'app
  vit dans `crates/warframe-acquisition/src/market.rs` (`last_request` + `sleep`) ; la courbe passe
  par elle, `crates/warframe-market` n'en a aucune.
- **Sources de drop** : champ `drops` du catalogue warframestat en cache (vérifié le 2026-10-28
  sur `catalog-generation.json`, 17 934 entrées) : 1 118 / 1 496 mods échangeables, 127 / 172
  arcanes, ~97 % des composants Prime (dont les sources sont des reliques), et 34 reliques, celles
  des tables de drop actuelles. Points connus :
  - **Unités mélangées** : pourcentages (0,01 à 100) pour mods, arcanes et reliques, fractions
    (0,00025 à 1) pour la catégorie Enemy. À normaliser à la lecture.
  - **Variantes mélangées** : les drops de `Serration` listent aussi « Spectral Serration »,
    « Sweeping Serration ». Filtrer sur `type`.
  - **Une relique est farmable** si elle a des `drops`, quel que soit son champ `vaulted` (les deux
    divergent sur 30 reliques ; les drops disent ce que le jeu donne aujourd'hui). Mon choix.
  - Un objet sans `drops` n'a pas de ligne Farmer, et sa fiche le dit.

## Classement

Une seule règle, réglable par une constante :

- **Valeur par unité** : prix médian au rang où l'objet tombe (rang 0 pour un mod ou une arcane qui
  tombe non classé).
- **Facteur d'écoulement** : `min(1, ventes_30j / SEUIL)`, avec `SEUIL` = 30 ventes par mois au
  départ (mon choix). Un objet qui se vend au moins une fois par jour garde tout son prix ; un objet
  vendu 3 fois en un mois pèse 10 % de son prix.
- **Score Vendre** : la règle déjà en place sur la Collection, `sellableValue` dans
  `app/src/collection.ts` (`prix × min(quantité, ventes_30j)`), pour qu'un objet ne vaille jamais
  deux montants différents selon la page. Le facteur d'écoulement ne s'y applique pas (il est déjà
  dans le `min`). Mon choix.
- **Score Ouvrir** (valeur attendue d'une relique) : somme sur ses 6 récompenses de
  taux(raffinement) × valeur × facteur. **Ouverture en solo**, taux affichés en jeu
  (Intact/Exceptional/Flawless/Radiant) ; l'écran dit « en solo ». Le calcul en groupe Radiant
  (meilleure de 4) viendra plus tard. Choix validé par le propriétaire.
- **Score Farmer** : pour une source, somme sur ce qui y tombe de taux × valeur × facteur, soit le
  plat attendu par run, ajusté de la vitesse de vente.
  - **Chaînage mission → relique → pièce Prime** (décision du propriétaire) : une relique qui tombe
    en mission vaut son score Ouvrir, pas son prix de vente. C'est ce qui fait apparaître les pièces
    Prime dans Farmer : « farmer Wisp Prime » remonte aux missions qui donnent ses reliques. On ne
    retient pour une relique que la plus forte de ses deux valeurs (vente ou ouverture) si le
    builder juge utile de proposer de revendre les reliques intactes ; sinon l'ouverture.
  - **Ce qui compte comme un « run »** : une rotation de mission (A, B, C) ou une étape de bounty,
    chacune prise comme une ligne, avec son libellé tel que le donne le catalogue. Pas de
    regroupement du cycle A-A-B-C d'une endless en v1. Mon choix.
  - **Drops d'ennemis** : leur taux vaut par kill, pas par run. Ils apparaissent dans le détail
    « où ça tombe » avec la mention « par kill » et **n'entrent pas** dans le classement par run.
    Mon choix.

Un objet sous le seuil n'est jamais caché : il descend dans le classement et porte l'étiquette
« Se vend lentement ».

## La page

Maquette validée : `docs/design/farm-trading-mockup.html` (ouvrir dans un navigateur ; données
inventées). Une entrée **Farm & vente** dans la barre latérale, entre Maîtrise et Récompenses.

De haut en bas :

1. **Carte Tendance** (à gauche, grande) : un carrousel des meilleures occasions du moment, un gros
   chiffre par diapositive (ex. « +22 % ») et une phrase qui dit pourquoi c'est pour ce joueur
   (« Tu as 4 Lith W5 qui le donnent »). Sélecteur de période. Les diapositives viennent des plus
   fortes hausses parmi les objets vendables vite, croisées avec le compte quand c'est possible.
2. **Carte Plat attendu par run** (à droite) : barres par activité ou source, onglets Farmer /
   Ouvrir / Vendre, un chiffre clé à gauche et une phrase d'explication. Barres colorées par vitesse
   de vente (vite / correct / lent), légende en mots.
3. **Tableau Quoi faire maintenant** : onglets Tout / Vendre / Ouvrir / Farmer. **Tout** montre
   trois blocs (Vendre, Ouvrir, Farmer), chacun trié par son propre score, parce que les unités ne
   se comparent pas (un stock, une relique, un run). Mon choix. Colonnes Action,
   Objet, Où, Plat par unité, Ventes sur 30 j, Variation sur 7 j. Un clic sur une ligne alimente la
   carte Tendance avec la courbe de cet objet (le détail de l'interaction est laissé au builder).
   Sur une ligne Vendre, une action « Mettre en vente » réutilise `SellForm` si un compte
   warframe.market est lié.

### Style

Le propriétaire a fourni deux références de tableau de bord sombre (cartes à coins plus ronds,
dégradé lumineux sur la carte de tendance, grands chiffres en graisse fine, barres colorées). Selon
lui, **le reste de l'app suit à peu près le même design**, qu'une autre session est en train de
finaliser. Donc :

- Cette page **reprend le système de design de cette autre session** (tokens, rayons, cartes,
  graphiques), elle n'invente pas ses propres règles. La maquette fixe la disposition et l'esprit,
  pas les valeurs exactes.
- **Ordre de construction** : la page se construit après le merge de ce travail de design sur
  `main`. Si le nouveau `DESIGN.md` ne couvre pas une pièce de la maquette (carte à dégradé,
  graphique en barres), le builder l'ajoute au système plutôt qu'en local à la page.
- Invariants à garder quoi qu'il arrive : icônes de devise, chiffres tabulaires, plancher de
  12 px, cible 44 px sous `pointer: coarse`, état dit en mots en plus de la couleur, platine
  réservé aux montants.

### Niveaux d'accès

- **Companion et Overlay** : Marché et Farmer fonctionnent (pas de lecture du jeu). Les volets
  Vendre et Ouvrir affichent un état vide qui dit qu'ils demandent l'accès Full, sans bouton qui
  change le niveau en douce.
- **Full** : les trois volets.

### Langue

Les textes de la page passent par les catalogues `app/src/i18n/fr.ts` et `en.ts`. Les noms d'objets
et de lieux restent en anglais, comme ailleurs.

## Laissé au builder

- Où vit le calcul (une vue dans `app-core` à côté de `CollectionView`/`MasteryChecklistView`
  semble naturel), et la forme exacte des types exposés au front.
- La bibliothèque ou le SVG maison pour les graphiques (préférer le SVG maison si les deux
  graphiques restent aussi simples que la maquette).
- Le nombre de diapositives du carrousel et la règle exacte de sélection, tant qu'elle suit
  « hausse réelle, objet qui se vend, lien avec le compte en priorité ».
- La gestion du cache et de la fraîcheur, sur le modèle de `CollectionPriceCache` et
  `freshness.ts`.

## Choix faits par Claude (à vérifier par le propriétaire)

- Variation sur 7 jours par comparaison de deux relevés, pas d'historique long.
- Score Vendre = la règle `sellableValue` existante.
- Tout en trois blocs triés séparément.
- Un run = une rotation ou une étape de bounty ; drops d'ennemis « par kill », hors classement.
- `drops` fait foi sur `vaulted` pour dire qu'une relique est farmable.
- Courbe détaillée à la demande via les statistiques warframe.market.
- `SEUIL` d'écoulement de 30 ventes par mois et formule `min(1, ventes/SEUIL)`.
- Placement dans la barre latérale entre Maîtrise et Récompenses.
- Pas de carte « Tes ordres » sur cette page : la page Ordres existe déjà.
