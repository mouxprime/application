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
      console.log('📝 [SUPABASE] Inscription utilisateur:', email);
      
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
        
        // Créer le profil utilisateur dans la table profiles
        await this._createUserProfile(data.user, userData);
      }
      
      console.log('✅ [SUPABASE] Inscription réussie');
      return { user: data.user, session: data.session };
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur inscription:', error);
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
      
      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('user_id', this.currentUser.id)
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur récupération profil:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour l'email de l'utilisateur
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
      return data;
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur mise à jour email:', error);
      throw error;
    }
  }

  /**
   * Créer le profil utilisateur après inscription
   */
  async _createUserProfile(user, userData) {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .insert([{
          user_id: user.id,
          email: userData.actualEmail,
          username: userData.username || user.email.split('@')[0],
          height: userData.height || 170,
          weight: userData.weight || 70,
          age: userData.age || 30,
          gender: userData.gender || 'unspecified',
          has_real_email: userData.hasRealEmail || false,
          supabase_email: user.email,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }])
        .select();
      
      if (error) throw error;
      
      console.log('✅ [SUPABASE] Profil utilisateur créé avec username:', userData.username, 'email:', userData.actualEmail || 'NULL', 'supabase_email:', user.email);
      return data[0];
    } catch (error) {
      console.error('❌ [SUPABASE] Erreur création profil:', error);
      throw error;
    }
  }

  /**
   * Charger le profil utilisateur
   */
  async _loadUserProfile() {
    try {
      if (!this.currentUser) return null;
      
      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('user_id', this.currentUser.id)
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        throw error;
      }
      
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
      
      // Trouver l'utilisateur dans la table profiles avec son email Supabase
      const { data: profile, error: profileError } = await this.supabase
        .from('profiles')
        .select('user_id, supabase_email')
        .eq('username', username)
        .single();
      
      if (profileError || !profile) {
        throw new Error('Nom d\'utilisateur introuvable');
      }
      
      // Utiliser l'email Supabase stocké dans le profil
      const supabaseEmail = profile.supabase_email;
      
      console.log('📧 [SUPABASE] Email Supabase récupéré:', supabaseEmail);
      
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email: supabaseEmail,
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
}

// Instance singleton
export const supabaseService = new SupabaseService();
export default supabaseService; 