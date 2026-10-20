# Dossier Muret : pré-étude et étude en ligne

Cette publication complète le plan HD du simulateur par l’espace projets authentifié : `app/projects.html`, pré-étude `app/index.html`, étude `app/workspace.html` et synthèse `app/project-dashboard.html`. La configuration GitHub reste sur OZENO Beta, comme les connexions existantes et la session locale d’origine. Les dossiers et leurs données restent servis par Supabase sous les droits de leur compte ; aucune donnée Muret n’est inscrite dans les sources publiques du site.

Le dossier existant du compte est réutilisé, sans doublon. Le brouillon local est conservé. Avant mise à jour, sauvegarde JSON des versions locale, distante et entrante téléchargée sur l’appareil de l’utilisateur. Le dossier est enrichi par ajout d’une version via `save_commercial_project`, avec contrôle de version concurrente et permissions existants. Les versions distantes antérieures restent conservées. Aucun identifiant ou snapshot du dossier n’est inclus dans le paquet statique.

Un transfert de brouillon inchangé utilise le snapshot sauvegardé exact plutôt que l’état d’un formulaire dont un calcul automatique pourrait masquer une ancienne hypothèse. Vérification : contrôles, risques, contour de toiture, qualification parcellaire et hypothèse manuelle de secours identiques au brouillon sauvegardé. Les dates des sources et du masque sont conservées. Les copies et détails de recette restent sur l’appareil de l’utilisateur.

La pré-étude présente et modifie la qualification. L’étude et la synthèse lisent le même snapshot enregistré, sans nouvel appel aux fournisseurs géographiques lors de l’ouverture : risques/réseaux, masque PVGIS, urbanisme et BDNB, sources/dates, points à vérifier, export de qualification et plan HD. La qualification reste provisoire et ne modifie pas le statut ou les résultats du scénario canonique.

Les sources indisponibles restent explicitement à compléter ; aucune absence de risque ou validation d’étude n’est inventée.

Services Beta : `site-context` publié ; `pvgis` actualisé avec le masque solaire ; `situation-plan` déjà publié. Aucun changement de migration, de RLS ou de droits d’accès. Aucune session ou clé privée n’est transférée vers le navigateur en ligne.

Validation locale : fondation et 494 tests, dont 487 réussis et 7 ignorés, aucun échec. Deux tests ajoutés pour conservation des snapshots, dates, métadonnées, données inconnues et refus de fusion de sites différents. Paquet de publication vérifié séparément avant publication.
