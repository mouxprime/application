-- ==========================================
-- TRIGGER AUTOMATIQUE CREATION PROFIL
-- ==========================================
-- Ce trigger crée automatiquement un profil 
-- lors de l'inscription si l'application échoue

-- 1. Fonction pour créer le profil automatiquement
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Vérifier si un profil existe déjà
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = NEW.id) THEN
    INSERT INTO public.profiles (
      user_id,
      username,
      biography,
      height,
      has_real_email,
      email,
      profile_image_url,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      COALESCE(
        NEW.raw_user_meta_data->>'username',
        NEW.raw_user_meta_data->>'display_name',
        SPLIT_PART(NEW.email, '@', 1),
        'user_' || EXTRACT(epoch FROM NEW.created_at)::text
      ),
      '',
      COALESCE((NEW.raw_user_meta_data->>'height')::integer, 170),
      CASE WHEN NEW.email IS NOT NULL AND NEW.email != '' THEN true ELSE false END,
      COALESCE(NEW.email, ''),
      NULL,
      NEW.created_at,
      NOW()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Créer le trigger sur la table auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Activer RLS (Row Level Security) sur la table profiles si pas déjà fait
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Politique pour permettre aux utilisateurs de voir leur propre profil
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

-- 5. Politique pour permettre aux utilisateurs de modifier leur propre profil  
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- 6. Politique pour permettre l'insertion (trigger)
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.profiles;
CREATE POLICY "Enable insert for authenticated users"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 7. Test du trigger (pour vérifier qu'il fonctionne)
SELECT 
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers 
WHERE trigger_name = 'on_auth_user_created'; 