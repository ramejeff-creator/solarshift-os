# SolarShift â€” Product Specification MVP v1.0

> Source : cahier des charges fonctionnel SolarShift v1.0 Ã©tabli dans le contexte du projet. Le Pack Codex v1.0 est conservÃ© sous `docs/source/` et dÃ©finit les rÃ¨gles de dÃ©veloppement complÃ©mentaires.
On peut maintenant figer le **cahier des charges fonctionnel MVP v1.0**. L'objectif est de donner à Lovable une spécification suffisamment précise pour construire une première application exploitable, sans chercher à développer tout SolarShift dès la V1.

:::writing{variant="document" id="61482" title="SolarShift — Cahier des charges fonctionnel MVP v1.0"}
# SOLARSHIFT
## Cahier des charges fonctionnel — MVP v1.0

### 1. Objectif du MVP

Construire une application métier permettant à SolarShift de transformer une opportunité photovoltaïque B2B en **projet qualifié, documenté, scoré et orienté vers les prochaines actions**.

Le MVP ne cherche pas encore à automatiser toute la chaîne commerciale, réglementaire ou financière.

Il doit démontrer une proposition centrale :

> **SolarShift collecte les données d'un projet, vérifie leur qualité, calcule sa faisabilité, mesure sa certitude et ses risques, puis indique ce qu'il faut faire pour le rendre plus sûr et plus finançable.**

---

# 2. Utilisateurs

### ADMIN

Accès complet :

- configuration ;
- utilisateurs ;
- paramètres ;
- règles de scoring ;
- projets ;
- données ;
- audit.

### SOLARSHIFT

Équipe interne :

- création / modification projets ;
- validation des données ;
- analyse ;
- scoring ;
- risques ;
- génération des mémos.

### MANDATAIRE

Accès limité à ses projets :

- création d'opportunités ;
- dépôt de documents ;
- collecte d'informations ;
- suivi des actions ;
- visualisation des scores autorisés.

### EXPERT

Accès aux éléments nécessitant une validation :

- structure ;
- électricité ;
- urbanisme ;
- raccordement ;
- technique.

### CLIENT

Dans un premier temps :

- accès à un espace simplifié ;
- consultation du projet ;
- documents demandés ;
- actions à fournir.

---

# 3. Workflow principal

```text
OPPORTUNITÉ
     ↓
QUALIFICATION
     ↓
COLLECTE DONNÉES
     ↓
DOCUMENTS
     ↓
EXTRACTION IA
     ↓
VALIDATION
     ↓
CALCUL
     ↓
CERTAINTY
     ↓
RISK
     ↓
RESILIENCE
     ↓
NEXT BEST ACTION
     ↓
PROJECT READY
     ↓
INVESTOR MEMO
```

---

# 4. Statuts projet

Le projet utilise un workflow unique :

```text
LEAD
QUALIFICATION
DATA_COLLECTION
ANALYSIS
VALIDATION
PRE_FINANCEABLE
FINANCEABLE
CONTRACTING
EXECUTION
OPERATING
ARCHIVED
```

Un projet peut régresser d'un statut si une nouvelle information critique apparaît.

Exemple :

`FINANCEABLE → VALIDATION`

si une étude structurelle révèle un problème important.

---

# 5. Écran Dashboard

Le Dashboard SolarShift affiche :

### KPI portefeuille

- nombre de projets ;
- puissance totale ;
- CAPEX potentiel ;
- production potentielle ;
- CA potentiel ;
- projets par statut ;
- Certainty moyen ;
- Risk moyen ;
- Resilience moyen.

### Pipeline

```text
LEAD
  24 projets

QUALIFICATION
  17 projets

ANALYSIS
  11 projets

PRE-FINANCEABLE
   8 projets

FINANCEABLE
   5 projets
```

### Alertes

- données critiques manquantes ;
- documents manquants ;
- contradictions ;
- Risk Gates ;
- actions en retard.

---

# 6. Création d'un projet

Formulaire initial :

### Identification

- nom du projet ;
- adresse ;
- code postal ;
- ville ;
- client ;
- propriétaire ;
- occupant ;
- mandataire.

### Site

- type de bâtiment ;
- surface ;
- toiture ;
- activité ;
- statut d'occupation.

### Commercial

- étape commerciale ;
- interlocuteur ;
- engagement ;
- durée envisagée ;
- prix cible.

Après validation :

**Créer Project ID**

Exemple :

`SOL-2026-00247`

---

# 7. Project Cockpit

C'est l'écran principal.

```text
SOL-2026-00247
Projet industriel — Montpellier

CERTAINTY              82
QUALITY                78
INVESTMENT READINESS   74

RISK                   31
RESILIENCE             67
```

