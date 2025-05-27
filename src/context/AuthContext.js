import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SVGExporter } from '../utils/SVGExporter';

// Actions du reducer
const AUTH_ACTIONS = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  REGISTER: 'REGISTER',
  SAVE_TRAJECTORY: 'SAVE_TRAJECTORY',
  DELETE_TRAJECTORY: 'DELETE_TRAJECTORY',
  SET_LOADING: 'SET_LOADING',
  SET_ERROR: 'SET_ERROR'
};

// État initial
const initialState = {
  isAuthenticated: false,
  user: null,
  trajectories: [],
  isLoading: false,
  error: null
};

// Reducer pour gérer l'état d'authentification
function authReducer(state, action) {
  switch (action.type) {
    case AUTH_ACTIONS.LOGIN:
      return {
        ...state,
        isAuthenticated: true,
        user: action.payload.user,
        trajectories: action.payload.trajectories || [],
        error: null
      };
      
    case AUTH_ACTIONS.LOGOUT:
      return {
        ...state,
        isAuthenticated: false,
        user: null,
        trajectories: [],
        error: null
      };
      
    case AUTH_ACTIONS.REGISTER:
      return {
        ...state,
        isAuthenticated: true,
        user: action.payload.user,
        trajectories: [],
        error: null
      };
      
    case AUTH_ACTIONS.SAVE_TRAJECTORY:
      return {
        ...state,
        trajectories: [...state.trajectories, action.payload]
      };
      
    case AUTH_ACTIONS.DELETE_TRAJECTORY:
      return {
        ...state,
        trajectories: state.trajectories.filter(t => t.id !== action.payload)
      };
      
    case AUTH_ACTIONS.SET_LOADING:
      return {
        ...state,
        isLoading: action.payload
      };
      
    case AUTH_ACTIONS.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        isLoading: false
      };
      
    default:
      return state;
  }
}

// Contexte d'authentification
const AuthContext = createContext();

