import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUPABASE_CONFIG, validateSupabaseConfig } from '../config/supabase';

/**
 * Service Supabase pour l'authentification et la gestion des données
 * 
 * Fonctionnalités:
 * - Authentification (inscription, connexion, déconnexion)
 * - Gestion des profils utilisateur
 * - Sauvegarde et récupération des trajets
 * - Synchronisation des données
 */
class SupabaseService {
  constructor() {
    this.supabase = null;
    this.currentUser = null;
    this.isInitialized = false;
    this.listeners = new Set();
    
    // Auto-initialisation avec la configuration par défaut
    this.autoInitialize();
  }

  /**
   * Auto-initialisation du service avec la configuration par défaut
   */
  async autoInitialize() {
    try {
      console.log('🔄 [SUPABASE] Auto-initialisation en cours...');
      
      // Valider la configuration avant l'initialisation
      if (!validateSupabaseConfig()) {
        throw new Error('Configuration Supabase invalide');
      }
      
      await this.initialize(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
      console.log('✅ [SUPABASE] Auto-initialisation réussie');
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur auto-initialisation:', error);
      console.error('💡 Vérifiez votre configuration dans src/config/supabase.js');
      // Ne pas rejeter l'erreur pour permettre à l'app de démarrer
    }
  }

  /**
   * S'assurer que le service est initialisé avant toute opération
   */
  async _ensureInitialized() {
    if (!this.isInitialized && !this.supabase) {
      console.log('🔄 [SUPABASE] Initialisation en cours...');
      await this.autoInitialize();
    }
    
    if (!this.supabase) {
      throw new Error('Service Supabase non initialisé. Vérifiez votre configuration dans src/config/supabase.js');
    }
  }

  /**
   * Initialiser le service avec les informations de connexion
   * @param {string} supabaseUrl - URL de votre projet Supabase
   * @param {string} supabaseAnonKey - Clé publique anonyme Supabase
   */
  async initialize(supabaseUrl, supabaseAnonKey) {
    try {
      console.log('🔑 [SUPABASE] Initialisation du service...');
      
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('URL Supabase et clé anonyme requis');
      }
      
      // Créer le client Supabase
      this.supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      });
      
      // Écouter les changements d'authentification
      this.supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('🔑 [SUPABASE] Changement auth:', event, session?.user?.email);
        
        if (session?.user) {
          this.currentUser = session.user;
          await this._loadUserProfile();
        } else {
          this.currentUser = null;
        }
        