Puis :

### Critical Issues

- raccordement à confirmer ;
- structure non validée.

### Next Best Actions

1. étude structure ;
2. pré-étude raccordement ;
3. récupération historique consommation.

---

# 8. Onglet Data

Présentation des 60 paramètres.

Organisation :

```text
A — Site & solaire
B — Consommation
C — Économie
D — Réglementation
E — Réseau
F — Client
G — Technique
H — Data Quality
```

Chaque ligne :

| Paramètre | Valeur | Source | Confidence | Validation |
|---|---|---|---|---|
| Surface exploitable | 1 240 m² | Plan | 0,90 | Validé |
| Consommation | 184 500 kWh | Factures | 1,00 | Validé |
| Puissance PV | 185 kWc | Calcul | 0,75 | À valider |

---

# 9. Evidence Layer

Pour chaque donnée :

**Voir la preuve**

ouvre :

- document ;
- page ;
- date ;
- extrait ;
- source ;
- méthode d'extraction ;
- confiance.

Exemple :

```text
B01 — Annual Consumption

184 500 kWh/an

Source :
Factures électriques 2025

Extraction :
AI Document Extractor

Confidence :
0,98

Validation :
SolarShift — 15/09/2026
```

---

# 10. Documents

Upload drag & drop.

Types :

- facture ;
- historique consommation ;
- plan ;
- photo ;
- diagnostic ;
- structure ;
- électrique ;
- urbanisme ;
- devis ;
- contrat ;
- autre.

Workflow :

```text
UPLOAD
 ↓
OCR / PARSING
 ↓
CLASSIFICATION
 ↓
EXTRACTION
 ↓
PARAMETER MAPPING
 ↓
CONTRADICTION CHECK
 ↓
HUMAN VALIDATION
```

---

# 11. IA Document Engine

Le système doit identifier automatiquement :

- type de document ;
- date ;
- émetteur ;
- client ;
- bâtiment ;
- valeurs énergétiques ;
- surfaces ;
- puissance ;
- prix ;
- durée ;
- clauses importantes.

Il propose ensuite :

> **12 paramètres détectés**

avec validation utilisateur.

L'IA ne modifie pas directement une donnée validée sans créer une nouvelle version.

---

# 12. Calcul économique

Le moteur calcule automatiquement :

- puissance installable ;
- production ;
- autoconsommation ;
- énergie vendue ;
- prix solaire ;
- économies client ;
- revenu projet ;
- OPEX ;
- CAPEX ;
- marge ;
- TRI ;
- VAN ;
- DSCR ;
- Payback.

Les hypothèses sont visibles.

Aucune donnée calculée ne doit apparaître comme une donnée « source ».

---

# 13. Certainty Engine

L'interface présente :

### Certainty Score

`82 / 100`

Puis :

- Data Confidence ;
- Project Quality ;
- Investment Readiness.

Et les scores par domaine :

```text
Site             91
Consommation     87
Économie         79
Réglementation   71
Réseau           63
Client           89
Technique        76
Data             94
```

Chaque score doit être cliquable pour afficher ses composants.

---

# 14. Risk Engine

L'interface présente :

### Risk Score

`31 / 100`

Puis les catégories :

- technique ;
- contractuel ;
- réglementaire ;
- énergie/réseau ;
- systémique.

Pour chaque risque :

```text
Risque réseau
Score       58
Confidence  0,90
Severity    Élevée

Cause :
point de raccordement unique

Evidence :
pré-étude réseau

Action :
confirmer capacité de raccordement
```

---

# 15. Risk Gates

Un encart permanent apparaît lorsqu'un gate est déclenché.

Exemple :

> **CRITICAL GRID DEPENDENCY**

avec :

- cause ;
- preuve ;
- date ;
- impact ;
- action ;
- responsable ;
- statut.

---

# 16. Resilience Engine

Affichage :

**Resilience Score — 67/100**

Décomposition :

- production locale ;
- autoconsommation ;
- réduction dépendance réseau ;
- stockage ;
- backup ;
- charges critiques ;
- extensibilité.

Une distinction claire doit être faite entre :

**production solaire**

et

**capacité de secours électrique**.

---

# 17. Decision Engine

Chaque projet dispose d'un panneau :

## NEXT BEST ACTION

Les actions sont classées selon :

`Impact × Certainty Gain × Risk Reduction / Cost / Time`

Exemple :

| Action | Certainty | Risk | Coût | Priorité |
|---|---:|---:|---:|---|
| Étude structure | +11 | -14 | 1 500 € | Haute |
| Pré-étude réseau | +8 | -15 | 500 € | Haute |
| Historique 24 mois | +6 | -4 | 0 € | Moyenne |

