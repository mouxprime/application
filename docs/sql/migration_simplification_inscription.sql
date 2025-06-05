-- ==========================================
-- MIGRATION : SIMPLIFICATION INSCRIPTION
-- ==========================================
-- Adapte les données existantes pour la nouvelle inscription simplifiée

-- 1. Mettre des valeurs par défaut pour les colonnes si elles sont NULL
UPDATE profiles 
SET 
  height = COALESCE(height, 170),
  biography = COALESCE(biography, ''),
  has_real_email = COALESCE(has_real_email, false),
  email = COALESCE(email, '')
WHERE height IS NULL 
   OR biography IS NULL 
   OR has_real_email IS NULL 
   OR email IS NULL;

-- 2. Créer un profil par défaut pour l'utilisateur connecté si manquant
INSERT INTO profiles (
  user_id, 
  username, 
  biography,
  height,
  has_real_email,
  email,
  profile_image_url
) VALUES (
  auth.uid(),
  'user_' || extract(epoch from now())::text,
  '',
  170,
  false,
  '',
  NULL
) ON CONFLICT (user_id) DO NOTHING;

-- 3. Vérification après migration
SELECT 
  user_id,
  username,
  height,
  biography,
  has_real_email,
  email,
  created_at
FROM profiles 
WHERE user_id = auth.uid();

-- 4. Vérifier la structure actuelle
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'profiles' 
  AND table_schema = 'public'
ORDER BY ordinal_position; 