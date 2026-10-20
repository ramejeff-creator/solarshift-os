# Publication ciblée du plan HD

Cible confirmée par l’utilisateur : https://ramejeff-creator.github.io/solarshift-os/ . Le site publie le simulateur public, pas l’espace projet local. Le brouillon Muret local n’est pas transféré et aucun dossier métier distant n’est créé.

La publication ajoute un lien « Plan de situation HD à l’échelle » à la carte du simulateur, ainsi qu’une page `situation-plan.html`. Le lien réutilise le point d’une toiture tracée ou le repère d’adresse. La page permet de confirmer une parcelle via les connexions IGN existantes (adresse, coordonnées ou référence cadastrale complète), puis utilise les mêmes modules d’aperçu et d’export que l’application locale.

Les changements sont isolés sur la branche de publication existante `codex/pages-simulator-preview`. Le checkout principal, très modifié, n’est ni réinitialisé ni publié en bloc. Les fonctions métier existantes, migrations, règles et RLS ne sont pas modifiées.

Service déployé seul sur OZENO actif `rniitydsksjrphulrlct`, puis sur OZENO Beta `dptympcfznaqcdvtdxok` : `situation-plan` et ses deux dépendances partagées. La configuration existante du site GitHub pointe vers Beta ; la recette Chrome utilise donc Beta. Le premier appel échouait car le service n’y était pas encore déployé. La configuration des autres connexions est conservée. Les origines WMS, couches, dimensions, projections et échelles sont bornées côté serveur ; aucune lecture/écriture de projet ou de compte.

Contrôles du paquet de publication : fondation et 68 tests réussis, aucun échec ; syntaxe des modules et diff vérifiés. Les 485 tests réussis du checkout local constituent une vérification distincte, non présentée comme la suite de cette branche de publication.

Retour arrière : rétablir le commit précédent de la branche de publication et relancer son workflow Pages. La fonction d’export autonome n’altère aucune donnée métier.

## Recette distante effectuée dans Chrome

- Publication GitHub Pages réussie sur la branche dédiée, premier commit `23381b3` ; compléments de liaison et de version des modules publiés ensuite. Le workflow `Publish public simulator preview` a terminé avec succès.
- Accès depuis le simulateur : coordonnées Muret saisies à l’étape Adresse, lien du plan HD présent à l’étape Surface, point correctement transmis à la page de plan. Aucun dossier distant créé.
- Recherche réelle de la référence `31395000AM0014` : AM 0014, Muret, contenance 6 075 m² ; confirmation explicite de la parcelle.
- Fond Plan IGN + cadastre : aperçu chargé, export PDF téléchargé à 10:54:03 (heure de Paris).
- Fond photographie aérienne IGN + cadastre : aperçu chargé, export PDF téléchargé à 10:54:18. Un changement de fond invalide l’ancien aperçu et désactive l’export.
- Deux fichiers téléchargés depuis le site inspectés et mesurés indépendamment : une page 297 × 210 mm, image placée dans un cadre 273 × 134 mm, image source 2 150 × 1 055 pixels, barre de contrôle vectorielle de 50 mm. Au 1/1 000, le cadre représente donc 273 × 134 m. Identité, référence, adresse, échelle, nord du quadrillage, sources et dates lisibles, sans coupure.
- Fichiers de recette conservés localement dans `output/pdf/plan-situation-muret-en-ligne-ign.pdf` et `output/pdf/plan-situation-muret-en-ligne.pdf`. Impression à 100 % / taille réelle indispensable.

Le service accepte un POST de texte JSON sans authentification (informations géographiques publiques uniquement), avec les mêmes bornes et validations côté serveur. Les erreurs de connexion sont explicites et aucun aperçu incomplet ne peut être exporté. Aucune protection des données de compte n’est modifiée.
