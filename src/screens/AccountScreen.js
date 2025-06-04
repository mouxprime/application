import React, { useState, useEffect } from 'react';
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
import * as ImagePicker from 'expo-image-picker';
import supabaseService from '../services/SupabaseService';
import AuthScreen from './AuthScreen';

export default function AccountScreen({ navigation }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentView, setCurrentView] = useState('main'); // 'main', 'profile'

  // *** NOUVEAU: États pour le profil utilisateur ***
  const [profileData, setProfileData] = useState({
    height: 170,
    weight: 70,
    age: 30,
    gender: 'unspecified',
    profileImage: null,
    isEditingHeight: false,
    isEditingWeight: false,
    isEditingAge: false
  });

  // *** NOUVEAU: États pour la gestion de l'email ***
  const [userProfile, setUserProfile] = useState(null);
  const [emailData, setEmailData] = useState({
    currentEmail: '',
    newEmail: '',
    isEditingEmail: false,
    hasRealEmail: false
  });

  // *** NOUVEAU: État pour le modal de sélection d'image ***
  const [imagePickerModal, setImagePickerModal] = useState(false);

  // *** NOUVEAU: État pour la liste des trajets ***
  const [trajectories, setTrajectories] = useState([]);
  const [userStats, setUserStats] = useState(null);

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      // Supprimer tous les comptes locaux existants
      await clearLocalAccounts();
      
      // Vérifier si l'utilisateur est connecté via Supabase
      if (supabaseService.isAuthenticated()) {
        const user = supabaseService.getCurrentUser();
        setCurrentUser(user);
        setIsAuthenticated(true);
        await loadUserData();
      } else {
        setIsAuthenticated(false);
        setCurrentUser(null);
      }
    } catch (error) {
      console.error('❌ [ACCOUNT] Erreur initialisation auth:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const clearLocalAccounts = async () => {
    try {
      // Ici on pourrait nettoyer AsyncStorage ou autres systèmes locaux
      console.log('🧹 [ACCOUNT] Nettoyage des comptes locaux effectué');
    } catch (error) {
      console.error('❌ [ACCOUNT] Erreur nettoyage comptes locaux:', error);
    }
  };

  const loadUserData = async () => {
    try {
      // Charger le profil utilisateur
      const profile = await supabaseService.getUserProfile();
      setUserProfile(profile);
      
      if (profile) {
        setEmailData({
          currentEmail: profile.email || '',
          newEmail: '',
          isEditingEmail: false,
          hasRealEmail: profile.has_real_email || false
        });
      }
      
      // Charger les trajets de l'utilisateur
      const userTrajectories = await supabaseService.getUserTrajectories();
      setTrajectories(userTrajectories);

      // Charger les statistiques
      const stats = await supabaseService.getUserStats();
      setUserStats(stats);

      console.log(`✅ [ACCOUNT] Données utilisateur chargées: ${userTrajectories.length} trajets`);
    } catch (error) {
      console.error('❌ [ACCOUNT] Erreur chargement données utilisateur:', error);
    }
  };

  const handleAuthSuccess = async (user) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    await loadUserData();
    console.log('✅ [ACCOUNT] Utilisateur connecté:', user.email);
  };

  const handleLogout = async () => {
    Alert.alert(
      'Déconnexion',
      'Êtes-vous sûr de vouloir vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Déconnecter',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabaseService.signOut();
              setIsAuthenticated(false);
              setCurrentUser(null);
              setTrajectories([]);
              setUserStats(null);
            } catch (error) {
              console.error('❌ [ACCOUNT] Erreur déconnexion:', error);
              Alert.alert('Erreur', 'Impossible de se déconnecter');
            }
          }
        }
      ]
    );
  };

  const handleDeleteTrajectory = async (trajectoryId, trajectoryName) => {
    Alert.alert(
      'Supprimer le trajet',
      `Êtes-vous sûr de vouloir supprimer "${trajectoryName}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabaseService.deleteTrajectory(trajectoryId);
              await loadUserData(); // Recharger les données
              Alert.alert('Succès', 'Trajet supprimé');
            } catch (error) {
              console.error('❌ [ACCOUNT] Erreur suppression trajet:', error);
              Alert.alert('Erreur', 'Impossible de supprimer le trajet');
            }
          }
        }
      ]
    );
  };

  // *** NOUVEAU: Fonctions pour la gestion du profil ***
  
  // Sélectionner une photo de profil
  const selectProfileImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission requise', 'L\'accès à la galerie est nécessaire pour choisir une photo de profil.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const imageUri = result.assets[0].uri;
        setProfileData(prev => ({ ...prev, profileImage: imageUri }));
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
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission requise', 'L\'accès à la caméra est nécessaire pour prendre une photo.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const imageUri = result.assets[0].uri;
        setProfileData(prev => ({ ...prev, profileImage: imageUri }));
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
            Alert.alert('Succès', 'Photo de profil supprimée');
          }
        }
      ]
    );
    setImagePickerModal(false);
  };

  // Mettre à jour le profil
  const updateProfileField = async (field, value) => {
    try {
      const numericValue = ['height', 'weight', 'age'].includes(field) ? parseInt(value) : value;
      
      if (['height', 'weight', 'age'].includes(field)) {
        if (isNaN(numericValue)) {
          Alert.alert('Erreur', 'Veuillez entrer une valeur numérique valide');
          return;
        }
        
        if (field === 'height' && (numericValue < 100 || numericValue > 250)) {
          Alert.alert('Erreur', 'Veuillez entrer une taille entre 100 et 250 cm');
          return;
        }
        
        if (field === 'weight' && (numericValue < 30 || numericValue > 300)) {
          Alert.alert('Erreur', 'Veuillez entrer un poids entre 30 et 300 kg');
          return;
        }
        
        if (field === 'age' && (numericValue < 1 || numericValue > 120)) {
          Alert.alert('Erreur', 'Veuillez entrer un âge entre 1 et 120 ans');
          return;
        }
      }

      // Mettre à jour localement
      setProfileData(prev => ({ 
        ...prev, 
        [field]: numericValue,
        [`isEditing${field.charAt(0).toUpperCase() + field.slice(1)}`]: false
      }));
      
      // Mettre à jour dans Supabase
      await supabaseService.updateUserProfile({ [field]: numericValue });
      
      Alert.alert('Succès', `${field === 'height' ? 'Taille' : field === 'weight' ? 'Poids' : 'Âge'} mis à jour`);
    } catch (error) {
      console.error(`❌ [ACCOUNT] Erreur mise à jour ${field}:`, error);
      Alert.alert('Erreur', `Impossible de mettre à jour ${field}`);
    }
  };

  // *** NOUVEAU: Mettre à jour l'email ***
  const updateEmail = async () => {
    try {
      if (!emailData.newEmail.trim()) {
        Alert.alert('Erreur', 'Veuillez entrer un email valide');
        return;
      }

      if (!emailData.newEmail.includes('@')) {
        Alert.alert('Erreur', 'Format d\'email invalide');
        return;
      }

      await supabaseService.updateUserEmail(emailData.newEmail.trim());
      
      // Mettre à jour l'état local
      setEmailData(prev => ({
        ...prev,
        currentEmail: emailData.newEmail.trim(),
        newEmail: '',
        isEditingEmail: false,
        hasRealEmail: true
      }));

      Alert.alert(
        'Email mis à jour !',
        `Votre email a été changé vers "${emailData.newEmail.trim()}".\n\n` +
        '✅ Vos données sont maintenant récupérables en cas de perte de mot de passe.'
      );
      
      // Recharger le profil pour avoir les dernières données
      await loadUserData();
    } catch (error) {
      console.error('❌ [ACCOUNT] Erreur mise à jour email:', error);
      Alert.alert('Erreur', `Impossible de mettre à jour l'email: ${error.message}`);
    }
  };

  // Formatage des dates
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const formatDistance = (meters) => {
    if (!meters) return '0m';
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)}km`;
    } else {
      return `${meters.toFixed(1)}m`;
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0s';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  // Rendu de la vue principale (connecté)
  const renderMainView = () => (
    <ScrollView style={styles.container}>
      {/* En-tête utilisateur */}
      <View style={styles.header}>
        <View style={styles.profileImageContainer}>
          {profileData.profileImage ? (
            <Image source={{ uri: profileData.profileImage }} style={styles.profileImage} />
          ) : (
            <View style={styles.defaultProfileImage}>
              <Ionicons name="person" size={40} color="#666666" />
            </View>
          )}
          <TouchableOpacity
            style={styles.editImageBadge}
            onPress={() => setImagePickerModal(true)}
          >
            <Ionicons name="camera" size={16} color="#ffffff" />
          </TouchableOpacity>
        </View>
        <Text style={styles.welcomeText}>{currentUser?.email || 'Utilisateur'}</Text>
        <Text style={styles.memberSince}>
          Membre depuis {new Date().toLocaleDateString()}
        </Text>
      </View>

      {/* Section Profil */}
      <View style={styles.profileSection}>
        <Text style={styles.sectionTitle}>Profil utilisateur</Text>
        
        {/* Taille */}
        <View style={styles.profileItem}>
          <View style={styles.profileItemLeft}>
            <Ionicons name="resize" size={24} color="#00ff88" />
            <View style={styles.profileItemText}>
              <Text style={styles.profileItemTitle}>Taille</Text>
              <Text style={styles.profileItemSubtitle}>Améliore la précision</Text>
            </View>
          </View>
          
          {profileData.isEditingHeight ? (
            <View style={styles.editContainer}>
              <TextInput
                style={styles.editInput}
                value={profileData.height.toString()}
                onChangeText={(text) => setProfileData(prev => ({ ...prev, height: parseInt(text) || 170 }))}
                keyboardType="numeric"
                placeholder="170"
                placeholderTextColor="#666666"
                maxLength={3}
              />
              <Text style={styles.editUnit}>cm</Text>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={() => updateProfileField('height', profileData.height)}
              >
                <Ionicons name="checkmark" size={16} color="#ffffff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setProfileData(prev => ({ ...prev, isEditingHeight: false }))}
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

        {/* Poids */}
        <View style={styles.profileItem}>
          <View style={styles.profileItemLeft}>
            <Ionicons name="fitness" size={24} color="#00ff88" />
            <View style={styles.profileItemText}>
              <Text style={styles.profileItemTitle}>Poids</Text>
              <Text style={styles.profileItemSubtitle}>Pour calculs énergétiques</Text>
            </View>
          </View>
          
          {profileData.isEditingWeight ? (
            <View style={styles.editContainer}>
              <TextInput
                style={styles.editInput}
                value={profileData.weight.toString()}
                onChangeText={(text) => setProfileData(prev => ({ ...prev, weight: parseInt(text) || 70 }))}
                keyboardType="numeric"
                placeholder="70"
                placeholderTextColor="#666666"
                maxLength={3}
              />
              <Text style={styles.editUnit}>kg</Text>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={() => updateProfileField('weight', profileData.weight)}
              >
                <Ionicons name="checkmark" size={16} color="#ffffff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setProfileData(prev => ({ ...prev, isEditingWeight: false }))}
              >
                <Ionicons name="close" size={16} color="#ffffff" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.profileItemRight}
              onPress={() => setProfileData(prev => ({ ...prev, isEditingWeight: true }))}
            >
              <Text style={styles.profileItemValue}>{profileData.weight} kg</Text>
              <Ionicons name="pencil" size={16} color="#666666" />
            </TouchableOpacity>
          )}
        </View>

        {/* Âge */}
        <View style={styles.profileItem}>
          <View style={styles.profileItemLeft}>
            <Ionicons name="calendar" size={24} color="#00ff88" />
            <View style={styles.profileItemText}>
              <Text style={styles.profileItemTitle}>Âge</Text>
              <Text style={styles.profileItemSubtitle}>Optionnel</Text>
            </View>
          </View>
          
          {profileData.isEditingAge ? (
            <View style={styles.editContainer}>
              <TextInput
                style={styles.editInput}
                value={profileData.age.toString()}
                onChangeText={(text) => setProfileData(prev => ({ ...prev, age: parseInt(text) || 30 }))}
                keyboardType="numeric"
                placeholder="30"
                placeholderTextColor="#666666"
                maxLength={3}
              />
              <Text style={styles.editUnit}>ans</Text>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={() => updateProfileField('age', profileData.age)}
              >
                <Ionicons name="checkmark" size={16} color="#ffffff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setProfileData(prev => ({ ...prev, isEditingAge: false }))}
              >
                <Ionicons name="close" size={16} color="#ffffff" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.profileItemRight}
              onPress={() => setProfileData(prev => ({ ...prev, isEditingAge: true }))}
            >
              <Text style={styles.profileItemValue}>{profileData.age} ans</Text>
              <Ionicons name="pencil" size={16} color="#666666" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* *** NOUVEAU: Section Email *** */}
      <View style={styles.profileSection}>
        <Text style={styles.sectionTitle}>Configuration Email</Text>
        
        {!emailData.hasRealEmail && (
          <View style={styles.warningContainer}>
            <Ionicons name="warning" size={24} color="#ffaa00" />
            <View style={styles.warningText}>
              <Text style={styles.warningTitle}>⚠️ Pas d'email configuré</Text>
              <Text style={styles.warningSubtitle}>
                Vos données ne sont pas récupérables en cas de perte de mot de passe
              </Text>
            </View>
          </View>
        )}

        <View style={styles.profileItem}>
          <View style={styles.profileItemLeft}>
            <Ionicons 
              name="mail" 
              size={24} 
              color={emailData.hasRealEmail ? "#00ff88" : "#ffaa00"} 
            />
            <View style={styles.profileItemText}>
              <Text style={styles.profileItemTitle}>Email</Text>
              <Text style={styles.profileItemSubtitle}>
                {emailData.hasRealEmail ? 'Sécurisé' : 'Non configuré'}
              </Text>
            </View>
          </View>
          
          {emailData.isEditingEmail ? (
            <View style={styles.editContainer}>
              <TextInput
                style={styles.editInput}
                value={emailData.newEmail}
                onChangeText={(text) => setEmailData(prev => ({ ...prev, newEmail: text }))}
                keyboardType="email-address"
                placeholder="votre@email.com"
                placeholderTextColor="#666666"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.saveButton}
                onPress={updateEmail}
              >
                <Ionicons name="checkmark" size={16} color="#ffffff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setEmailData(prev => ({ ...prev, isEditingEmail: false, newEmail: '' }))}
              >
                <Ionicons name="close" size={16} color="#ffffff" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.profileItemRight}
              onPress={() => setEmailData(prev => ({ ...prev, isEditingEmail: true }))}
            >
              <Text style={styles.profileItemValue}>
                {emailData.hasRealEmail ? emailData.currentEmail : 'Ajouter un email'}
              </Text>
              <Ionicons name="pencil" size={16} color="#666666" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Statistiques utilisateur */}
      {userStats && (
        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>Statistiques globales</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{userStats.totalTrajectories}</Text>
              <Text style={styles.statLabel}>Trajets</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatDistance(userStats.totalDistance)}</Text>
              <Text style={styles.statLabel}>Distance</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{userStats.totalSteps.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Pas</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatDuration(userStats.totalDuration)}</Text>
              <Text style={styles.statLabel}>Temps</Text>
            </View>
          </View>
        </View>
      )}

      {/* Menu */}
      <View style={styles.menuContainer}>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate('TrajectoryHistory')}
        >
          <Ionicons name="map" size={24} color="#00ff88" />
          <View style={styles.menuTextContainer}>
            <Text style={styles.menuTitle}>Historique des trajets</Text>
            <Text style={styles.menuSubtitle}>
              {trajectories.length} trajet{trajectories.length !== 1 ? 's' : ''} sauvegardé{trajectories.length !== 1 ? 's' : ''}
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

  // Chargement
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00ff88" />
          <Text style={styles.loadingText}>Chargement du compte...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Rendu principal
  return (
    <SafeAreaView style={styles.container}>
      {isAuthenticated ? (
        renderMainView()
      ) : (
        <AuthScreen onAuthSuccess={handleAuthSuccess} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    paddingTop: 0,
    paddingBottom: 0,
  },
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
  editContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 16,
    padding: 10,
  },
  editUnit: {
    color: '#666666',
    fontSize: 14,
    marginLeft: 5,
  },
  saveButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#00ff88',
  },
  cancelButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#00ff88',
  },
  statsSection: {
    padding: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#666666',
    fontSize: 14,
  },
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderWidth: 1,
    borderColor: '#ffaa00',
    borderRadius: 8,
    marginBottom: 10,
  },
  warningText: {
    marginLeft: 10,
  },
  warningTitle: {
    color: '#ffaa00',
    fontSize: 16,
    fontWeight: 'bold',
  },
  warningSubtitle: {
    color: '#666666',
    fontSize: 14,
  },
}); 