# Migrations

Les migrations doivent être séquentielles, réversibles quand c’est possible et accompagnées de tests RLS.

Ordre prévu pour la Phase 1 :

1. identités, organisations, appartenances et rôles ;
2. clients, contacts et projets ;
3. documents, sources, paramètres, preuves et validations ;
4. contradictions et journal d’audit ;
5. RuleSets versionnés.

Aucun moteur de scoring n’est introduit par ces premières migrations.