// Provider du contexte
export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Charger les données utilisateur au démarrage
  useEffect(() => {
    loadUserData();
  }, []);

  // Charger les données utilisateur depuis AsyncStorage
  const loadUserData = async () => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      
      const userData = await AsyncStorage.getItem('user');
      const trajectoriesData = await AsyncStorage.getItem('trajectories');
      
      if (userData) {
        const user = JSON.parse(userData);
        const trajectories = trajectoriesData ? JSON.parse(trajectoriesData) : [];
        
        dispatch({
          type: AUTH_ACTIONS.LOGIN,
          payload: { user, trajectories }
        });
      }
    } catch (error) {
      console.error('Erreur chargement données utilisateur:', error);
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: 'Erreur de chargement' });
    } finally {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
    }
  };

  // Sauvegarder les données utilisateur
  const saveUserData = async (user, trajectories = []) => {
    try {
      await AsyncStorage.setItem('user', JSON.stringify(user));
      await AsyncStorage.setItem('trajectories', JSON.stringify(trajectories));
    } catch (error) {
      console.error('Erreur sauvegarde données utilisateur:', error);
      throw error;
    }
  };

  // Actions utilitaires
  const actions = {
    // Connexion
    login: useCallback(async (username, password) => {
      try {
        dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
        dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: null });

        // Vérifier les identifiants stockés
        const usersData = await AsyncStorage.getItem('users');
        const users = usersData ? JSON.parse(usersData) : [];
        
        const user = users.find(u => u.username === username && u.password === password);
        
        if (!user) {
          throw new Error('Nom d\'utilisateur ou mot de passe incorrect');
        }

        // Charger les trajets de l'utilisateur
        const trajectoriesData = await AsyncStorage.getItem(`trajectories_${user.id}`);
        const trajectories = trajectoriesData ? JSON.parse(trajectoriesData) : [];

        await saveUserData(user, trajectories);
        
        dispatch({
          type: AUTH_ACTIONS.LOGIN,
          payload: { user, trajectories }
        });

        return { success: true };
      } catch (error) {
        dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: error.message });
        return { success: false, error: error.message };
      } finally {
        dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
      }
    }, []),

    // Inscription
    register: useCallback(async (username, password) => {
      try {
        dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
        dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: null });

        // Vérifier si l'utilisateur existe déjà
        const usersData = await AsyncStorage.getItem('users');
        const users = usersData ? JSON.parse(usersData) : [];
        
        if (users.find(u => u.username === username)) {
          throw new Error('Ce nom d\'utilisateur existe déjà');
        }

        // Créer le nouvel utilisateur
        const newUser = {
          id: Date.now().toString(),
          username,
          password,
          createdAt: new Date().toISOString()
        };

        // Sauvegarder dans la liste des utilisateurs
        users.push(newUser);
        await AsyncStorage.setItem('users', JSON.stringify(users));

        // Sauvegarder comme utilisateur actuel
        await saveUserData(newUser, []);
        
        dispatch({
          type: AUTH_ACTIONS.REGISTER,
          payload: { user: newUser }
        });

        return { success: true };
      } catch (error) {
        dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: error.message });
        return { success: false, error: error.message };
      } finally {
        dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
      }
    }, []),

    // Déconnexion
    logout: useCallback(async () => {
      try {
        await AsyncStorage.removeItem('user');
        await AsyncStorage.removeItem('trajectories');
        
        dispatch({ type: AUTH_ACTIONS.LOGOUT });
        return { success: true };
      } catch (error) {
        console.error('Erreur déconnexion:', error);
        return { success: false, error: error.message };
      }
    }, []),

    // Sauvegarder un trajet
    saveTrajectory: useCallback(async (trajectoryData) => {
      if (!state.isAuthenticated || !state.user) {
        throw new Error('Utilisateur non connecté');
      }

      try {
        const trajectory = {
          id: Date.now().toString(),
          userId: state.user.id,
          name: trajectoryData.name || `Trajet ${new Date().toLocaleDateString()}`,
          date: new Date().toISOString(),
          points: trajectoryData.points,
          svgPath: trajectoryData.svgPath,
          stats: {
            stepCount: trajectoryData.stepCount || 0,
            distance: trajectoryData.distance || 0,
            duration: trajectoryData.duration || 0
          }
        };

        // Sauvegarder dans le contexte
        dispatch({
          type: AUTH_ACTIONS.SAVE_TRAJECTORY,
          payload: trajectory
        });

        // Sauvegarder dans AsyncStorage
        const updatedTrajectories = [...state.trajectories, trajectory];
        await AsyncStorage.setItem(`trajectories_${state.user.id}`, JSON.stringify(updatedTrajectories));

        return { success: true, trajectory };
      } catch (error) {
        console.error('Erreur sauvegarde trajet:', error);
        dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: error.message });
        return { success: false, error: error.message };
      }
    }, [state.isAuthenticated, state.user, state.trajectories]),

    // Supprimer un trajet
    deleteTrajectory: useCallback(async (trajectoryId) => {
      if (!state.isAuthenticated || !state.user) {
        throw new Error('Utilisateur non connecté');
      }

      try {
        // Supprimer du contexte
        dispatch({
          type: AUTH_ACTIONS.DELETE_TRAJECTORY,
          payload: trajectoryId
        });

        // Supprimer d'AsyncStorage
        const updatedTrajectories = state.trajectories.filter(t => t.id !== trajectoryId);
        await AsyncStorage.setItem(`trajectories_${state.user.id}`, JSON.stringify(updatedTrajectories));

        return { success: true };
      } catch (error) {
        console.error('Erreur suppression trajet:', error);
        dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: error.message });
        return { success: false, error: error.message };
      }
    }, [state.isAuthenticated, state.user, state.trajectories]),

    // Exporter un trajet en SVG
    exportTrajectoryAsSVG: useCallback(async (trajectory, options = {}) => {
      try {
        // Utiliser le nouvel exporteur SVG pour créer un fichier
        const result = await SVGExporter.exportTrajectoryToFile(trajectory, {
          width: 1200,
          height: 800,
          showGrid: false,
          ...options
        });

        return result;
      } catch (error) {
        console.error('Erreur export SVG:', error);
        return {
          success: false,
          error: error.message || 'Erreur lors de l\'export SVG'
        };
      }
    }, []),

    // *** NOUVEAU: Prévisualiser le SVG (pour debug) ***
    previewTrajectoryAsSVG: useCallback((trajectory, options = {}) => {
      try {
        return SVGExporter.previewSVG(trajectory, options);
      } catch (error) {
        throw new Error(error.message || 'Erreur lors de la génération du SVG');
      }
    }, []),

    // Effacer l'erreur
    clearError: useCallback(() => {
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: null });
    }, [])
  };

  return (
    <AuthContext.Provider value={{ state, actions }}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook pour utiliser le contexte
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export { AUTH_ACTIONS }; 