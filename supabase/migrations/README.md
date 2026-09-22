# Migrations

Les migrations doivent être séquentielles, réversibles quand c’est possible et accompagnées de tests RLS.

Ordre prévu pour la Phase 1 :

1. identités, organisations, appartenances et rôles ;
2. clients, contacts et projets ;
3. documents, sources, paramètres, preuves et validations ;
4. contradictions et journal d’audit ;
5. RuleSets versionnés ;
6. CR-001 : fondation versionnée des profils énergie, runs, KPI et scénarios ;
7. correction du cycle de vie des runs pour horodater tous les états terminaux.
8. CR-002 : contrats de gouvernance, configurations techniques et simulations persistées.
9. durcissement CR-002 : immutabilité agrégée, résultats externes validés, cohérence interprojet et RPC audités.

Aucun moteur de scoring n’est introduit par ces premières migrations.

La migration CR-001 sépare les données sources, les exécutions de calcul et les KPI
dérivés. C03 et C09 ne peuvent devenir les références canoniques qu’après validation
et promotion contrôlée d’un résultat versionné.

