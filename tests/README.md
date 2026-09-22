
# Tests

La recette `integration/cr002-live-acceptance.sql` vérifie le parcours réel des
phases CR-002 2.1 à 2.3 avec des identités et données temporaires. Elle se termine
par un `ROLLBACK` et ne laisse aucune donnée d’acceptation dans l’environnement.
