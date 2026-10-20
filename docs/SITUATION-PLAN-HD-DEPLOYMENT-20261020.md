# Publication ciblée du plan HD

Cible confirmée par l’utilisateur : https://ramejeff-creator.github.io/solarshift-os/ . Le site publie le simulateur public, pas l’espace projet local. Le brouillon Muret local n’est pas transféré et aucun dossier métier distant n’est créé.

La publication ajoute un lien « Plan de situation HD à l’échelle » à la carte du simulateur, ainsi qu’une page `situation-plan.html`. Le lien réutilise le point d’une toiture tracée ou le repère d’adresse. La page permet de confirmer une parcelle via les connexions IGN existantes (adresse, coordonnées ou référence cadastrale complète), puis utilise les mêmes modules d’aperçu et d’export que l’application locale.

Les changements sont isolés sur la branche de publication existante `codex/pages-simulator-preview`. Le checkout principal, très modifié, n’est ni réinitialisé ni publié en bloc. Les fonctions métier existantes, migrations, règles et RLS ne sont pas modifiées.

Service déployé seul sur le projet OZENO actif `rniitydsksjrphulrlct` : `situation-plan` et ses deux dépendances partagées. Réponse réelle sur Muret : HTTP 200, 2 150 × 1 055 pixels, A4 paysage à 1/1 000, Plan IGN + Parcellaire Express. Les origines WMS, couches, dimensions, projections et échelles sont bornées côté serveur ; aucune lecture/écriture de projet ou de compte.

Contrôles du paquet de publication : fondation et 68 tests réussis, aucun échec ; syntaxe des modules et diff vérifiés. Les 485 tests réussis du checkout local constituent une vérification distincte, non présentée comme la suite de cette branche de publication.

Retour arrière : rétablir le commit précédent de la branche de publication et relancer son workflow Pages. La fonction d’export autonome n’altère aucune donnée métier.
