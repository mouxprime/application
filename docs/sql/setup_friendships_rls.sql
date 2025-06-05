-- ==========================================
-- SETUP RLS POLICIES POUR TABLE FRIENDSHIPS
-- ==========================================
-- Configure les politiques de sécurité pour la table friendships

-- 1. Activer RLS sur la table friendships (si pas déjà fait)
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- 2. Supprimer les anciennes politiques (si elles existent)
DROP POLICY IF EXISTS "Users can view their own friendships" ON public.friendships;
DROP POLICY IF EXISTS "Users can create friend requests" ON public.friendships;
DROP POLICY IF EXISTS "Users can update their friendships" ON public.friendships;
DROP POLICY IF EXISTS "Users can delete their friendships" ON public.friendships;

-- 3. Politique de LECTURE (SELECT)
-- Les utilisateurs peuvent voir les amitiés où ils sont impliqués (soit requester, soit addressee)
CREATE POLICY "Users can view their own friendships"
  ON public.friendships FOR SELECT
  USING (
    auth.uid() = requester_id OR 
    auth.uid() = addressee_id
  );

-- 4. Politique d'INSERTION (INSERT)
-- Les utilisateurs peuvent créer des demandes d'amis où ils sont le requester
CREATE POLICY "Users can create friend requests"
  ON public.friendships FOR INSERT
  WITH CHECK (
    auth.uid() = requester_id AND
    auth.uid() != addressee_id
  );

-- 5. Politique de MISE À JOUR (UPDATE)
-- Les utilisateurs peuvent modifier le statut des amitiés où ils sont addressee (accepter/refuser)
-- Ou modifier leurs propres demandes envoyées (annuler)
CREATE POLICY "Users can update their friendships"
  ON public.friendships FOR UPDATE
  USING (
    auth.uid() = addressee_id OR 
    auth.uid() = requester_id
  )
  WITH CHECK (
    auth.uid() = addressee_id OR 
    auth.uid() = requester_id
  );

-- 6. Politique de SUPPRESSION (DELETE)
-- Les utilisateurs peuvent supprimer les amitiés où ils sont impliqués
CREATE POLICY "Users can delete their friendships"
  ON public.friendships FOR DELETE
  USING (
    auth.uid() = requester_id OR 
    auth.uid() = addressee_id
  );

-- 7. Vérifier que les politiques sont bien créées
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'friendships'
ORDER BY policyname;

-- 8. Test simple pour vérifier les permissions
-- (À exécuter après avoir configuré un utilisateur)
-- SELECT 'RLS configuré correctement' as status; 