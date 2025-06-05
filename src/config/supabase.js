/**
 * Configuration Supabase
 * 
 * INSTRUCTIONS DE CONFIGURATION :
 * 
 * 1. Créez un projet sur https://supabase.com
 * 2. Copiez le fichier 'env.example' vers '.env'
 * 3. Remplacez les valeurs dans .env par vos vraies informations
 * 4. Exécutez les requêtes SQL dans votre dashboard Supabase
 */

// ⚠️ CONFIGURATION VIA VARIABLES D'ENVIRONNEMENT
// Les credentials sont maintenant dans le fichier .env (non committé)
export const SUPABASE_CONFIG = {
  // URL de votre projet (chargée depuis .env)
  url: process.env.EXPO_PUBLIC_SUPABASE_URL,
  
  // Clé publique anonyme (chargée depuis .env)
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
};

/**
 * Valider la configuration Supabase
 */
export const validateSupabaseConfig = () => {
  const errors = [];
  
  if (!SUPABASE_CONFIG.url) {
    errors.push('❌ URL Supabase manquante - vérifiez EXPO_PUBLIC_SUPABASE_URL dans .env');
  } else if (!SUPABASE_CONFIG.url.includes('supabase.co')) {
    errors.push('❌ URL Supabase invalide (doit contenir supabase.co)');
  }
  
  if (!SUPABASE_CONFIG.anonKey) {
    errors.push('❌ Clé anonyme Supabase manquante - vérifiez EXPO_PUBLIC_SUPABASE_ANON_KEY dans .env');
  } else if (!SUPABASE_CONFIG.anonKey.startsWith('eyJ')) {
    errors.push('❌ Clé anonyme Supabase invalide (doit commencer par eyJ)');
  }
  
  if (errors.length > 0) {
    console.error('🚨 [SUPABASE CONFIG] Erreurs de configuration:');
    errors.forEach(error => console.error(error));
    console.error('💡 Créez un fichier .env à partir de env.example et ajoutez vos credentials');
    return false;
  }
  
  console.log('✅ [SUPABASE CONFIG] Configuration valide');
  return true;
};

/**
 * REQUÊTES SQL À EXÉCUTER DANS VOTRE DASHBOARD SUPABASE
 * 
 * Allez dans votre dashboard Supabase > SQL Editor et exécutez ces requêtes :
 */

export const SETUP_SQL = `
-- 1. Créer la table des profils utilisateur (MISE À JOUR pour auth anonyme + nouvelles fonctionnalités)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  username TEXT NOT NULL, -- Nom d'utilisateur unique (pseudo)
  supabase_email TEXT, -- NOUVEAU: Email utilisé dans Supabase Auth (nullable pour utilisateurs anonymes)
  biography TEXT DEFAULT '', -- NOUVEAU: Biographie courte (200 caractères max)
  profile_image_url TEXT, -- NOUVEAU: URL de la photo de profil stockée dans Supabase Storage
  height INTEGER NOT NULL, -- en cm
  weight INTEGER NOT NULL, -- en kg
  age INTEGER,
  gender TEXT CHECK (gender IN ('male', 'female', 'unspecified')) DEFAULT 'unspecified',
  has_real_email BOOLEAN DEFAULT false, -- Indique si l'email est réel ou temporaire
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id),
  UNIQUE(username) -- Unicité du nom d'utilisateur
);

-- 2. NOUVEAU: Créer la table des relations d'amitié
CREATE TABLE IF NOT EXISTS friendships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('pending', 'accepted', 'declined', 'blocked')) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(requester_id, addressee_id), -- Éviter les doublons
  CHECK (requester_id != addressee_id) -- Éviter l'auto-amitié
);

-- 3. Créer la table des trajets
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

-- 4. NOUVEAU: Créer le storage bucket pour les photos de profil
INSERT INTO storage.buckets (id, name, public) 
VALUES ('profile-images', 'profile-images', true)
ON CONFLICT (id) DO NOTHING;

-- 5. Activer Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trajectories ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- 6. Politiques de sécurité pour les profils (MISE À JOUR pour auth anonyme)
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view public profiles" ON profiles;

CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = user_id);

-- NOUVEAU: Policy simplifiée pour les utilisateurs anonymes
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- NOUVEAU: Permettre de voir les profils publics (pour recherche d'amis)
CREATE POLICY "Users can view public profiles" ON profiles
  FOR SELECT USING (true); -- Public pour permettre la recherche d'amis

-- 7. Politiques de sécurité pour les trajets
CREATE POLICY "Users can view own trajectories" ON trajectories
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trajectories" ON trajectories
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trajectories" ON trajectories
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own trajectories" ON trajectories
  FOR DELETE USING (auth.uid() = user_id);

-- 8. NOUVEAU: Politiques de sécurité pour les amitiés
CREATE POLICY "Users can view their friendships" ON friendships
  FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE POLICY "Users can create friendships" ON friendships
  FOR INSERT WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Users can update their friendships" ON friendships
  FOR UPDATE USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE POLICY "Users can delete their friendships" ON friendships
  FOR DELETE USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- 9. NOUVEAU: Politiques de sécurité pour le storage des photos de profil
CREATE POLICY "Users can upload their profile image" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'profile-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view profile images" ON storage.objects
  FOR SELECT USING (bucket_id = 'profile-images');

CREATE POLICY "Users can update their profile image" ON storage.objects
  FOR UPDATE USING (bucket_id = 'profile-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their profile image" ON storage.objects
  FOR DELETE USING (bucket_id = 'profile-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 10. Créer des index pour les performances
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_trajectories_user_id ON trajectories(user_id);
CREATE INDEX IF NOT EXISTS idx_trajectories_created_at ON trajectories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_friendships_requester_id ON friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee_id ON friendships(addressee_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(status);

-- 11. Fonction pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 12. Triggers pour la mise à jour automatique
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_friendships_updated_at ON friendships;
CREATE TRIGGER update_friendships_updated_at
  BEFORE UPDATE ON friendships
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 13. NOUVEAU: Script de migration pour rendre supabase_email nullable (si déjà existant)
ALTER TABLE profiles ALTER COLUMN supabase_email DROP NOT NULL;

-- 14. NOUVEAU: Ajouter les nouvelles colonnes si elles n'existent pas
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS biography TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_image_url TEXT;

-- 15. NOUVEAU: Contrainte pour limiter la biographie à 200 caractères
ALTER TABLE profiles ADD CONSTRAINT biography_length_check CHECK (char_length(biography) <= 200);
`;

