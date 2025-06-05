# 🔒 Guide Sécurité - Variables d'Environnement

## 🎯 Objectif

Sécuriser les **credentials Supabase** en les déplaçant dans des variables d'environnement, évitant ainsi leur exposition dans le code source committé.

## ⚠️ Problème Résolu

**Avant :** Les credentials étaient en dur dans `src/config/supabase.js`
```javascript
// ❌ DANGEREUX - Credentials exposés
export const SUPABASE_CONFIG = {
  url: 'https://hfjirdrwfihluqhvtrqs.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
};
```

**Après :** Les credentials sont dans `.env` (non committé)
```javascript
// ✅ SÉCURISÉ - Variables d'environnement
export const SUPABASE_CONFIG = {
  url: process.env.EXPO_PUBLIC_SUPABASE_URL,
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
};
```

## 📁 Structure des Fichiers

```
📦 PDR Navigation
├── 🔐 .env                    # Credentials secrets (ignoré par git)
├── 📝 env.example             # Template pour l'équipe (committé)
├── 🚫 .gitignore              # Exclut .env du repo
└── ⚙️ src/config/supabase.js  # Configuration sécurisée
```

## 🚀 Configuration Initiale

### 1. **Créer votre fichier .env**
```bash
# Copiez le template
cp env.example .env

# Éditez avec vos vraies valeurs
nano .env
```

### 2. **Contenu du .env**
```bash
# Configuration Supabase - PDR Navigation
# URL de votre projet Supabase
EXPO_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co

# Clé publique anonyme Supabase  
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. **Récupérer vos credentials**
1. Allez sur [supabase.com](https://supabase.com)
2. Ouvrez votre projet
3. **Settings > API**
4. Copiez :
   - **Project URL** → `EXPO_PUBLIC_SUPABASE_URL`
   - **anon public** → `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## 🛡️ Sécurité Garantie

### ✅ **Protection Active**
- **`.env` exclu de git** - Impossible de committer par accident
- **Template partagé** - `env.example` guide l'équipe
- **Validation runtime** - Erreurs claires si credentials manquants
- **Messages d'aide** - Instructions intégrées dans les erreurs

### 🔍 **Vérifications**
```bash
# Vérifier que .env est ignoré
git status --ignored | grep .env

# Tester la configuration
npm start
# ✅ Si ça démarre, la config est bonne
# ❌ Si erreur, vérifiez vos variables .env
```

## 👥 Travail en Équipe

### **Pour les nouveaux développeurs :**
1. **Cloner le repo** (pas de credentials exposés)
2. **Copier le template** : `cp env.example .env`
3. **Demander les credentials** à l'équipe
4. **Remplir le .env** avec les vraies valeurs
5. **Démarrer l'app** : `npm start`

### **Partage sécurisé :**
- ✅ **Committé :** `env.example`, documentation, code
- ❌ **Jamais committé :** `.env`, credentials, secrets
- 💬 **Communication privée :** Slack, email sécurisé, gestionnaire de mots de passe

## 🚨 Messages d'Erreur

### **Configuration manquante :**
```
🚨 [SUPABASE CONFIG] Erreurs de configuration:
❌ URL Supabase manquante - vérifiez EXPO_PUBLIC_SUPABASE_URL dans .env
❌ Clé anonyme Supabase manquante - vérifiez EXPO_PUBLIC_SUPABASE_ANON_KEY dans .env
💡 Créez un fichier .env à partir de env.example et ajoutez vos credentials
```

### **Solution :**
1. Vérifiez que `.env` existe
2. Vérifiez les noms des variables (exactement comme dans `env.example`)
3. Vérifiez les valeurs (URL doit contenir supabase.co, clé doit commencer par eyJ)

## 📱 Variables Expo

### **Pourquoi `EXPO_PUBLIC_` ?**
- **Expo requirement** - Variables accessibles côté client
- **Naming convention** - Standard Expo pour les variables publiques
- **Build-time injection** - Variables intégrées lors du build

### **Alternative React Native :**
Si vous n'utilisez pas Expo, utilisez :
```javascript
// Pour React Native CLI
url: process.env.SUPABASE_URL,
anonKey: process.env.SUPABASE_ANON_KEY,
```

## ✅ Checklist Finale

- [ ] **`.env` créé** avec vraies valeurs
- [ ] **`.env` ignoré par git** (`git status` ne le montre pas)
- [ ] **`env.example` committé** pour l'équipe
- [ ] **App démarre** sans erreur de configuration
- [ ] **Équipe informée** du nouveau processus
- [ ] **Credentials anciens** supprimés du code

## 🎉 Résultat

**Sécurité maximale** avec zéro impact sur l'expérience développeur. Les credentials sont maintenant :
- 🔒 **Protégés** - Jamais exposés dans le repo
- 🚀 **Faciles** - Configuration simple avec template
- 👥 **Collaboratifs** - Processus clair pour l'équipe
- 🛡️ **Fiables** - Validation et messages d'erreur utiles

---

**🔐 Vos credentials sont maintenant en sécurité !** 