Les gains sont des **estimations du moteur**, pas des garanties.

---

# 18. Scénarios

Chaque projet peut être analysé selon :

### BASE
Hypothèses actuelles.

### DEGRADED
Variables économiques ou techniques défavorables.

### STRESS
Combinaison de plusieurs hypothèses défavorables.

Affichage :

```text
                 BASE   DEGRADED   STRESS

Production       214     193        172 MWh
CAPEX            157     173        188 k€
IRR               7,4     5,9        4,1 %
Risk              31      44         61
Certainty         82      74         63
```

---

# 19. Score Delta

Le système doit permettre :

> **« Que se passe-t-il si je réalise cette action ? »**

Exemple :

```text
Situation actuelle

Certainty       72
Risk            48

+ Étude structure
+ Pré-étude réseau

Situation potentielle

Certainty       84
Risk            31
```

Le calcul doit être transparent et versionné.

---

# 20. Investor Memo

Bouton :

**Generate Investor Memo**

Le système produit un document comprenant :

### 1. Executive Summary

### 2. Site & Project

### 3. Energy Model

### 4. Economics

### 5. Contract

### 6. Certainty

### 7. Risk

### 8. Resilience

### 9. Critical Issues

### 10. Mitigation Plan

### 11. Investment Conditions

### 12. Next Steps

Toutes les données importantes doivent être reliées à leur source.

---

# 21. Permissions

Un mandataire ne doit voir que :

- ses projets ;
- ses clients ;
- ses documents ;
- les informations nécessaires à son activité.

SolarShift peut voir l'ensemble de son périmètre.

Un investisseur ne reçoit que le dossier autorisé.

Les données sensibles doivent être protégées par des règles d'accès au niveau base de données.

---

# 22. Audit

Toute modification importante crée une entrée :

```text
USER
DATE
PROJECT
PARAMETER
OLD VALUE
NEW VALUE
REASON
SOURCE
```

Exemple :

> Mandataire → puissance 250 → 185 kWc → étude structure → 15/09/2026.

---

# 23. Architecture technique MVP

Je recommande :

**Frontend**
- Lovable ;
- interface responsive ;
- design SaaS B2B premium.

**Backend**
- Supabase ;
- PostgreSQL ;
- authentification ;
- stockage documents ;
- Row Level Security ;
- API.

**IA**
- extraction documentaire ;
- classification ;
- analyse ;
- contradiction detection ;
- génération de synthèses.

**Moteurs déterministes**
- KPI Engine ;
- Certainty Engine ;
- Risk Engine ;
- Resilience Engine ;
- Decision Engine.

L'IA ne doit pas être responsable des calculs financiers ou des règles de scoring.

---

# 24. MVP — ce qui doit réellement être développé

### V1 indispensable

**Projet**
- création ;
- statut ;
- responsables.

**Data**
- 60 paramètres ;
- sources ;
- validation.

**Documents**
- upload ;
- classification ;
- extraction.

**Calcul**
- KPI ;
- Certainty ;
- Risk ;
- Resilience.

**Decision**
- actions ;
- priorités ;
- Score Delta.

**Output**
- cockpit ;
- rapport projet ;
- Investor Memo.

### À repousser

- marketplace EPC ;
- financement intégré ;
- CRM complet ;
- facturation ;
- portail investisseur avancé ;
- API publique ;
- benchmarking national ;
- scoring prédictif statistique.

---

# 25. Critère de réussite du MVP

Le MVP est réussi si un utilisateur peut partir de :

> **Adresse + quelques documents + informations client**

et obtenir :

> **Projet structuré → données extraites → preuves → KPI → Certainty → Risk → Resilience → actions prioritaires → Investor Memo.**

C'est cette boucle complète qui doit être démontrée avant d'ajouter les fonctions périphériques.

# 26. Principe produit final

SolarShift ne vend pas simplement :

**un CRM solaire**

ni :

**un logiciel de calcul photovoltaïque**

mais progressivement :

> **une infrastructure de qualification, sécurisation et orchestration des projets énergétiques B2B.**

Le MVP doit donc être conçu dès le départ pour que chaque nouveau projet enrichisse :

**la base de données → les règles → les modèles → le benchmarking → la capacité de décision de SolarShift.**
:::

À partir de ce cahier des charges, nous avons maintenant une base suffisamment solide pour passer au **prompt Lovable**. Je recommande toutefois de faire juste avant une dernière étape technique : transformer ce cahier des charges en **schéma Supabase + règles métier + architecture des écrans**, car c'est ce qui évitera à Lovable d'interpréter librement les éléments critiques.
