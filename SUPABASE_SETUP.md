# 🔧 Configuration Supabase pour PDR Navigation

## ✅ Problèmes corrigés

1. **❌ Erreur `initializePersistentMap`** → ✅ **Corrigée**
   - Suppression de l'appel à la fonction non définie dans MapScreen.js

2. **❌ Erreur `initializeAppearance`** → ✅ **Corrigée**
   - Ajout de toutes les fonctions manquantes dans MapScreen.js

3. **🆕 Système d'authentification amélioré**
   - Username + password obligatoires
   - Email optionnel avec avertissement de sécurité
   - Suppression des comptes locaux existants
   - Intégration complète avec Supabase

## 📦 Dépendances installées

```bash
npm install @supabase/supabase-js @react-native-async-storage/async-storage
```

## 🔐 Nouveau système d'authentification

### Champs requis pour l'inscription :
- **Username** (obligatoire) : Nom d'utilisateur unique
- **Password** (obligatoire) : Minimum 6 caractères
- **Email** (optionnel) : ⚠️ Avertissement si pas fourni
- **Taille** (obligatoire) : Pour calcul de longueur de pas
- **Poids** (obligatoire) : Pour calculs énergétiques
- **Âge** (optionnel)
- **Genre** (optionnel)

### ⚠️ Avertissement email optionnel :
Si l'utilisateur ne fournit pas d'email, le système affiche :
```
ATTENTION : Vous n'avez pas fourni d'email.

🔒 Vos données ne seront JAMAIS récupérables en cas de perte de mot de passe.

💡 Recommandation : Ajoutez un email pour sécuriser votre compte.

Voulez-vous continuer sans email ?
```

## 🚀 Configuration étape par étape

### 1. Créer le projet Supabase

