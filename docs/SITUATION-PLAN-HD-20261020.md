# Plan de situation HD à l’échelle

Livraison locale du 20 octobre 2026. Accessible depuis Projet & adresse > Localisation > Parcelle et contexte du site, après confirmation de la parcelle, et dans la qualification de la fiche de prospection.

## Périmètre

Volet repliable commun : Plan IGN ou photographie aérienne, cadastre activable, A4/A3 portrait ou paysage, échelles 1/500, 1/1 000, 1/2 000, 1/5 000 et 1/10 000. Aperçu centré sur l’emprise cadastrale confirmée puis PDF HD à 200 dpi. Aucun nouveau géocodage ou recherche cadastrale : réutilisation de la géométrie déjà qualifiée.

OZENO utilisait OSM pour le plan et Esri pour l’imagerie. Les fonds d’export IGN sont ajoutés par un adaptateur public Géoplateforme WMS ; les connexions IGN existantes pour adresse et cadastre sont conservées, sans doublon. La carte de tracé existante reste indépendante du document imprimable.

## Sources et échelle

- Géoplateforme : `https://data.geopf.fr/wms-r/ows`, WMS 1.3.0.
- Plan : `GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2`.
- Imagerie : `ORTHOIMAGERY.ORTHOPHOTOS`.
- Cadastre : `CADASTRALPARCELS.PARCELLAIRE_EXPRESS` (IGN / DGFiP).
- Licence Ouverte Etalab 2.0 ; attribution et consultation inscrites au PDF. Le millésime et la date de prise de vue ne sont pas supposés.

Le serveur calcule l’étendue dans le système métrique Lambert-93 : largeur terrain = largeur papier en mm × dénominateur / 1 000. Le PDF place exactement la même image dans ce cadre papier. Barre vectorielle de 50 mm, nord du quadrillage explicitement identifié, contour parcellaire vectoriel rouge. Impression impérativement à 100 %, sans ajustement automatique. Ce plan de repérage ne vaut ni bornage ni relevé géomètre.

Version limitée à la métropole (domaine Lambert-93). Aucun export mensonger pour un site ultramarin. Une parcelle coupée par le cadre est refusée avec un message invitant à élargir l’échelle ou le format. Les réglages n’altèrent aucune donnée du projet.

## Implémentation

- `_shared/situation-plan-handler.mjs` : formats/échelles/fonds sur liste fermée, coordonnées bornées, emprise réutilisée, taille et délai plafonnés. PNG fournisseur contrôlé (type, signature et dimensions). Aucune couche défaillante omise silencieusement. Pas d’URL arbitraire.
- Fonction publique `situation-plan`, également exposée en local sur `/__local/situation-plan` via le serveur existant et `situationPlanEndpoint`.
- `situation-plan-ui.mjs` : aperçu et contrôles communs aux deux parcours, annulation/invalidation au changement de réglage ; résultat obsolète non exportable.
- `situation-plan-pdf.mjs` : réutilise l’encodage du générateur PDF existant, incorpore une image JPEG haute qualité et les éléments vectoriels. Aucune dépendance distante supplémentaire.
- Pas de migration, modification RLS ou accès aux données privées. Aucun déploiement distant effectué ; la fonction doit être déployée pour rendre ce nouvel export disponible sur un hébergement distant.

## Validation

Contrôles de fondation et suite complète : 492 tests, 485 réussis, 7 ignorés, aucun échec. Quatre tests ajoutés : rapports métriques papier/terrain, formats/projections/cadrages refusés avant appel fournisseur, origine et couches imposées/échecs/dimensions, structure binaire PDF. Une tentative complète a rencontré un manque de mémoire système ; la relance des mêmes contrôles a réussi.

Chrome / Muret AM 0014 : Plan IGN + cadastre puis photographie aérienne + cadastre à 1/1 000, A4 paysage. Images réelles IGN 2 150 × 1 055 pixels, cadre terrain 273 × 134 m. Deux PDF téléchargés depuis l’interface et inspectés après rendu : `output/pdf/plan-situation-muret-ign.pdf` et `output/pdf/plan-situation-muret-aerien.pdf`. Aucun texte coupé, cartouche, contour, nord et barre d’échelle lisibles.

Changement de fond : aperçu retiré, export désactivé jusqu’à préparation. Échelle 1/500 sur Muret : cadre trop serré explicitement refusé, export désactivé. Retour à 1/1 000 possible. Les réglages restent temporaires ; le projet Muret version 10 n’est pas modifié par la préparation des plans.
