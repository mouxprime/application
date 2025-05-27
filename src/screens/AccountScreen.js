import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
  Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import * as ImagePicker from 'expo-image-picker';

export default function AccountScreen() {
  const { state, actions } = useAuth();
  const [currentView, setCurrentView] = useState('main'); // 'main', 'login', 'register', 'trajectories', 'profile'
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: ''
  });

  // *** NOUVEAU: États pour le profil utilisateur ***
  const [profileData, setProfileData] = useState({
    height: state.user?.height || 170, // Taille en cm
    profileImage: state.user?.profileImage || null,
    isEditingHeight: false
  });

  // *** NOUVEAU: État pour le modal de sélection d'image ***
  const [imagePickerModal, setImagePickerModal] = useState(false);

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

  // *** NOUVEAU: Fonctions pour la gestion du profil ***
  
  // Sélectionner une photo de profil
  const selectProfileImage = async () => {
    try {
      // Demander les permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission requise', 'L\'accès à la galerie est nécessaire pour choisir une photo de profil.');
        return;
      }

      // Ouvrir la galerie
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1], // Format carré
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const imageUri = result.assets[0].uri;
        setProfileData(prev => ({ ...prev, profileImage: imageUri }));
        
        // Sauvegarder dans le contexte utilisateur
        await actions.updateUserProfile({ profileImage: imageUri });
        
        Alert.alert('Succès', 'Photo de profil mise à jour !');
      }
    } catch (error) {
      console.error('Erreur sélection image:', error);
      Alert.alert('Erreur', 'Impossible de sélectionner l\'image');
    }
    setImagePickerModal(false);
  };

  // Prendre une photo avec la caméra
  const takeProfilePhoto = async () => {
    try {
      // Demander les permissions
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission requise', 'L\'accès à la caméra est nécessaire pour prendre une photo.');
        return;
      }

      // Ouvrir la caméra
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1], // Format carré
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const imageUri = result.assets[0].uri;
        setProfileData(prev => ({ ...prev, profileImage: imageUri }));
        
        // Sauvegarder dans le contexte utilisateur
        await actions.updateUserProfile({ profileImage: imageUri });
        
        Alert.alert('Succès', 'Photo de profil mise à jour !');
      }
    } catch (error) {
      console.error('Erreur prise de photo:', error);
      Alert.alert('Erreur', 'Impossible de prendre la photo');
    }
    setImagePickerModal(false);
  };

  // Supprimer la photo de profil
  const removeProfileImage = async () => {
    Alert.alert(
      'Supprimer la photo',
      'Êtes-vous sûr de vouloir supprimer votre photo de profil ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setProfileData(prev => ({ ...prev, profileImage: null }));
            await actions.updateUserProfile({ profileImage: null });
            Alert.alert('Succès', 'Photo de profil supprimée');
          }
        }
      ]
    );
    setImagePickerModal(false);
  };

  // Modifier la taille
  const updateHeight = async (newHeight) => {
    const height = parseInt(newHeight);
    if (isNaN(height) || height < 100 || height > 250) {
      Alert.alert('Erreur', 'Veuillez entrer une taille valide entre 100 et 250 cm');
      return;
    }

    setProfileData(prev => ({ ...prev, height, isEditingHeight: false }));
    
    // Sauvegarder dans le contexte utilisateur
    await actions.updateUserProfile({ height });
    
    Alert.alert('Succès', `Taille mise à jour : ${height} cm\n\nCela améliorera la précision de l'algorithme de détection de pas.`);
  };

  // Rendu de la vue principale (connecté)
  const renderMainView = () => (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        {/* Photo de profil */}
        <TouchableOpacity 
          style={styles.profileImageContainer}
          onPress={() => setImagePickerModal(true)}
        >
          {profileData.profileImage ? (
            <Image source={{ uri: profileData.profileImage }} style={styles.profileImage} />
          ) : (
            <View style={styles.defaultProfileImage}>
              <Ionicons name="person" size={48} color="#00ff88" />
            </View>
          )}
          <View style={styles.editImageBadge}>
            <Ionicons name="camera" size={16} color="#ffffff" />
          </View>
        </TouchableOpacity>

        <Text style={styles.welcomeText}>Bonjour, {state.user.username} !</Text>
        <Text style={styles.memberSince}>
          Membre depuis le {new Date(state.user.createdAt).toLocaleDateString()}
        </Text>
      </View>

      {/* Section Profil */}
      <View style={styles.profileSection}>
        <Text style={styles.sectionTitle}>Mon Profil</Text>
        
        {/* Taille */}
        <View style={styles.profileItem}>
          <View style={styles.profileItemLeft}>
            <Ionicons name="resize" size={24} color="#00ff88" />
            <View style={styles.profileItemText}>
              <Text style={styles.profileItemTitle}>Taille</Text>
              <Text style={styles.profileItemSubtitle}>
                Améliore la précision de l'algorithme
              </Text>
            </View>
          </View>
          
          {profileData.isEditingHeight ? (
            <View style={styles.heightEditContainer}>
              <TextInput
                style={styles.heightInput}
                value={profileData.height.toString()}
                onChangeText={(text) => setProfileData(prev => ({ ...prev, height: parseInt(text) || 170 }))}
                keyboardType="numeric"
                placeholder="170"
                placeholderTextColor="#666666"
                maxLength={3}
              />
              <Text style={styles.heightUnit}>cm</Text>
              <TouchableOpacity
                style={styles.heightSaveButton}
                onPress={() => updateHeight(profileData.height)}
              >
                <Ionicons name="checkmark" size={16} color="#ffffff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.heightCancelButton}
                onPress={() => setProfileData(prev => ({ 
                  ...prev, 
                  height: state.user?.height || 170,
                  isEditingHeight: false 
                }))}
              >
                <Ionicons name="close" size={16} color="#ffffff" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.profileItemRight}
              onPress={() => setProfileData(prev => ({ ...prev, isEditingHeight: true }))}
            >
              <Text style={styles.profileItemValue}>{profileData.height} cm</Text>
              <Ionicons name="pencil" size={16} color="#666666" />
            </TouchableOpacity>
          )}
        </View>
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

      {/* Modal de sélection d'image */}
      <Modal
        visible={imagePickerModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setImagePickerModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Photo de profil</Text>
            
            <TouchableOpacity style={styles.modalOption} onPress={selectProfileImage}>
              <Ionicons name="images" size={24} color="#00ff88" />
              <Text style={styles.modalOptionText}>Choisir depuis la galerie</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.modalOption} onPress={takeProfilePhoto}>
              <Ionicons name="camera" size={24} color="#00ff88" />
              <Text style={styles.modalOptionText}>Prendre une photo</Text>
            </TouchableOpacity>
            
            {profileData.profileImage && (
              <TouchableOpacity style={styles.modalOption} onPress={removeProfileImage}>
                <Ionicons name="trash" size={24} color="#ff4444" />
                <Text style={[styles.modalOptionText, { color: '#ff4444' }]}>Supprimer la photo</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity 
              style={styles.modalCancel} 
              onPress={() => setImagePickerModal(false)}
            >
              <Text style={styles.modalCancelText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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

  // Styles pour la vue principale (connecté)
  profileImageContainer: {
    position: 'relative',
    marginBottom: 20,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  defaultProfileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editImageBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 2,
    borderRadius: 12,
  },
  profileSection: {
    padding: 20,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  profileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  profileItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileItemText: {
    marginLeft: 10,
  },
  profileItemTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  profileItemSubtitle: {
    color: '#666666',
    fontSize: 14,
  },
  profileItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileItemValue: {
    color: '#ffffff',
    fontSize: 16,
    marginLeft: 5,
  },
  heightEditContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heightInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 16,
    padding: 10,
  },
  heightUnit: {
    color: '#666666',
    fontSize: 14,
    marginLeft: 5,
  },
  heightSaveButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#00ff88',
  },
  heightCancelButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#00ff88',
  },

  // Styles pour le modal de sélection d'image
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    padding: 20,
    borderRadius: 12,
    width: '80%',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 8,
    marginBottom: 10,
  },
  modalOptionText: {
    color: '#ffffff',
    fontSize: 16,
    marginLeft: 10,
  },
  modalCancel: {
    backgroundColor: 'transparent',
    padding: 10,
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
}); 