/**
 * SCRIPT DE MIGRATION POUR PROJETS EXISTANTS
 * 
 * Si vous avez déjà une table profiles existante, exécutez ce script
 * dans votre dashboard Supabase > SQL Editor pour la rendre compatible
 * avec l'authentification anonyme :
 */
export const MIGRATION_SQL = `
-- Migration pour l'authentification anonyme
-- À exécuter uniquement si vous avez déjà une table profiles

-- 1. Rendre supabase_email nullable
ALTER TABLE profiles ALTER COLUMN supabase_email DROP NOT NULL;

-- 2. Mettre à jour la policy INSERT (simplification)
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 3. Optionnel: Ajouter une colonne pour identifier les comptes anonymes
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT false;

-- 4. Vérification - Lister les contraintes NOT NULL actuelles
SELECT column_name, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'profiles' AND table_schema = 'public'
ORDER BY column_name;
`;

/**
 * INSTRUCTIONS DÉTAILLÉES :
 * 
 * 1. Créer le projet Supabase :
 *    - Allez sur https://supabase.com
 *    - Cliquez "New Project"
 *    - Choisissez nom/région/mot de passe
 *    - Attendez la création (2-3 minutes)
 * 
 * 2. Configurer les variables d'environnement :
 *    - Copiez 'env.example' vers '.env'
 *    - Dans Settings > API de votre projet Supabase
 *    - Copiez "Project URL" et "anon public" 
 *    - Remplacez les valeurs dans .env
 * 
 * 3. Configurer la base de données :
 *    - Allez dans SQL Editor
 *    - Copiez-collez le SQL ci-dessus
 *    - Cliquez "Run" pour exécuter
 * 
 * 4. Installation des dépendances :
 *    npm install @supabase/supabase-js @react-native-async-storage/async-storage
 * 
 * 5. Initialiser dans votre app :
 *    import { SUPABASE_CONFIG } from './src/config/supabase';
 *    import supabaseService from './src/services/SupabaseService';
 *    
 *    // Dans votre App.js ou composant principal
 *    await supabaseService.initialize(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
 * 
 * 6. Sécurité :
 *    - Le fichier .env est automatiquement exclu de git
 *    - Vos credentials ne seront jamais commités
 *    - Partagez 'env.example' avec votre équipe, pas .env
 */

export default SUPABASE_CONFIG; 