        this._notifyListeners(event, session);
      });
      
      // Vérifier si un utilisateur est déjà connecté
      const { data: { session } } = await this.supabase.auth.getSession();
      if (session?.user) {
        this.currentUser = session.user;
        await this._loadUserProfile();
      }
      
      this.isInitialized = true;
      console.log('✅ [SUPABASE] Service initialisé avec succès');
      
      return true;
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur initialisation:', error);
      throw error;
    }
  }

  /**
   * Inscrire un nouvel utilisateur
   */
  async signUp(email, password, userData = {}) {
    try {
      await this._ensureInitialized();
      
      // Si pas d'email fourni, basculer en mode anonyme
      if (!email || email.trim() === '') {
        console.log('📝 [SUPABASE] Redirection vers inscription anonyme');
        return await this.signUpAnonymous(userData);
      }
      
      console.log('📝 [SUPABASE] Inscription utilisateur avec email:', email);
      
      const { data, error } = await this.supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            ...userData,
            created_at: new Date().toISOString(),
          }
        }
      });
      
      if (error) throw error;
      
      // S'assurer que l'utilisateur est connecté
      if (data.user && data.session) {
        this.currentUser = data.user;
        
        console.log('📝 [SUPABASE] Utilisateur créé, appel _createUserProfile...');
        // Créer le profil utilisateur dans la table profiles
        await this._createUserProfile(data.user, userData);
        console.log('📝 [SUPABASE] Profil créé avec succès');
      }
      
      console.log('✅ [SUPABASE] Inscription réussie');
      return { user: data.user, session: data.session };
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur inscription:', error);
      throw error;
    }
  }

  /**
   * Inscription anonyme (NOUVEAU) - pour les utilisateurs sans email
   * Compatible avec Supabase v2.42+
   */
  async signUpAnonymous(userData = {}) {
    try {
      await this._ensureInitialized();
      
      console.log('👤 [SUPABASE] Inscription anonyme utilisateur:', userData.username);
      
      const { data, error } = await this.supabase.auth.signInAnonymously({
        options: {
          data: {
            ...userData,
            display_name: userData.username,
            full_name: userData.username,
            created_at: new Date().toISOString(),
            is_anonymous: true
          }
        }
      });
      
      if (error) throw error;
      
      if (data.user && data.session) {
        this.currentUser = data.user;
        
        await this.supabase.auth.updateUser({
          data: {
            display_name: userData.username,
            username: userData.username
          }
        });
        
        console.log('👤 [SUPABASE] Utilisateur anonyme créé, appel _createUserProfile...');
        await this._createUserProfile(data.user, userData);
        console.log('👤 [SUPABASE] Profil anonyme créé avec succès');
      }
      
      console.log('✅ [SUPABASE] Inscription anonyme réussie avec display_name:', userData.username);
      return { user: data.user, session: data.session };
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur inscription anonyme:', error);
      throw error;
    }
  }

  /**
   * Connecter un utilisateur
   */
  async signIn(email, password) {
    try {
      await this._ensureInitialized();
      
      console.log('🔐 [SUPABASE] Connexion utilisateur:', email);
      
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) throw error;
      
      console.log('✅ [SUPABASE] Connexion réussie');
      return { user: data.user, session: data.session };
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur connexion:', error);
      throw error;
    }
  }

  /**
   * Déconnecter l'utilisateur
   */
  async signOut() {
    try {
      await this._ensureInitialized();
      
      console.log('🚪 [SUPABASE] Déconnexion...');
      
      const { error } = await this.supabase.auth.signOut();
      if (error) throw error;
      
      this.currentUser = null;
      console.log('✅ [SUPABASE] Déconnexion réussie');
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur déconnexion:', error);
      throw error;
    }
  }

  /**
   * Sauvegarder un trajet
   */
  async saveTrajectory(trajectoryData) {
    try {
      await this._ensureInitialized();
      
      if (!this.currentUser) {
        throw new Error('Utilisateur non connecté');
      }
      
      console.log('💾 [SUPABASE] Sauvegarde trajet...');
      
      const trajectoryRecord = {
        user_id: this.currentUser.id,
        name: trajectoryData.name || `Trajet ${new Date().toLocaleDateString()}`,
        description: trajectoryData.description || '',
        trajectory_data: trajectoryData.trajectory,
        step_count: trajectoryData.stepCount,
        total_distance: trajectoryData.distance,
        duration: trajectoryData.duration,
        start_time: trajectoryData.startTime,
        end_time: trajectoryData.endTime,
        created_at: new Date().toISOString(),
        metadata: {
          algorithm_version: trajectoryData.algorithmVersion || '1.0',
          device_info: trajectoryData.deviceInfo || {},
          accuracy_stats: trajectoryData.accuracyStats || {}
        }
      };
      
      const { data, error } = await this.supabase
        .from('trajectories')
        .insert([trajectoryRecord])
        .select();
      
      if (error) throw error;
      
      console.log('✅ [SUPABASE] Trajet sauvegardé:', data[0].id);
      return data[0];
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur sauvegarde trajet:', error);
      throw error;
    }
  }

  /**
   * Récupérer les trajets de l'utilisateur
   */
  async getUserTrajectories(limit = 50, offset = 0) {
    try {
      await this._ensureInitialized();
      
      if (!this.currentUser) {
        throw new Error('Utilisateur non connecté');
      }
      
      console.log('📥 [SUPABASE] Récupération trajets...');
      
      const { data, error } = await this.supabase
        .from('trajectories')
        .select('*')
        .eq('user_id', this.currentUser.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      
      if (error) throw error;
      
      console.log(`✅ [SUPABASE] ${data.length} trajets récupérés`);
      return data;
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur récupération trajets:', error);
      throw error;
    }
  }

  /**
   * Supprimer un trajet
   */
  async deleteTrajectory(trajectoryId) {
    try {
      await this._ensureInitialized();
      
      if (!this.currentUser) {
        throw new Error('Utilisateur non connecté');
      }
      
      console.log('🗑️ [SUPABASE] Suppression trajet:', trajectoryId);
      
      const { error } = await this.supabase
        .from('trajectories')
        .delete()
        .eq('id', trajectoryId)
        .eq('user_id', this.currentUser.id);
      
      if (error) throw error;
      
      console.log('✅ [SUPABASE] Trajet supprimé');
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur suppression trajet:', error);
      throw error;
    }
  }

  /**
   * Obtenir le profil utilisateur
   */
  async getUserProfile() {
    try {
      await this._ensureInitialized();
      
      if (!this.currentUser) {
        throw new Error('Utilisateur non connecté');
      }
      
      console.log('👤 [SUPABASE] Récupération profil utilisateur...');
      
      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('user_id', this.currentUser.id)
        .single();
      
      if (error && error.code === 'PGRST116') { // No rows found
        console.log('⚠️ [SUPABASE] Profil non trouvé, création automatique...');
        return await this.ensureUserProfile();
      }
      
      if (error) {
        throw error;
      }
      
      console.log('✅ [SUPABASE] Profil récupéré avec succès');
      return data;
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur récupération profil:', error);
      throw error;
    }
  }

  /**
   * Ajouter un email à un compte anonyme ou mettre à jour l'email (NOUVEAU)
   * Cette méthode convertit un compte anonyme en compte avec email + password
   */
  async addEmailToAccount(email, password) {
    try {
      await this._ensureInitialized();
      
      if (!this.currentUser) {
        throw new Error('Utilisateur non connecté');
      }
      
      // Validation de l'email
      if (!email || !email.includes('@')) {
        throw new Error('Format d\'email invalide');
      }
      
      if (!password || password.length < 6) {
        throw new Error('Le mot de passe doit contenir au moins 6 caractères');
      }
      
      console.log('📧 [SUPABASE] Ajout email au compte anonyme...');
      
      // Mettre à jour l'utilisateur avec email + password (conversion du compte anonyme)
      const { data, error } = await this.supabase.auth.updateUser({
        email: email,
        password: password,
        data: {
          has_email_added: true,
          email_added_at: new Date().toISOString()
        }
      });
      
      if (error) throw error;
      
      // Mettre à jour le profil avec le flag has_real_email
      await this.updateUserProfile({
        email: email,
        has_real_email: true
      });
      
      console.log('✅ [SUPABASE] Email ajouté avec succès - confirmation envoyée');
      return {
        user: data.user,
        needsEmailConfirmation: true,
        message: 'Un email de confirmation a été envoyé à votre adresse email.'
      };
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur ajout email:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour l'email de l'utilisateur (méthode existante simplifiée)
   */
  async updateUserEmail(newEmail) {
    try {
      await this._ensureInitialized();
      
      if (!this.currentUser) {
        throw new Error('Utilisateur non connecté');
      }
      
      // Validation de l'email
      if (!newEmail || !newEmail.includes('@')) {
        throw new Error('Format d\'email invalide');
      }
      
      console.log('📧 [SUPABASE] Mise à jour email utilisateur...');
      
      // Mettre à jour l'email dans Supabase Auth
      const { data, error } = await this.supabase.auth.updateUser({
        email: newEmail
      });
      
      if (error) throw error;
      
      // Mettre à jour le profil avec le flag has_real_email
      await this.updateUserProfile({
        email: newEmail,
        has_real_email: true
      });
      
      console.log('✅ [SUPABASE] Email mis à jour avec succès');
      return {
        user: data.user,
        needsEmailConfirmation: true,
        message: 'Un email de confirmation a été envoyé à votre nouvelle adresse.'
      };
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur mise à jour email:', error);
      throw error;
    }
  }

  /**
   * Créer le profil utilisateur dans la table profiles
   */
  async _createUserProfile(user, userData) {
    try {
      console.log('👤 [SUPABASE] ==================== DEBUT CREATION PROFIL ====================');
      console.log('👤 [SUPABASE] User ID:', user.id);
      console.log('👤 [SUPABASE] UserData reçu:', userData);
      
      const profileToCreate = {
        user_id: user.id,
        email: userData.actualEmail || '',
        username: userData.username || user.email?.split('@')[0] || `user_${Date.now()}`,
        biography: userData.biography || '',
        profile_image_url: null,
        height: userData.height || 170,
        has_real_email: userData.hasRealEmail || false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      console.log('👤 [SUPABASE] Profil à créer:', profileToCreate);

      const { data, error } = await this.supabase
        .from('profiles')
        .insert([profileToCreate])
        .select();
      
      console.log('👤 [SUPABASE] Résultat insertion:', { data, error });
      
      if (error) {
        console.error('❌ [SUPABASE] Erreur détaillée lors de l\'insertion:', error);
        throw error;
      }
      
      console.log('✅ [SUPABASE] Profil utilisateur créé avec succès');
      console.log('✅ [SUPABASE] Username:', userData.username, 'Email:', userData.actualEmail || 'VIDE', 'Has_real_email:', userData.hasRealEmail);
      console.log('👤 [SUPABASE] ==================== FIN CREATION PROFIL ====================');
      return data[0];
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur création profil:', error);
      console.error('❌ [SUPABASE] Stack trace:', error.stack);
      throw error;
    }
  }

  /**
   * Charger le profil utilisateur
   */
  async _loadUserProfile() {
    try {
      if (!this.currentUser) return null;
      
      console.log('🔄 [SUPABASE] Chargement profil utilisateur...');
      
      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('user_id', this.currentUser.id)
        .single();
      
      if (error && error.code === 'PGRST116') { // No rows found
        console.log('⚠️ [SUPABASE] Profil non trouvé lors du chargement, création automatique...');
        return await this.ensureUserProfile();
      }
      
      if (error) {
        console.error('❌ [SUPABASE] Erreur chargement profil:', error);
        return null;
      }
      
      console.log('✅ [SUPABASE] Profil chargé avec succès');
      return data;
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur chargement profil:', error);
      return null;
    }
  }

  /**
   * Mettre à jour le profil utilisateur
   */
  async updateUserProfile(profileData) {
    try {
      await this._ensureInitialized();
      
      if (!this.currentUser) {
        throw new Error('Utilisateur non connecté');
      }
      
      console.log('👤 [SUPABASE] Mise à jour profil...');
      
      const { data, error } = await this.supabase
        .from('profiles')
        .update({
          ...profileData,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', this.currentUser.id)
        .select();
      
      if (error) throw error;
      
      console.log('✅ [SUPABASE] Profil mis à jour');
      return data[0];
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur mise à jour profil:', error);
      throw error;
    }
  }

  /**
   * Ajouter un listener pour les changements d'authentification
   */
  addAuthListener(callback) {
    this.listeners.add(callback);
    
    // Retourner une fonction pour supprimer le listener
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Notifier tous les listeners
   */
  _notifyListeners(event, session) {
    this.listeners.forEach(callback => {
      try {
        callback(event, session);
      } catch (error) {
        console.error('❌ [SUPABASE] Erreur listener:', error);
      }
    });
  }

  /**
   * Obtenir l'utilisateur actuel
   */
  getCurrentUser() {
    return this.currentUser;
  }

  /**
   * Vérifier si l'utilisateur est connecté
   */
  isAuthenticated() {
    return !!this.currentUser;
  }

  /**
   * Obtenir les statistiques de l'utilisateur
   */
  async getUserStats() {
    try {
      await this._ensureInitialized();
      
      if (!this.currentUser) {
        throw new Error('Utilisateur non connecté');
      }
      
      const { data, error } = await this.supabase
        .from('trajectories')
        .select('step_count, total_distance, duration')
        .eq('user_id', this.currentUser.id);
      
      if (error) throw error;
      
      const stats = data.reduce((acc, trajectory) => ({
        totalSteps: acc.totalSteps + (trajectory.step_count || 0),
        totalDistance: acc.totalDistance + (trajectory.total_distance || 0),
        totalDuration: acc.totalDuration + (trajectory.duration || 0),
        totalTrajectories: acc.totalTrajectories + 1,
      }), {
        totalSteps: 0,
        totalDistance: 0,
        totalDuration: 0,
        totalTrajectories: 0,
      });
      
      return stats;
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur statistiques:', error);
      throw error;
    }
  }

  /**
   * Connecter un utilisateur par username (pour les utilisateurs sans email réel)
   */
  async signInWithUsername(username, password) {
    try {
      await this._ensureInitialized();
      
      console.log('🔐 [SUPABASE] Recherche utilisateur par username:', username);
      
      // Trouver l'utilisateur dans la table profiles
      const { data: profile, error: profileError } = await this.supabase
        .from('profiles')
        .select('user_id, email, has_real_email')
        .eq('username', username)
        .single();
      
      if (profileError || !profile) {
        throw new Error('Nom d\'utilisateur introuvable');
      }
      
      // Vérifier si l'utilisateur a un email pour la connexion
      if (!profile.has_real_email || !profile.email) {
        throw new Error('Utilisateur anonyme - connexion par mot de passe non disponible. Utilisez la conversion de compte.');
      }
      
      // Utiliser l'email stocké dans le profil
      const userEmail = profile.email;
      
      console.log('📧 [SUPABASE] Email utilisateur récupéré:', userEmail);
      
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email: userEmail,
        password,
      });
      
      if (error) throw error;
      
      console.log('✅ [SUPABASE] Connexion par username réussie');
      return { user: data.user, session: data.session };
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur connexion par username:', error);
      throw error;
    }
  }

  /**
   * NOUVEAU: Uploader une photo de profil vers Supabase Storage
   */
  async uploadProfileImage(imageUri) {
    try {
      await this._ensureInitialized();
      
      if (!this.currentUser) {
        throw new Error('Utilisateur non connecté');
      }

      console.log('📸 [SUPABASE] Upload photo de profil...');
      
      // Créer un nom de fichier unique
      const fileExt = imageUri.split('.').pop();
      const fileName = `${this.currentUser.id}/profile.${fileExt}`;
      
      // Convertir l'image en blob pour l'upload
      const response = await fetch(imageUri);
      const blob = await response.blob();
      
      // Upload vers Supabase Storage
      const { data, error } = await this.supabase.storage
        .from('profile-images')
        .upload(fileName, blob, {
          cacheControl: '3600',
          upsert: true // Remplacer si existe déjà
        });
      
      if (error) throw error;
      
      // Obtenir l'URL publique
      const { data: { publicUrl } } = this.supabase.storage
        .from('profile-images')
        .getPublicUrl(fileName);
      
      // Mettre à jour le profil avec la nouvelle URL
      await this.updateUserProfile({
        profile_image_url: publicUrl
      });
      
      console.log('✅ [SUPABASE] Photo de profil uploadée:', publicUrl);
      return publicUrl;
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur upload photo:', error);
      throw error;
    }
  }

  /**
   * NOUVEAU: Supprimer la photo de profil
   */
  async deleteProfileImage() {
    try {
      await this._ensureInitialized();
      
      if (!this.currentUser) {
        throw new Error('Utilisateur non connecté');
      }

      console.log('🗑️ [SUPABASE] Suppression photo de profil...');
      
      // Supprimer du storage
      const fileName = `${this.currentUser.id}/profile.jpg`; // On essaie jpg par défaut
      await this.supabase.storage
        .from('profile-images')
        .remove([fileName]);
      
      // Mettre à jour le profil
      await this.updateUserProfile({
        profile_image_url: null
      });
      
      console.log('✅ [SUPABASE] Photo de profil supprimée');
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur suppression photo:', error);
      throw error;
    }
  }

  /**
   * NOUVEAU: Rechercher des utilisateurs par pseudo (OPTIMISÉ)
   */
  async searchUsersByUsername(query, limit = 10) {
    try {
      await this._ensureInitialized();
      
      if (!query.trim()) {
        return [];
      }
      
      // Minimum 3 caractères pour déclencher la recherche
      if (query.trim().length < 3) {
        return [];
      }
      
      if (!this.currentUser) {
        throw new Error('Utilisateur non connecté');
      }
      
      console.log('🔍 [SUPABASE] Recherche utilisateurs:', query);
      
      // Recherche directe avec filtrage
      const { data: results, error } = await this.supabase
        .from('profiles')
        .select('user_id, username, biography, profile_image_url')
        .ilike('username', `%${query.trim()}%`)
        .neq('user_id', this.currentUser.id) // Exclure l'utilisateur connecté
        .limit(limit);
      
      if (error) {
        console.error('❌ [SUPABASE] Erreur recherche:', error);
        throw error;
      }
      
      // Filtrer les user_id NULL côté client (sécurité)
      const users = results ? results.filter(user => user.user_id !== null) : [];
      
      console.log('✅ [SUPABASE] Recherche terminée:', users.length, 'résultats');
      return users;
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur recherche utilisateurs:', error);
      throw error;
    }
  }

  /**
   * NOUVEAU: Envoyer une demande d'ami (AMÉLIORÉ avec vérifications)
   */
  async sendFriendRequest(targetUserId) {
    try {
      await this._ensureInitialized();
      
      if (!this.currentUser) {
        throw new Error('Utilisateur non connecté');
      }
      
      if (targetUserId === this.currentUser.id) {
        throw new Error('Impossible de s\'ajouter soi-même');
      }
      
      console.log('👋 [SUPABASE] Envoi demande d\'ami vers:', targetUserId);
      
      // Vérifier qu'une relation n'existe pas déjà (MÉTHODE SIMPLIFIÉE)
      // Vérification 1: currentUser -> targetUser
      const { data: relation1, error: checkError1 } = await this.supabase
        .from('friendships')
        .select('*')
        .eq('requester_id', this.currentUser.id)
        .eq('addressee_id', targetUserId)
        .maybeSingle();
      
      if (checkError1) throw checkError1;
      
      // Vérification 2: targetUser -> currentUser
      const { data: relation2, error: checkError2 } = await this.supabase
        .from('friendships')
        .select('*')
        .eq('requester_id', targetUserId)
        .eq('addressee_id', this.currentUser.id)
        .maybeSingle();
      
      if (checkError2) throw checkError2;
      
      const existingRelation = relation1 || relation2;
      
      if (existingRelation) {
        if (existingRelation.status === 'accepted') {
          throw new Error('Vous êtes déjà amis avec cet utilisateur');
        } else if (existingRelation.status === 'pending') {
          if (existingRelation.requester_id === this.currentUser.id) {
            throw new Error('Demande déjà envoyée à cet utilisateur');
          } else {
            throw new Error('Cet utilisateur vous a déjà envoyé une demande');
          }
        } else if (existingRelation.status === 'blocked') {
          throw new Error('Impossible d\'envoyer une demande à cet utilisateur');
        }
      }
      
      // Vérifier que l'utilisateur cible existe
      const { data: targetUser, error: userError } = await this.supabase
        .from('profiles')
        .select('username')
        .eq('user_id', targetUserId)
        .single();
      
      if (userError || !targetUser) {
        throw new Error('Utilisateur introuvable');
      }
      
      // Créer la demande d'ami
      const { data, error } = await this.supabase
        .from('friendships')
        .insert([{
          requester_id: this.currentUser.id,
          addressee_id: targetUserId,
          status: 'pending'
        }])
        .select();
      
      if (error) throw error;
      
      console.log('✅ [SUPABASE] Demande d\'ami envoyée à:', targetUser.username);
      return data[0];
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur envoi demande d\'ami:', error);
      throw error;
    }
  }

  /**
   * NOUVEAU: Obtenir la liste des amis (CORRIGÉ)
   */
  async getFriends() {
    try {
      await this._ensureInitialized();
      
      if (!this.currentUser) {
        throw new Error('Utilisateur non connecté');
      }
      
      console.log('👥 [SUPABASE] Récupération liste d\'amis...');
      
      // Récupérer les amitiés acceptées avec deux requêtes séparées
      // Amitiés où l'utilisateur est le requester
      const { data: friendships1, error: error1 } = await this.supabase
        .from('friendships')
        .select('*')
        .eq('status', 'accepted')
        .eq('requester_id', this.currentUser.id);
      
      if (error1) throw error1;
      
      // Amitiés où l'utilisateur est l'addressee
      const { data: friendships2, error: error2 } = await this.supabase
        .from('friendships')
        .select('*')
        .eq('status', 'accepted')
        .eq('addressee_id', this.currentUser.id);
      
      if (error2) throw error2;
      
      // Combiner les deux listes
      const friendships = [...(friendships1 || []), ...(friendships2 || [])];
      
      // Récupérer les profils des amis
      const friendUserIds = friendships.map(friendship => {
        return friendship.requester_id === this.currentUser.id 
          ? friendship.addressee_id 
          : friendship.requester_id;
      });
      
      if (friendUserIds.length === 0) {
        console.log('✅ [SUPABASE] Amis récupérés: 0');
        return [];
      }
      
      const { data: profiles, error: profilesError } = await this.supabase
        .from('profiles')
        .select('user_id, username, biography, profile_image_url')
        .in('user_id', friendUserIds);
      
      if (profilesError) throw profilesError;
      
      // Combiner les données
      const friends = friendships.map(friendship => {
        const friendUserId = friendship.requester_id === this.currentUser.id 
          ? friendship.addressee_id 
          : friendship.requester_id;
        
        const friendProfile = profiles.find(p => p.user_id === friendUserId);
        
        return {
          friendshipId: friendship.id,
          user: {
            user_id: friendUserId,
            username: friendProfile?.username || 'Utilisateur inconnu',
            biography: friendProfile?.biography || '',
            profile_image_url: friendProfile?.profile_image_url || null
          },
          since: friendship.created_at
        };
      });
      
      console.log('✅ [SUPABASE] Amis récupérés:', friends.length);
      return friends;
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur récupération amis:', error);
      throw error;
    }
  }

  /**
   * NOUVEAU: Obtenir les demandes d'ami reçues (CORRIGÉ)
   */
  async getFriendRequests() {
    try {
      await this._ensureInitialized();
      
      if (!this.currentUser) {
        throw new Error('Utilisateur non connecté');
      }
      
      console.log('📨 [SUPABASE] Récupération demandes d\'ami...');
      
      // Récupérer les demandes en attente
      const { data: requests, error } = await this.supabase
        .from('friendships')
        .select('*')
        .eq('addressee_id', this.currentUser.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      if (requests.length === 0) {
        console.log('✅ [SUPABASE] Demandes d\'ami récupérées: 0');
        return [];
      }
      
      // Récupérer les profils des demandeurs
      const requesterIds = requests.map(req => req.requester_id);
      
      const { data: profiles, error: profilesError } = await this.supabase
        .from('profiles')
        .select('user_id, username, biography, profile_image_url')
        .in('user_id', requesterIds);
      
      if (profilesError) throw profilesError;
      
      // Combiner les données
      const friendRequests = requests.map(request => {
        const requesterProfile = profiles.find(p => p.user_id === request.requester_id);
        
        return {
          id: request.id,
          status: request.status,
          created_at: request.created_at,
          requester_id: request.requester_id,
          requester: {
            user_id: request.requester_id,
            username: requesterProfile?.username || 'Utilisateur inconnu',
            biography: requesterProfile?.biography || '',
            profile_image_url: requesterProfile?.profile_image_url || null
          }
        };
      });
      
      console.log('✅ [SUPABASE] Demandes d\'ami récupérées:', friendRequests.length);
      return friendRequests;
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur récupération demandes:', error);
      throw error;
    }
  }

  /**
   * NOUVEAU: Obtenir les demandes d'ami envoyées (CORRIGÉ)
   */
  async getSentFriendRequests() {
    try {
      await this._ensureInitialized();
      
      if (!this.currentUser) {
        throw new Error('Utilisateur non connecté');
      }
      
      console.log('📤 [SUPABASE] Récupération demandes envoyées...');
      
      // Récupérer les demandes envoyées
      const { data: sent, error } = await this.supabase
        .from('friendships')
        .select('*')
        .eq('requester_id', this.currentUser.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      if (sent.length === 0) {
        console.log('✅ [SUPABASE] Demandes envoyées récupérées: 0');
        return [];
      }
      
      // Récupérer les profils des destinataires
      const addresseeIds = sent.map(req => req.addressee_id);
      
      const { data: profiles, error: profilesError } = await this.supabase
        .from('profiles')
        .select('user_id, username, biography, profile_image_url')
        .in('user_id', addresseeIds);
      
      if (profilesError) throw profilesError;
      
      // Combiner les données
      const sentRequests = sent.map(request => {
        const addresseeProfile = profiles.find(p => p.user_id === request.addressee_id);
        
        return {
          id: request.id,
          status: request.status,
          created_at: request.created_at,
          addressee_id: request.addressee_id,
          addressee: {
            user_id: request.addressee_id,
            username: addresseeProfile?.username || 'Utilisateur inconnu',
            biography: addresseeProfile?.biography || '',
            profile_image_url: addresseeProfile?.profile_image_url || null
          }
        };
      });
      
      console.log('✅ [SUPABASE] Demandes envoyées récupérées:', sentRequests.length);
      return sentRequests;
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur récupération demandes envoyées:', error);
      throw error;
    }
  }

  /**
   * NOUVEAU: Vérifier le statut de relation avec un utilisateur
   */
  async checkFriendshipStatus(userId) {
    try {
      await this._ensureInitialized();
      
      if (!this.currentUser) {
        throw new Error('Utilisateur non connecté');
      }
      
      // Vérification simplifiée avec deux requêtes
      // Vérification 1: currentUser -> targetUser
      const { data: relation1, error: error1 } = await this.supabase
        .from('friendships')
        .select('status, requester_id, addressee_id')
        .eq('requester_id', this.currentUser.id)
        .eq('addressee_id', userId)
        .maybeSingle();
      
      if (error1) throw error1;
      
      // Vérification 2: targetUser -> currentUser
      const { data: relation2, error: error2 } = await this.supabase
        .from('friendships')
        .select('status, requester_id, addressee_id')
        .eq('requester_id', userId)
        .eq('addressee_id', this.currentUser.id)
        .maybeSingle();
      
      if (error2) throw error2;
      
      const data = relation1 || relation2;
      
      if (!data) {
        return { status: 'none', canSendRequest: true };
      }
      
      const isRequester = data.requester_id === this.currentUser.id;
      
      return {
        status: data.status,
        isRequester,
        canSendRequest: false,
        canAccept: !isRequester && data.status === 'pending'
      };
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur vérification statut amitié:', error);
      throw error;
    }
  }

  /**
   * NOUVEAU: Répondre à une demande d'ami (AMÉLIORÉ)
   */
  async respondToFriendRequest(friendshipId, response) {
    try {
      await this._ensureInitialized();
      
      if (!this.currentUser) {
        throw new Error('Utilisateur non connecté');
      }
      
      if (!['accepted', 'declined'].includes(response)) {
        throw new Error('Réponse invalide (accepted ou declined attendu)');
      }
      
      console.log('✅ [SUPABASE] Réponse à la demande d\'ami:', response);
      
      // Vérifier que la demande existe et que l'utilisateur est bien l'addressee
      const { data: friendship, error: checkError } = await this.supabase
        .from('friendships')
        .select('*')
        .eq('id', friendshipId)
        .eq('addressee_id', this.currentUser.id)
        .eq('status', 'pending')
        .single();
      
      if (checkError || !friendship) {
        throw new Error('Demande d\'ami introuvable ou déjà traitée');
      }
      
      const { data, error } = await this.supabase
        .from('friendships')
        .update({ status: response })
        .eq('id', friendshipId)
        .select();
      
      if (error) throw error;
      
      console.log('✅ [SUPABASE] Réponse enregistrée:', response);
      return data[0];
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur réponse demande:', error);
      throw error;
    }
  }

  /**
   * NOUVEAU: Supprimer un ami (AMÉLIORÉ)
   */
  async removeFriend(friendshipId) {
    try {
      await this._ensureInitialized();
      
      if (!this.currentUser) {
        throw new Error('Utilisateur non connecté');
      }
      
      console.log('💔 [SUPABASE] Suppression ami...');
      
      // Vérifier que l'amitié existe et que l'utilisateur en fait partie (MÉTHODE SIMPLIFIÉE)
      const { data: friendship, error: checkError } = await this.supabase
        .from('friendships')
        .select('*')
        .eq('id', friendshipId)
        .single();
      
      if (checkError || !friendship) {
        throw new Error('Amitié introuvable');
      }
      
      // Vérifier que l'utilisateur fait partie de cette amitié
      if (friendship.requester_id !== this.currentUser.id && friendship.addressee_id !== this.currentUser.id) {
        throw new Error('Accès non autorisé - vous ne faites pas partie de cette amitié');
      }
      
      const { error } = await this.supabase
        .from('friendships')
        .delete()
        .eq('id', friendshipId);
      
      if (error) throw error;
      
      console.log('✅ [SUPABASE] Ami supprimé');
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur suppression ami:', error);
      throw error;
    }
  }

  /**
   * NOUVEAU: Annuler une demande d'ami envoyée
   */
  async cancelFriendRequest(friendshipId) {
    try {
      await this._ensureInitialized();
      
      if (!this.currentUser) {
        throw new Error('Utilisateur non connecté');
      }
      
      console.log('🚫 [SUPABASE] Annulation demande d\'ami...');
      
      const { error } = await this.supabase
        .from('friendships')
        .delete()
        .eq('id', friendshipId)
        .eq('requester_id', this.currentUser.id)
        .eq('status', 'pending');
      
      if (error) throw error;
      
      console.log('✅ [SUPABASE] Demande d\'ami annulée');
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur annulation demande:', error);
      throw error;
    }
  }

  /**
   * NOUVEAU: S'assurer qu'un profil utilisateur existe, le créer si nécessaire
   */
  async ensureUserProfile() {
    try {
      await this._ensureInitialized();
      
      if (!this.currentUser) {
        throw new Error('Utilisateur non connecté');
      }
      
      console.log('🔍 [SUPABASE] Vérification existence profil...');
      
      // Vérifier si le profil existe
      const { data: existingProfile, error: checkError } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('user_id', this.currentUser.id)
        .maybeSingle();
      
      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }
      
      if (existingProfile) {
        console.log('✅ [SUPABASE] Profil existe déjà');
        return existingProfile;
      }
      
      console.log('⚠️ [SUPABASE] Profil manquant, création automatique...');
      
      // Créer le profil avec les données disponibles dans currentUser
      const userData = {
        username: this.currentUser.user_metadata?.username || 
                  this.currentUser.user_metadata?.display_name ||
                  this.currentUser.email?.split('@')[0] || 
                  `user_${Date.now()}`,
        height: this.currentUser.user_metadata?.height || 170,
        actualEmail: this.currentUser.email || null,
        hasRealEmail: !!this.currentUser.email,
        biography: ''
      };
      
      const newProfile = await this._createUserProfile(this.currentUser, userData);
      console.log('✅ [SUPABASE] Profil créé avec succès lors de la vérification');
      return newProfile;
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur vérification/création profil:', error);
      throw error;
    }
  }
}

// Instance singleton
export const supabaseService = new SupabaseService();
export default supabaseService; 