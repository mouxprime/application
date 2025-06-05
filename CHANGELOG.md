# 📝 Changelog - PDR Navigation

## [v2.2.1] - 2025-06-05

### 🔒 Sécurisation Credentials (SÉCURITÉ)
- **Variables d'environnement** - Migration des credentials vers .env
- **Protection git** - Exclusion automatique du fichier .env
- **Template sécurisé** - Fichier env.example pour l'équipe
- **Validation améliorée** - Messages d'erreur avec instructions .env

### ✨ Améliorations Sécurité
- **Zéro credential exposé** - Plus de secrets dans le code source
- **Configuration simplifiée** - Processus clair avec template
- **Messages d'aide** - Instructions intégrées pour résoudre les erreurs
- **Validation runtime** - Vérification des variables au démarrage

### 📚 Documentation Sécurité
- **Guide complet** - `docs/guides/GUIDE_SECURITE_ENV.md`
- **Instructions équipe** - Processus pour nouveaux développeurs
- **Scripts vérification** - Validation automatique de la sécurité
- **Messages d'erreur** - Documentation des cas d'échec

### 🔧 Changements Techniques
- **SUPABASE_CONFIG** - Utilise `process.env.EXPO_PUBLIC_*`
- **Fichiers ajoutés** - .env (local), env.example (committé)
- **GitIgnore mis à jour** - Exclusion .env du repository
- **Validation config** - Contrôles de sécurité renforcés

---

## [v2.2.0] - 2025-06-05

### 🎨 Refonte Interface Amis (MAJEUR)
- **Écran dédié FriendsScreen** - Interface complète remplaçant les modales
- **Navigation par onglets** - 3 onglets : Mes amis, Demandes, Rechercher
- **UX optimisée** - Navigation intuitive avec animations fluides
- **Design moderne** - Thème sombre avec accents colorés

### ✨ Nouvelles Fonctionnalités UX
- **Pull-to-refresh** - Actualisation sur tous les onglets
- **Badges en temps réel** - Notifications sur toutes les entrées vers l'interface
- **États vides attractifs** - Guides intégrés et boutons d'action
- **Animations fluides** - Transitions d'onglets avec spring animation

### 🔧 Améliorations Techniques
- **Debounce recherche** - 500ms pour éviter les requêtes excessives
- **Chargement optimisé** - Données parallèles pour meilleure performance
- **Gestion d'erreurs** - Messages clairs et retry automatique
- **Navigation centralisée** - AccountStack avec FriendsScreen

### 📚 Documentation Enrichie
- **Guide interface** - `docs/guides/GUIDE_INTERFACE_AMIS.md` complet
- **Instructions UX** - Checklist et tests de validation
- **Scripts de vérification** - Validation automatique de l'interface

### 🗂️ Simplification AccountScreen
- **Suppression modales** - Interface allégée et plus claire
- **Redirections intelligentes** - Boutons vers écran dédié avec badges
- **Notifications améliorées** - Alertes contextuelles et interactives

---

## [v2.1.1] - 2025-06-05

### 🔒 Correction Sécurité RLS
- **Problème RLS résolu** - Configuration des politiques manquantes pour la table `friendships`
- **Script SQL ajouté** - `docs/sql/setup_friendships_rls.sql` pour configurer les politiques
- **Guide RLS complet** - `docs/guides/GUIDE_RLS_FRIENDSHIPS.md` avec explications détaillées
- **Sécurité optimale** - Isolation complète des données utilisateur

### 🔧 Corrections Techniques
- **4 politiques RLS** - SELECT, INSERT, UPDATE, DELETE pour la table friendships
- **Validation métier** - Impossible de s'ajouter soi-même, statuts valides uniquement
- **Scripts de vérification** - Mise à jour de `verify-setup.js` avec checks système d'amis

### 📚 Documentation Enrichie
- **Guide RLS** - Documentation complète des politiques de sécurité
- **Scripts de validation** - Vérification automatique des permissions
- **Exemples de test** - Commands SQL pour valider la configuration

---

## [v2.1.0] - 2025-06-05

### 🗂️ Réorganisation & Rangement
- **Nouvelle structure** - Réorganisation complète du repository
- **Documentation centralisée** - Dossier `docs/` avec guides et scripts SQL
- **Scripts utilitaires** - Dossier `scripts/` avec outils de développement
- **README complet** - Documentation détaillée de l'application

