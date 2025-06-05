# 🚶‍♂️ PDR Navigation - Application React Native

Application de navigation piétonne utilisant la technologie **Pedestrian Dead Reckoning (PDR)** avec système social complet.

## 📱 Fonctionnalités

### 🎯 Navigation & Tracking
- **Navigation PDR** - Suivi précis des déplacements sans GPS
- **Calcul automatique** - Distance, durée, nombre de pas
- **Algorithmes avancés** - Détection de mouvement et calibration

### 👥 Système Social  
- **Profils utilisateur** - Gestion complète des comptes
- **Système d'amis** - Recherche, demandes, acceptation
- **Inscription simplifiée** - 4 champs seulement (username, email optionnel, password, taille)

### 📊 Données & Export
- **Historique des trajets** - Sauvegarde et visualisation
- **Export SVG** - Trajets exportables en haute qualité
- **Statistiques** - Analyse des performances

## 📁 Structure du Projet

```
📦 PDR Navigation
├── 📂 src/                    # Code source principal
│   ├── 📂 components/         # Composants React Native réutilisables
│   │   ├── 📂 screens/           # Écrans de l'application
│   │   │   ├── AuthScreen.js     # Connexion/Inscription (simplifié)
│   │   │   ├── AccountScreen.js  # Profil utilisateur
│   │   │   └── TrajectoryHistoryScreen.js # Historique avec export SVG
│   │   ├── 📂 services/          # Services (API, base de données)
│   │   │   └── SupabaseService.js # Service principal Supabase
│   │   ├── 📂 config/            # Configuration
│   │   ├── 📂 algorithms/        # Algorithmes PDR
│   │   ├── 📂 navigation/        # Navigation React Navigation
│   │   └── 📂 utils/             # Utilitaires
│   ├── 📂 docs/                  # Documentation
│   │   ├── 📂 guides/           # Guides utilisateur
│   │   │   └── GUIDE_RESOLUTION_PROFILS.md # Guide de résolution des profils
│   │   └── 📂 sql/              # Scripts SQL
│   │       ├── migration_simplification_inscription.sql
│   │       ├── verifier_profils_manquants.sql
│   │       └── trigger_auto_profile.sql
│   └── 📂 scripts/              # Scripts de développement
```

## 🚀 Installation & Démarrage

### Prérequis
- Node.js 18+
- Expo CLI
- Compte Supabase configuré

### Démarrage
```bash
# Installation des dépendances
npm install

# Démarrage du serveur de développement
npm start

# Scanner le QR code avec Expo Go
```

## ⚙️ Configuration

### Supabase
Configurez votre projet Supabase dans `src/config/supabase.js` :

```javascript
export const SUPABASE_CONFIG = {
  url: 'your-supabase-url',
  anonKey: 'your-anon-key'
};
```

### Base de Données
Structure de la table `profiles` :
```sql
create table public.profiles (
  id uuid not null default gen_random_uuid(),
  user_id uuid null,
  email text null,
  height integer not null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  has_real_email boolean null default false,
  username text not null,
  biography text null default ''::text,
  profile_image_url text null
);
```

## 🔧 Fonctionnalités Récentes

### ✅ Inscription Simplifiée (v2.0)
- **4 champs seulement** : username, email (optionnel), password, taille
- **Comptes anonymes** - Possibilité de créer un compte sans email
- **Conversion sécurisée** - Ajout d'email ultérieur possible

### ✅ Système Social Complet
- **Recherche d'amis** optimisée (minimum 3 caractères)
- **Gestion des demandes** - Envoi, réception, acceptation
- **Interface intuitive** - Modal de recherche fluide

### ✅ Export SVG Trajets
- **Visualisation graphique** - Trajectoires en temps réel
- **Export haute qualité** - Fichiers SVG 1200×800px
- **Actions multiples** - Aperçu, partage, export, suppression

### ✅ Robustesse & Debugging
- **Triple sécurité** - Application + récupération + trigger SQL
- **Logs détaillés** - Diagnostic facile des problèmes
- **Auto-réparation** - Création automatique des profils manquants

## 🐛 Résolution de Problèmes

### Profils Manquants
Si l'écran reste bloqué sur le chargement :

1. **Vérifier les logs** dans la console de développement
2. **Exécuter le script SQL** : `docs/sql/verifier_profils_manquants.sql`
3. **Installer le trigger** : `docs/sql/trigger_auto_profile.sql`

### Recherche d'Amis
La recherche nécessite minimum 3 caractères et affiche les résultats en temps réel.

## 📊 Performances

- **Inscription** : ~2 secondes
- **Chargement profil** : ~1 seconde  
- **Recherche utilisateurs** : ~500ms
- **Export SVG** : ~3 secondes (trajet complexe)

## 🔮 Roadmap

- [ ] Mode hors-ligne complet
- [ ] Synchronisation multi-appareil
- [ ] Partage de trajets social
- [ ] Défis et classements
- [ ] Import/export GPX

## 👨‍💻 Développement

### Tests
```bash
npm test
```

### Lint
```bash
npm run lint
```

### Build Production
```bash
expo build:android
expo build:ios
```

---

**🎉 PDR Navigation** - Navigation piétonne de précision avec système social intégré 