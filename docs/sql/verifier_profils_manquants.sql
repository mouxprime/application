-- ==========================================
-- VERIFICATION ET CORRECTION PROFILS MANQUANTS
-- ==========================================
-- Ce script vérifie et corrige les utilisateurs qui n'ont pas de profil

-- 1. Vérifier les utilisateurs dans auth.users qui n'ont pas de profil
SELECT 
  u.id as user_id,
  u.email,
  u.created_at as auth_created_at,
  p.user_id as profile_exists
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.user_id
WHERE p.user_id IS NULL
ORDER BY u.created_at DESC;

-- 2. Compter les utilisateurs sans profil
SELECT COUNT(*) as users_without_profile
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.user_id
WHERE p.user_id IS NULL;

-- 3. Créer des profils pour les utilisateurs qui n'en ont pas
INSERT INTO profiles (
  user_id,
  username,
  biography,
  height,
  has_real_email,
  email,
  profile_image_url,
  created_at,
  updated_at
)
SELECT 
  u.id,
  COALESCE(
    u.raw_user_meta_data->>'username',
    u.raw_user_meta_data->>'display_name', 
    SPLIT_PART(u.email, '@', 1),
    'user_' || EXTRACT(epoch FROM u.created_at)::text
  ) as username,
  '' as biography,
  COALESCE((u.raw_user_meta_data->>'height')::integer, 170) as height,
  CASE WHEN u.email IS NOT NULL AND u.email != '' THEN true ELSE false END as has_real_email,
  COALESCE(u.email, '') as email,
  NULL as profile_image_url,
  u.created_at,
  NOW() as updated_at
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.user_id
WHERE p.user_id IS NULL;

-- 4. Vérification après création
SELECT 
  u.id as user_id,
  u.email as auth_email,
  p.username,
  p.email as profile_email,
  p.has_real_email,
  p.created_at as profile_created
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.user_id
ORDER BY u.created_at DESC
LIMIT 10;

-- 5. Statistiques finales
SELECT 
  (SELECT COUNT(*) FROM auth.users) as total_auth_users,
  (SELECT COUNT(*) FROM profiles) as total_profiles,
  (SELECT COUNT(*) FROM auth.users u LEFT JOIN profiles p ON u.id = p.user_id WHERE p.user_id IS NULL) as users_still_without_profile; 