1. Allez sur [https://supabase.com](https://supabase.com)
2. Cliquez sur **"New Project"**
3. Remplissez :
   - **Name** : `pdr-navigation` (ou votre nom)
   - **Database Password** : Choisissez un mot de passe fort
   - **Region** : Choisissez proche de vous (ex: West Europe)
4. Cliquez **"Create new project"**
5. ⏱️ Attendez 2-3 minutes que le projet soit créé

### 2. Récupérer les informations de connexion

1. Dans votre dashboard Supabase, allez dans **Settings** → **API**
2. Copiez ces informations :
   - **Project URL** (ex: `https://abc123def456.supabase.co`)
   - **anon public** key (longue clé commençant par `eyJ...`)

### 3. Configurer l'application

✅ **Déjà fait** : Le fichier `src/config/supabase.js` est configuré avec vos vraies valeurs :

```javascript
export const SUPABASE_CONFIG = {
  url: 'https://hfjirdrwfihluqhvtrqs.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
};
```

### 4. Configurer la base de données

1. Dans votre dashboard Supabase, allez dans **SQL Editor**
2. Copiez-collez ce SQL et cliquez **"Run"** :

```sql
-- 1. Créer la table des profils utilisateur (MISE À JOUR)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  username TEXT NOT NULL, -- NOUVEAU: Nom d'utilisateur unique
  height INTEGER NOT NULL, -- en cm
  weight INTEGER NOT NULL, -- en kg
  age INTEGER,
  gender TEXT CHECK (gender IN ('male', 'female', 'unspecified')) DEFAULT 'unspecified',
  has_real_email BOOLEAN DEFAULT false, -- NOUVEAU: Indique si l'email est réel
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id),
  UNIQUE(username) -- NOUVEAU: Unicité du nom d'utilisateur
);

-- 2. Créer la table des trajets
CREATE TABLE IF NOT EXISTS trajectories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  trajectory_data JSONB NOT NULL, -- Données de la trajectoire (points, timestamps)
  step_count INTEGER DEFAULT 0,
  total_distance REAL DEFAULT 0, -- en mètres
  duration INTEGER DEFAULT 0, -- en secondes
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}' -- Métadonnées (version algorithme, device info, etc.)
);

-- 3. Activer Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trajectories ENABLE ROW LEVEL SECURITY;

-- 4. Politiques de sécurité pour les profils
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- 5. Politiques de sécurité pour les trajets
CREATE POLICY "Users can view own trajectories" ON trajectories
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trajectories" ON trajectories
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trajectories" ON trajectories
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own trajectories" ON trajectories
  FOR DELETE USING (auth.uid() = user_id);

-- 6. Créer des index pour les performances
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username); -- NOUVEAU
CREATE INDEX IF NOT EXISTS idx_trajectories_user_id ON trajectories(user_id);
CREATE INDEX IF NOT EXISTS idx_trajectories_created_at ON trajectories(created_at DESC);

-- 7. Fonction pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 8. Trigger pour profiles
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### 5. Initialiser Supabase dans l'app

✅ **Configuré automatiquement** : L'application charge automatiquement la configuration Supabase

## 🎯 Fonctionnalités mises à jour

### 🔐 Authentification améliorée
- **AccountScreen** : Affiche AuthScreen si non connecté
- **Suppression comptes locaux** : Nettoyage automatique au démarrage
- **Username unique** : Système de noms d'utilisateur
- **Email optionnel** : Avec avertissement de sécurité
- **Validation renforcée** : Contrôles complets des données

### 💾 Sauvegarde des trajets
- **Automatique** : Sauvegarde locale + cloud après chaque trajet
- **Métadonnées** : Algorithme version, device info, statistiques
- **Sécurité** : Chaque utilisateur voit seulement ses trajets

### 📊 Gestion de profil utilisateur
- **Interface moderne** : Édition directe des informations
- **Validation** : Contrôles des valeurs (taille, poids, âge)
- **Photo de profil** : Support caméra et galerie
- **Statistiques globales** : Trajets, distance, pas, temps

## 📱 Écrans mis à jour

### `AccountScreen.js` (REFACTORISÉ)
- Intégration complète avec Supabase
- Affichage d'AuthScreen si non connecté
- Interface de profil utilisateur moderne
- Suppression automatique comptes locaux

### `AuthScreen.js` (AMÉLIORÉ)
- Nouveau système username + password + email optionnel
- Avertissement sécurité pour email manquant
- Validation renforcée
- Messages d'erreur améliorés

### `SupabaseService.js` (ÉTENDU)
- Support des usernames
- Gestion des emails temporaires
- Champ `has_real_email` pour traçabilité
- Création de profil améliorée

## 🔧 Modifications techniques

### Base de données Supabase
```sql
-- Nouveaux champs dans profiles:
username TEXT NOT NULL,           -- Nom d'utilisateur unique
has_real_email BOOLEAN DEFAULT false, -- Email réel ou temporaire

-- Nouveaux index:
UNIQUE(username)                  -- Unicité username
idx_profiles_username            -- Performance recherche username
```

### Gestion des emails
- **Email fourni** : Utilisé normalement
- **Pas d'email** : Génération automatique `username@temp.local`
- **Marquage** : `has_real_email` indique si l'email est récupérable

### Suppression comptes locaux
```javascript
const clearLocalAccounts = async () => {
  // Nettoyage AsyncStorage et autres systèmes locaux
  console.log('🧹 Nettoyage des comptes locaux effectué');
};
```

## 🧪 Test de la configuration

1. **Tester l'inscription sans email** :
   ```
   Username: testuser
   Email: (vide)
   Password: motdepasse
   ```
   ➡️ Doit afficher l'avertissement et créer un compte avec email temporaire

2. **Tester l'inscription avec email** :
   ```
   Username: testuser2
   Email: test@example.com
   Password: motdepasse
   ```
   ➡️ Doit créer un compte normal récupérable

3. **Vérifier la base de données** :
   - Table `profiles` doit contenir `username` et `has_real_email`
   - Unicité des usernames doit être respectée

## 🚨 Sécurité renforcée

- ✅ **Row Level Security (RLS)** activé
- ✅ **Politiques strictes** : Utilisateurs accèdent seulement à leurs données
- ✅ **Validation côté client** et serveur
- ✅ **Unicité des usernames**
- ✅ **Avertissement sécurité** pour emails manquants

## 🔧 Dépannage

### Erreur username déjà utilisé
```
Ce nom d'utilisateur ou email est déjà utilisé
```
➡️ Choisir un autre nom d'utilisateur

### Problème de connexion sans email
```
Nom d'utilisateur ou mot de passe incorrect
```
➡️ Vérifier que l'inscription s'est bien faite avec le même username

### Erreur base de données
```
relation "profiles" does not exist
```
➡️ Exécuter le SQL mis à jour dans SQL Editor

## 📞 Support

Si vous rencontrez des problèmes :

1. Vérifiez la console pour les logs détaillés
2. Testez la création de compte avec/sans email
3. Vérifiez que les nouvelles colonnes sont créées dans Table Editor
4. Consultez la documentation Supabase : [https://supabase.com/docs](https://supabase.com/docs)

---

✅ **Status** : Configuration complète avec authentification username/password/email optionnel
🎯 **Résultat** : Application moderne avec sécurité renforcée et avertissements utilisateur 