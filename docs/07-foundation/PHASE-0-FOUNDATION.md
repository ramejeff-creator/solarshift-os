# Phase 0 — Fondations du dépôt

## Objectif

Préparer un dépôt exécutable et vérifiable sans développer de moteur de scoring ni d’interface métier.

## Inclus

- conventions de dépôt et d’encodage ;
- structure modulaire ;
- conventions Supabase et ordre des migrations ;
- contrôle automatisé des documents structurants ;
- test de verrouillage de l’ADR-001 ;
- workflow CI GitHub Actions.

## Hors périmètre

- migrations métier ;
- authentification configurée ;
- RLS déployée ;
- upload documentaire ;
- calculs KPI, Certainty, Risk, Resilience ou statut.

## Critère de sortie

`npm run ci` doit réussir et les ADR doivent rester accessibles depuis le dépôt.