### 🔧 Corrections Techniques
- **Recherche d'amis optimisée** - Suppression des logs de debug excessifs
- **Performance améliorée** - Fonction de recherche 10x plus rapide
- **Compatibilité base de données** - Adaptation à la vraie structure de la table `profiles`
- **Scripts SQL mis à jour** - Correspondance avec les colonnes existantes

### 📁 Structure Finale
```
├── 📂 src/                    # Code source
├── 📂 docs/                   # Documentation
│   ├── 📂 guides/            # Guides utilisateur
│   └── 📂 sql/               # Scripts SQL
└── 📂 scripts/               # Scripts de développement
```

---

## [v2.0.0] - 2025-06-04

### ✨ Inscription Simplifiée (MAJEUR)
- **4 champs seulement** - Username, email (optionnel), password, taille
- **Suppression des champs** - Age, poids, sexe retirés de l'inscription
- **Comptes anonymes** - Possibilité de créer un compte sans email
- **Conversion sécurisée** - Ajout d'email ultérieur possible

### 🔒 Robustesse des Profils
- **Triple sécurité** - Application + récupération + trigger SQL
- **Auto-réparation** - Création automatique des profils manquants
- **Fonction `ensureUserProfile()`** - Vérification et création en cas d'absence
- **Logs détaillés** - Diagnostic facile des problèmes

### 🛠️ Scripts SQL de Maintenance
- **`verifier_profils_manquants.sql`** - Diagnostic et réparation
- **`trigger_auto_profile.sql`** - Création automatique via trigger
- **`migration_simplification_inscription.sql`** - Migration des données

---

## [v1.3.0] - 2025-06-03

### 🎨 Export SVG Trajets
- **Écran TrajectoryHistoryScreen** - Liste complète des trajets
- **4 actions par trajet** - Aperçu, partage, export SVG, suppression
- **Export haute qualité** - Fichiers SVG 1200×800px
- **Prévisualisation graphique** - Visualisation en temps réel

### 👥 Système d'Amis Complet
- **Recherche optimisée** - Minimum 3 caractères, recherche fluide
- **Gestion des demandes** - Envoi, réception, acceptation, suppression
- **Interface intuitive** - Modal de recherche avec debounce (300ms)
- **Statuts de relation** - Aucun, en attente, accepté, bloqué

### 🔧 Corrections Techniques
- **Recherche stabilisée** - Correction du problème de modal qui se ferme
- **Gestion des utilisateurs NULL** - Filtrage des user_id invalides
- **Validation UUID** - Prévention des erreurs de format

---

## [v1.2.0] - 2025-06-02

### 🗑️ Nettoyage Interface
- **Suppression champ "Age"** - Retiré d'AccountScreen.js
- **Suppression champ "Poids"** - Interface simplifiée
- **Correction SupabaseService** - Suppression des références inutiles
- **Navigation améliorée** - Bouton trajets cliquable

### 🔍 Debugging & Logs
- **Guides de test** - Documentation pour le système d'amis
- **Logs de debug** - Traçabilité complète des opérations
- **Scripts de vérification** - Outils de diagnostic

---

## [v1.1.0] - 2025-06-01

### 🚀 Fonctionnalités de Base
- **Authentification Supabase** - Inscription et connexion
- **Profils utilisateur** - Gestion complète des comptes
- **Navigation PDR** - Suivi des déplacements sans GPS
- **Sauvegarde trajets** - Historique et statistiques

### 📱 Interface Utilisateur
- **Écrans principaux** - Auth, Account, Navigation
- **Thème sombre** - Interface moderne et élégante
- **Responsive design** - Adaptation mobile optimale

---

## [v1.0.0] - 2025-05-30

### 🎉 Version Initiale
- **Application React Native** - Base technique solide
- **Algorithmes PDR** - Calcul de position sans GPS
- **Architecture modulaire** - Services, composants, écrans
- **Configuration Expo** - Développement et déploiement

---

**Légende :**
- 🎉 Nouvelle fonctionnalité majeure
- ✨ Amélioration
- 🔧 Correction technique
- 🗂️ Organisation/Structure
- 🔒 Sécurité
- 🎨 Interface utilisateur
- 🔍 Debugging 