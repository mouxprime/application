import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

export default function AccountScreen() {
  const { state, actions } = useAuth();
  const [currentView, setCurrentView] = useState('main'); // 'main', 'login', 'register', 'trajectories'
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: ''
  });

  // *** NOUVEAU: État pour les options d'export ***
  const [exportModal, setExportModal] = useState({
    visible: false,
    trajectory: null,
    options: {
      width: 1200,
      height: 800,
      showGrid: false,
      backgroundColor: '#000000',
      trajectoryColor: '#00ff00'
    }
  });

  // Réinitialiser le formulaire
  const resetForm = () => {
    setFormData({
      username: '',
      password: '',
      confirmPassword: ''
    });
    actions.clearError();
  };

  // Gérer la connexion
  const handleLogin = async () => {
    if (!formData.username.trim() || !formData.password.trim()) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }

    const result = await actions.login(formData.username.trim(), formData.password);
    
    if (result.success) {
      resetForm();
      setCurrentView('main');
      Alert.alert('Succès', 'Connexion réussie !');
    }
  };

  // Gérer l'inscription
  const handleRegister = async () => {
    if (!formData.username.trim() || !formData.password.trim()) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      Alert.alert('Erreur', 'Les mots de passe ne correspondent pas');
      return;
    }

    if (formData.password.length < 4) {
      Alert.alert('Erreur', 'Le mot de passe doit contenir au moins 4 caractères');
      return;
    }

    const result = await actions.register(formData.username.trim(), formData.password);
    
    if (result.success) {
      resetForm();
      setCurrentView('main');
      Alert.alert('Succès', 'Inscription réussie ! Vous êtes maintenant connecté.');
    }
  };

  // Gérer la déconnexion
  const handleLogout = () => {
    Alert.alert(
      'Déconnexion',
      'Êtes-vous sûr de vouloir vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Déconnecter',
          style: 'destructive',
          onPress: async () => {
            await actions.logout();
            setCurrentView('main');
          }
        }
      ]
    );
  };

  // Supprimer un trajet
  const handleDeleteTrajectory = (trajectoryId, trajectoryName) => {
    Alert.alert(
      'Supprimer le trajet',
      `Êtes-vous sûr de vouloir supprimer "${trajectoryName}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => actions.deleteTrajectory(trajectoryId)
        }
      ]
    );
  };

  // Exporter un trajet
  const handleExportTrajectory = async (trajectory) => {
    // Ouvrir le modal d'options d'export
    setExportModal({
      visible: true,
      trajectory: trajectory,
      options: {
        width: 1200,
        height: 800,
        showGrid: false,
        backgroundColor: '#000000',
        trajectoryColor: '#00ff00'
      }
    });
  };

  // *** NOUVEAU: Confirmer l'export avec les options choisies ***
  const confirmExportTrajectory = async () => {
    const { trajectory, options } = exportModal;
    
    try {
      // Fermer le modal et afficher un indicateur de chargement
      setExportModal({ visible: false, trajectory: null, options: {} });
      Alert.alert('Export en cours', 'Création du fichier SVG...', [], { cancelable: false });
      
      // Exporter le trajet en fichier SVG
      const result = await actions.exportTrajectoryAsSVG(trajectory, options);
      
      if (result.success) {
        Alert.alert(
          'Export réussi ! 🎉',
          `Le fichier "${result.fileName}" a été créé.\n\nVous pouvez maintenant le partager ou l'enregistrer sur votre appareil.`,
          [
            { text: 'OK' },
            {
              text: 'Voir les détails',
              onPress: () => {
                Alert.alert(
                  'Détails du fichier',
                  `📁 Nom: ${result.fileName}\n📍 Chemin: ${result.filePath}\n💾 Taille: Fichier SVG vectoriel\n\n✨ Le fichier est maintenant disponible dans votre gestionnaire de fichiers ou peut être partagé avec d'autres applications.`
                );
              }
            }
          ]
        );
      } else {
        Alert.alert(
          'Erreur d\'export',
          result.error || 'Impossible de créer le fichier SVG',
          [
            { text: 'OK' },
            {
              text: 'Réessayer',
              onPress: () => setExportModal({ ...exportModal, visible: true })
            }
          ]
        );
      }
    } catch (error) {
      console.error('Erreur export trajet:', error);
      Alert.alert(
        'Erreur',
        error.message || 'Une erreur est survenue lors de l\'export',
        [
          { text: 'OK' },
          {
            text: 'Réessayer',
            onPress: () => setExportModal({ ...exportModal, visible: true })
          }
        ]
      );
    }
  };

  // Rendu de la vue principale (connecté)
  const renderMainView = () => (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="person-circle" size={64} color="#00ff88" />
        <Text style={styles.welcomeText}>Bonjour, {state.user.username} !</Text>
        <Text style={styles.memberSince}>
          Membre depuis le {new Date(state.user.createdAt).toLocaleDateString()}
        </Text>
      </View>

      <View style={styles.menuContainer}>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => setCurrentView('trajectories')}
        >
          <Ionicons name="map" size={24} color="#00ff88" />
          <View style={styles.menuTextContainer}>
            <Text style={styles.menuTitle}>Mes Trajets</Text>
            <Text style={styles.menuSubtitle}>
              {state.trajectories.length} trajet{state.trajectories.length !== 1 ? 's' : ''} sauvegardé{state.trajectories.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#666666" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
          <Ionicons name="log-out" size={24} color="#ff4444" />
          <View style={styles.menuTextContainer}>
            <Text style={[styles.menuTitle, { color: '#ff4444' }]}>Déconnexion</Text>
            <Text style={styles.menuSubtitle}>Se déconnecter du compte</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#666666" />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  // Rendu de la vue de connexion
  const renderLoginView = () => (
    <ScrollView style={styles.container}>
      <View style={styles.authHeader}>
        <Ionicons name="log-in" size={48} color="#00ff88" />
        <Text style={styles.authTitle}>Connexion</Text>
        <Text style={styles.authSubtitle}>Connectez-vous à votre compte</Text>
      </View>

      <View style={styles.formContainer}>
        <View style={styles.inputContainer}>
          <Ionicons name="person" size={20} color="#666666" style={styles.inputIcon} />
          <TextInput
            style={styles.textInput}
            placeholder="Nom d'utilisateur"
            placeholderTextColor="#666666"
            value={formData.username}
            onChangeText={(text) => setFormData({ ...formData, username: text })}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputContainer}>
          <Ionicons name="lock-closed" size={20} color="#666666" style={styles.inputIcon} />
          <TextInput
            style={styles.textInput}
            placeholder="Mot de passe"
            placeholderTextColor="#666666"
            value={formData.password}
            onChangeText={(text) => setFormData({ ...formData, password: text })}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {state.error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={16} color="#ff4444" />
            <Text style={styles.errorText}>{state.error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.primaryButton, state.isLoading && styles.disabledButton]}
          onPress={handleLogin}
          disabled={state.isLoading}
        >
          {state.isLoading ? (
            <ActivityIndicator color="#000000" />
          ) : (
            <Text style={styles.primaryButtonText}>Se connecter</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => {
            resetForm();
            setCurrentView('register');
          }}
        >
          <Text style={styles.secondaryButtonText}>Créer un compte</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            resetForm();
            setCurrentView('main');
          }}
        >
          <Text style={styles.backButtonText}>Retour</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  // Rendu de la vue d'inscription
  const renderRegisterView = () => (
    <ScrollView style={styles.container}>
      <View style={styles.authHeader}>
        <Ionicons name="person-add" size={48} color="#00ff88" />
        <Text style={styles.authTitle}>Inscription</Text>
        <Text style={styles.authSubtitle}>Créez votre compte</Text>
      </View>

      <View style={styles.formContainer}>
        <View style={styles.inputContainer}>
          <Ionicons name="person" size={20} color="#666666" style={styles.inputIcon} />
          <TextInput
            style={styles.textInput}
            placeholder="Nom d'utilisateur"
            placeholderTextColor="#666666"
            value={formData.username}
            onChangeText={(text) => setFormData({ ...formData, username: text })}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputContainer}>
          <Ionicons name="lock-closed" size={20} color="#666666" style={styles.inputIcon} />
          <TextInput
            style={styles.textInput}
            placeholder="Mot de passe"
            placeholderTextColor="#666666"
            value={formData.password}
            onChangeText={(text) => setFormData({ ...formData, password: text })}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputContainer}>
          <Ionicons name="lock-closed" size={20} color="#666666" style={styles.inputIcon} />
          <TextInput
            style={styles.textInput}
            placeholder="Confirmer le mot de passe"
            placeholderTextColor="#666666"
            value={formData.confirmPassword}
            onChangeText={(text) => setFormData({ ...formData, confirmPassword: text })}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {state.error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={16} color="#ff4444" />
            <Text style={styles.errorText}>{state.error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.primaryButton, state.isLoading && styles.disabledButton]}
          onPress={handleRegister}
          disabled={state.isLoading}
        >
          {state.isLoading ? (
            <ActivityIndicator color="#000000" />
          ) : (
            <Text style={styles.primaryButtonText}>Créer le compte</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => {
            resetForm();
            setCurrentView('login');
          }}
        >
          <Text style={styles.secondaryButtonText}>J'ai déjà un compte</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            resetForm();
            setCurrentView('main');
          }}
        >
          <Text style={styles.backButtonText}>Retour</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  // Rendu de la vue des trajets
  const renderTrajectoriesView = () => (
    <ScrollView style={styles.container}>
      <View style={styles.trajectoriesHeader}>
        <TouchableOpacity
          style={styles.backIconButton}
          onPress={() => setCurrentView('main')}
        >
          <Ionicons name="arrow-back" size={24} color="#00ff88" />
        </TouchableOpacity>
        <Text style={styles.trajectoriesTitle}>Mes Trajets</Text>
      </View>

      {state.trajectories.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="map-outline" size={64} color="#666666" />
          <Text style={styles.emptyTitle}>Aucun trajet sauvegardé</Text>
          <Text style={styles.emptySubtitle}>
            Vos trajets apparaîtront ici une fois que vous les aurez sauvegardés depuis la carte.
          </Text>
        </View>
      ) : (
        <View style={styles.trajectoriesList}>
          {state.trajectories.map((trajectory) => (
            <View key={trajectory.id} style={styles.trajectoryCard}>
              <View style={styles.trajectoryHeader}>
                <Ionicons name="map" size={20} color="#00ff88" />
                <Text style={styles.trajectoryName}>{trajectory.name}</Text>
              </View>
              
              <Text style={styles.trajectoryDate}>
                {new Date(trajectory.date).toLocaleDateString()} à {new Date(trajectory.date).toLocaleTimeString()}
              </Text>
              
              <View style={styles.trajectoryStats}>
                <View style={styles.statItem}>
                  <Ionicons name="footsteps" size={16} color="#666666" />
                  <Text style={styles.statText}>{trajectory.stats.stepCount} pas</Text>
                </View>
                <View style={styles.statItem}>
                  <Ionicons name="resize" size={16} color="#666666" />
                  <Text style={styles.statText}>{trajectory.stats.distance.toFixed(1)} m</Text>
                </View>
                <View style={styles.statItem}>
                  <Ionicons name="location" size={16} color="#666666" />
                  <Text style={styles.statText}>{trajectory.points.length} points</Text>
                </View>
              </View>

              <View style={styles.trajectoryActions}>
                <TouchableOpacity
                  style={styles.exportButton}
                  onPress={() => handleExportTrajectory(trajectory)}
                >
                  <Ionicons name="download" size={16} color="#00ff88" />
                  <Text style={styles.exportButtonText}>Télécharger SVG</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDeleteTrajectory(trajectory.id, trajectory.name)}
                >
                  <Ionicons name="trash" size={16} color="#ff4444" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );

  // Rendu de la vue non connecté
  const renderGuestView = () => (
    <ScrollView style={styles.container}>
      <View style={styles.guestHeader}>
        <Ionicons name="person-circle-outline" size={80} color="#666666" />
        <Text style={styles.guestTitle}>Mon Compte</Text>
        <Text style={styles.guestSubtitle}>
          Connectez-vous pour sauvegarder vos trajets et accéder à vos données.
        </Text>
      </View>

      <View style={styles.guestActions}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => setCurrentView('login')}
        >
          <Text style={styles.primaryButtonText}>Se connecter</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => setCurrentView('register')}
        >
          <Text style={styles.secondaryButtonText}>Créer un compte</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.featuresContainer}>
        <Text style={styles.featuresTitle}>Avec un compte, vous pouvez :</Text>
        
        <View style={styles.featureItem}>
          <Ionicons name="save" size={20} color="#00ff88" />
          <Text style={styles.featureText}>Sauvegarder vos trajets</Text>
        </View>
        
        <View style={styles.featureItem}>
          <Ionicons name="download" size={20} color="#00ff88" />
          <Text style={styles.featureText}>Exporter en format SVG</Text>
        </View>
        
        <View style={styles.featureItem}>
          <Ionicons name="analytics" size={20} color="#00ff88" />
          <Text style={styles.featureText}>Consulter vos statistiques</Text>
        </View>
        
        <View style={styles.featureItem}>
          <Ionicons name="cloud" size={20} color="#00ff88" />
          <Text style={styles.featureText}>Synchroniser entre appareils</Text>
        </View>
      </View>
    </ScrollView>
  );

  // Rendu principal
  return (
    <SafeAreaView style={styles.safeArea}>
      {state.isAuthenticated ? (
        currentView === 'main' ? renderMainView() :
        currentView === 'trajectories' ? renderTrajectoriesView() :
        renderMainView()
      ) : (
        currentView === 'login' ? renderLoginView() :
        currentView === 'register' ? renderRegisterView() :
        renderGuestView()
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  
  // Styles pour la vue principale (connecté)
  header: {
    alignItems: 'center',
    padding: 30,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  welcomeText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 15,
  },
  memberSince: {
    color: '#666666',
    fontSize: 14,
    marginTop: 5,
  },
  menuContainer: {
    padding: 20,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 20,
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#333333',
  },
  menuTextContainer: {
    flex: 1,
    marginLeft: 15,
  },
  menuTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  menuSubtitle: {
    color: '#666666',
    fontSize: 14,
    marginTop: 2,
  },

  // Styles pour les vues d'authentification
  authHeader: {
    alignItems: 'center',
    padding: 30,
  },
  authTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 15,
  },
  authSubtitle: {
    color: '#666666',
    fontSize: 16,
    marginTop: 5,
    textAlign: 'center',
  },
  formContainer: {
    padding: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#333333',
    paddingHorizontal: 15,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 16,
    paddingVertical: 15,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a1a1a',
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#ff4444',
  },
  errorText: {
    color: '#ff4444',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  primaryButton: {
    backgroundColor: '#00ff88',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 15,
  },
  primaryButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#00ff88',
    marginBottom: 15,
  },
  secondaryButtonText: {
    color: '#00ff88',
    fontSize: 16,
    fontWeight: 'bold',
  },
  backButton: {
    alignItems: 'center',
    padding: 10,
  },
  backButtonText: {
    color: '#666666',
    fontSize: 14,
  },
  disabledButton: {
    opacity: 0.5,
  },

  // Styles pour la vue invité
  guestHeader: {
    alignItems: 'center',
    padding: 40,
  },
  guestTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 20,
  },
  guestSubtitle: {
    color: '#666666',
    fontSize: 16,
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 22,
  },
  guestActions: {
    padding: 20,
  },
  featuresContainer: {
    padding: 20,
    paddingTop: 0,
  },
  featuresTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  featureText: {
    color: '#cccccc',
    fontSize: 16,
    marginLeft: 15,
  },

  // Styles pour la vue des trajets
  trajectoriesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  backIconButton: {
    marginRight: 15,
  },
  trajectoriesTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 40,
    marginTop: 50,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 20,
  },
  emptySubtitle: {
    color: '#666666',
    fontSize: 16,
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 22,
  },
  trajectoriesList: {
    padding: 20,
  },
  trajectoryCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#333333',
  },
  trajectoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  trajectoryName: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  trajectoryDate: {
    color: '#666666',
    fontSize: 14,
    marginBottom: 15,
  },
  trajectoryStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    color: '#cccccc',
    fontSize: 14,
    marginLeft: 5,
  },
  trajectoryActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#00ff88',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
  },
  exportButtonText: {
    color: '#00ff88',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 5,
  },
  deleteButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
  },
}); 