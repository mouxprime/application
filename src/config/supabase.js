/**
 * Configuration Supabase
 * 
 * INSTRUCTIONS DE CONFIGURATION :
 * 
 * 1. Créez un projet sur https://supabase.com
 * 2. Remplacez les valeurs ci-dessous par vos vraies informations
 * 3. Exécutez les requêtes SQL dans votre dashboard Supabase
 */

// ⚠️ REMPLACEZ THESE VALUES AVEC VOS VRAIES INFORMATIONS SUPABASE
export const SUPABASE_CONFIG = {
  // URL de votre projet (ex: https://xxxxxxxxxxxxxxxx.supabase.co)
  url: 'https://hfjirdrwfihluqhvtrqs.supabase.co',
  
  // Clé publique anonyme (safe pour client-side)
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmamlyZHJ3ZmlobHVxaHZ0cnFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg0MjU2NjAsImV4cCI6MjA2NDAwMTY2MH0.vwt00suzC9FftgLi7iAitcc4lKExMvfV4yN9jN-CmEA',
};

/**
 * Valider la configuration Supabase
 */
export const validateSupabaseConfig = () => {
  const errors = [];
  
  if (!SUPABASE_CONFIG.url) {
    errors.push('❌ URL Supabase manquante');
  } else if (!SUPABASE_CONFIG.url.includes('supabase.co')) {
    errors.push('❌ URL Supabase invalide (doit contenir supabase.co)');
  }
  
  if (!SUPABASE_CONFIG.anonKey) {
    errors.push('❌ Clé anonyme Supabase manquante');
  } else if (!SUPABASE_CONFIG.anonKey.startsWith('eyJ')) {
    errors.push('❌ Clé anonyme Supabase invalide (doit commencer par eyJ)');
  }
  
  if (errors.length > 0) {
    console.error('🚨 [SUPABASE CONFIG] Erreurs de configuration:');
    errors.forEach(error => console.error(error));
    console.error('💡 Vérifiez votre fichier src/config/supabase.js');
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
-- 1. Créer la table des profils utilisateur
CREATE TABLE IF NOT EXISTS profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  username TEXT NOT NULL, -- Nom d'utilisateur unique
  supabase_email TEXT, -- NOUVEAU: Email utilisé dans Supabase Auth (peut être temporaire)
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
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (
    auth.uid() = user_id OR  -- L'utilisateur connecté peut créer son profil
    auth.uid() IS NOT NULL   -- Ou tout utilisateur authentifié peut créer un profil
  );

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
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
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
 * 2. Récupérer les informations :
 *    - Dans Settings > API
 *    - Copiez "Project URL" et "anon public"
 *    - Remplacez les valeurs dans SUPABASE_CONFIG
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
 */

export default SUPABASE_CONFIG; 