# Visuels du simulateur OZENO

Refonte du 7 octobre 2026, d’après les maquettes fournies par l’utilisateur.
Les illustrations ont été recréées avec l’outil imagegen intégré, avec fond transparent.
Ce sont des illustrations de présentation, jamais des données de projet ou des résultats calculés.
Les photographies cartographiques restent celles du service satellite existant (Esri).

## Fichiers livrés

- `solar-building-hero.png` : bâtiment professionnel solaire et paysage, utilisé dans les en-têtes.
- `building-types.png` : atlas 3 colonnes × 2 lignes (bureaux, logistique, industrie, commerce, public, autre).
- `solar-choices.png` : atlas 2 × 2 (toit plat, incliné, autoconsommation avec surplus, vente totale).
- `ozeno-wordmark.svg` : adaptation vectorielle du mot-symbole et du soleil jaune présents dans la maquette, limitée au simulateur. À remplacer par le fichier de marque officiel pour une correspondance exacte.

Les PNG d’origine restent dans le dossier de génération ; les copies intégrées au site sont autonomes.
Aucune capture de formulaire contenant les coordonnées d’exemple n’est publiée.

## Intégration et vérifications

Fichiers d’interface modifiés : `src/ui/pro-simulator.html`, `src/ui/pro-simulator.mjs`.
Nouvelle feuille de présentation : `src/ui/pro-simulator-design.css`.
Tests complétés : `tests/unit/pro-simulator-estimation.test.mjs`.

- `npm run ci` : 260 tests réussis, vérification de fondation réussie.
- Contrôle visuel dans le navigateur à 1440 × 1000, 820 × 1180 et 375 × 812.
- Aucun débordement horizontal observé sur ces trois formats.
- Parcours Adresse → Toiture → Technique → Usage → Coordonnées vérifié, avec conservation des choix au retour.
- Toiture inclinée : choix de deux pans et reprise correcte dans le récapitulatif vérifiés.
- Correction de l’encadrement rouge injustifié lorsque l’utilisateur choisit un bouton radio autre que le premier.
- Aucun nouveau fournisseur de carte ou de recherche ; aucun changement des formules ou des appels de calcul PVGIS.

Limites : illustrations et mot-symbole recréés d’après des captures, pas une extraction pixel à pixel. Les fichiers graphiques de marque d’origine permettront une correspondance stricte. La transmission des coordonnées demeure non raccordée, comme dans la version précédente ; le formulaire l’indique explicitement. Le calcul distant PVGIS n’a pas été relancé lors de cette vérification graphique.

## Mode et références

Mode : imagegen intégré, images de référence locales, fond transparent. Aucun appel CLI.
Références : `Image ChatGPT 7 oct. 2026, 17_55_51-1.png` (accueil) et `Image ChatGPT 7 oct. 2026, 18_08_25-1.png` (bâtiment et toiture).

## Prompts finaux

### Illustration principale

Extract and faithfully recreate the hero illustration only from this OZENO website mockup, as a clean standalone website asset. Retain the illustrated contemporary PROFESSIONAL commercial/industrial building with a broad blue photovoltaic roof, glazed front facade, trees, shrubs, sun, little blue clouds and soft pale cream rolling landscape. Match the friendly polished semi-isometric 3D editorial illustration, white facade, navy-blue solar panels, varied lush green trees, yellow sun. Wide horizontal composition about 2.2:1. The building is the central subject, complete and not cropped. Remove ALL typography, logo, navigation, UI cards, buttons, form fields, icons, people data, ornamental corner leaves. No words, letters or numerals anywhere. Transparent outside the illustrated landscape, especially top and left edges, soft clean bottom edge. Do not recreate the screenshot or a website; deliver only the building landscape illustration, large and sharp enough for a responsive hero. No house/residential architecture; this is a large professional office/industrial building.

### Types de bâtiment

Create a clean transparent sprite atlas of SIX distinct small professional-building illustrations inspired faithfully by the building choice cards in the supplied OZENO mockup. Deliver only illustration assets, NOT a website. Exact regular grid: THREE equal-width columns and TWO equal-height rows, generous clear separation, every illustration centered within its own cell, all six at the same scale. Top row left: modern 4-storey white office building with blue windows and greenery. Top row center: light gray logistics warehouse with blue large door and a tiny yellow delivery truck. Top row right: industrial factory with tall navy chimneys, white facade and greenery. Bottom row left: broad retail store with orange flat roof strip and glass storefront, small trees. Bottom row center: French civic public building with symmetric arched entrance, tiny French flag, white facade, greenery. Bottom row right: contemporary wide glass-fronted professional/medical/tertiary building. Friendly polished semi-isometric 3D editorial style like the reference, fine clean detail, white/cream facades, navy and sky-blue glazing, varied soft green trees and shrubs, very subtle soft ground shadows. No text, letters, numbers, logo, labels, badges, borders, grid lines, UI, selection checks, residential houses or large background landscape. Transparent background. Each illustration must stay entirely inside its cell without touching neighboring cells. Canvas landscape 3:2; grid must stay exactly 3 columns and 2 rows.

### Toitures et usages

Create FOUR isolated polished semi-isometric solar-energy illustration assets on a transparent background, matching the friendly OZENO website mockup visual style. Exact regular TWO columns by TWO rows grid, four equal cells, each illustration entirely in its own centered cell with generous whitespace and no overlap. Top left cell: small WHITE PROFESSIONAL single-storey flat-roof building in three-quarter view with blue photovoltaic panels on low tilted supports, shrubs; visibly flat roof. Top right cell: WHITE PROFESSIONAL workshop with clearly pitched gable roof, blue photovoltaic panels on one roof slope, small shrubs; not a residential house (no chimney or home details). Bottom left cell: broad professional solar building plus a simple green arrow connecting solar panels down to the building and a smaller arrow to a small electricity pylon, representing self-consumption and surplus export. Bottom right cell: broad professional solar building with a green arrow going directly to a larger navy electricity transmission pylon, representing full export. Consistent white facades, vivid blue photovoltaic modules, lush green plants, mint oval ground and tiny warm yellow sun accent in the energy illustrations. Clean editorial 3D illustration with soft shading. NO text, letters, numbers, UI, badges, card borders or grid lines. Deliver a transparent illustration atlas only, square canvas, EXACT 2x2 regular grid.
