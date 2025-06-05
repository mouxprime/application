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
  Modal,
  KeyboardAvoidingView,
  Platform,
  FlatList,
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
  const [currentView, setCurrentView] = useState('main'); // 'main', 'friends', 'edit-profile'

  // États pour le profil utilisateur
  const [userProfile, setUserProfile] = useState(null);
  const [profileData, setProfileData] = useState({
    username: '',
    biography: '',
    height: 170,
    gender: 'unspecified',
    profileImageUrl: null,
    hasRealEmail: false,
    email: '',
  });

  // États pour l'édition du profil
  const [editMode, setEditMode] = useState({
    biography: false,
    height: false,
  });

  // États pour le système d'amis (SIMPLIFIÉ - juste pour les stats)
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);

  // États pour les modales (SIMPLIFIÉES - suppression des modales amis)
  const [modals, setModals] = useState({
    imageOptions: false,
    addEmail: false,
  });

  // États pour l'ajout d'email
  const [emailData, setEmailData] = useState({
    newEmail: '',
    newPassword: '',
    isLoading: false,
  });

  // États pour les trajets et statistiques
  const [trajectories, setTrajectories] = useState([]);
  const [userStats, setUserStats] = useState(null);

  // Debounce pour la recherche (SUPPRIMÉ - plus nécessaire)
  const handleSearchChange = (text) => {
    setSearchQuery(text);
    
    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Set new timeout
    searchTimeoutRef.current = setTimeout(() => {
      searchUsers(text);
    }, 300); // 300ms debounce
  };

  useEffect(() => {
    initializeAuth();
    
    const unsubscribe = supabaseService.addAuthListener((event, session) => {
      console.log('🔑 [ACCOUNT] Auth change event:', event, 'User:', session?.user?.id);
      
      if (event === 'SIGNED_IN' && session?.user) {
        console.log('✅ [ACCOUNT] User signed in via listener');
        handleAuthSuccess(session.user);
      } else if (event === 'SIGNED_OUT') {
        console.log('🚪 [ACCOUNT] User signed out via listener');
        resetUserData();
      }
    });
    
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const initializeAuth = async () => {
    try {
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

  const resetUserData = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setUserProfile(null);
    setTrajectories([]);
    setUserStats(null);
    setFriends([]);
    setFriendRequests([]);
  };

  const loadUserData = async () => {
    try {
      console.log('🔄 [ACCOUNT] Chargement données utilisateur...');
      
      // Charger le profil utilisateur
      console.log('🔄 [ACCOUNT] Étape 1: Chargement profil...');
      const profile = await supabaseService.getUserProfile();
      console.log('🔄 [ACCOUNT] Profil récupéré:', profile);
      setUserProfile(profile);
      
      if (profile) {
        console.log('🔄 [ACCOUNT] Étape 2: Mise à jour profileData...');
        const newProfileData = {
          username: profile.username || '',
          biography: profile.biography || '',
          height: profile.height || 170,
          gender: profile.gender || 'unspecified',
          profileImageUrl: profile.profile_image_url || null,
          hasRealEmail: profile.has_real_email || false,
          email: profile.email || '',
        };
        console.log('🔄 [ACCOUNT] Nouveau profileData:', newProfileData);
        setProfileData(newProfileData);
        console.log('🔄 [ACCOUNT] ProfileData mis à jour avec succès');
      }
      
      // Charger les données en parallèle
      console.log('🔄 [ACCOUNT] Étape 3: Chargement données parallèles...');
      await Promise.all([
        loadTrajectories(),
        loadFriendsData(),
        loadStats(),
      ]);

      console.log('✅ [ACCOUNT] Données utilisateur chargées');
    } catch (error) {
      console.error('❌ [ACCOUNT] Erreur chargement données utilisateur:', error);
      console.error('❌ [ACCOUNT] Stack trace:', error.stack);
    }
  };

  const loadTrajectories = async () => {
    try {
      console.log('🔄 [ACCOUNT] Chargement trajets...');
      const userTrajectories = await supabaseService.getUserTrajectories();
      console.log('🔄 [ACCOUNT] Trajets récupérés:', userTrajectories?.length || 0);
      setTrajectories(userTrajectories || []);
      console.log('✅ [ACCOUNT] Trajets chargés avec succès');
    } catch (error) {
      console.error('❌ [ACCOUNT] Erreur chargement trajets:', error);
    }
  };

  const loadFriendsData = async () => {
    try {
      console.log('🔄 [ACCOUNT] Chargement données amis...');
      const [friendsList, requests] = await Promise.all([
        supabaseService.getFriends(),
        supabaseService.getFriendRequests(),
      ]);
      console.log('🔄 [ACCOUNT] Amis récupérés:', friendsList?.length || 0);
      console.log('🔄 [ACCOUNT] Demandes récupérées:', requests?.length || 0);
      setFriends(friendsList || []);
      setFriendRequests(requests || []);
      console.log('✅ [ACCOUNT] Données amis chargées avec succès');
    } catch (error) {
      console.error('❌ [ACCOUNT] Erreur chargement amis:', error);
    }
  };

  const loadStats = async () => {
    try {
      console.log('🔄 [ACCOUNT] Chargement statistiques...');
      const stats = await supabaseService.getUserStats();
      console.log('🔄 [ACCOUNT] Stats récupérées:', stats);
      setUserStats(stats);
      console.log('✅ [ACCOUNT] Statistiques chargées avec succès');
    } catch (error) {
      console.error('❌ [ACCOUNT] Erreur chargement statistiques:', error);
    }
  };

  const handleAuthSuccess = async (user) => {
    try {
      setCurrentUser(user);
      setIsAuthenticated(true);
      await loadUserData();
    } catch (error) {
      console.error('❌ [ACCOUNT] Erreur dans handleAuthSuccess:', error);
      setCurrentUser(user);
      setIsAuthenticated(true);
    }
  };

  // Gestion de la photo de profil
  const selectProfileImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission requise', 'L\'accès à la galerie est nécessaire.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadProfileImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('❌ [ACCOUNT] Erreur sélection image:', error);
      Alert.alert('Erreur', 'Impossible de sélectionner l\'image');
    }
    closeModal('imageOptions');
  };

  const takeProfilePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission requise', 'L\'accès à la caméra est nécessaire.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadProfileImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('❌ [ACCOUNT] Erreur prise de photo:', error);
      Alert.alert('Erreur', 'Impossible de prendre la photo');
    }
    closeModal('imageOptions');
  };

  const uploadProfileImage = async (imageUri) => {
    try {
      setIsLoading(true);
      const imageUrl = await supabaseService.uploadProfileImage(imageUri);
      setProfileData(prev => ({ ...prev, profileImageUrl: imageUrl }));
      Alert.alert('Succès', 'Photo de profil mise à jour !');
    } catch (error) {
      console.error('❌ [ACCOUNT] Erreur upload image:', error);
      Alert.alert('Erreur', 'Impossible de mettre à jour la photo');
    } finally {
      setIsLoading(false);
    }
  };

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
            try {
              await supabaseService.deleteProfileImage();
              setProfileData(prev => ({ ...prev, profileImageUrl: null }));
              Alert.alert('Succès', 'Photo de profil supprimée');
            } catch (error) {
              console.error('❌ [ACCOUNT] Erreur suppression photo:', error);
              Alert.alert('Erreur', 'Impossible de supprimer la photo');
            }
            closeModal('imageOptions');
          }
        }
      ]
    );
  };

  // Gestion de l'édition du profil
  const updateProfileField = async (field, value) => {
    try {
      let processedValue = value;
      
      if (['height'].includes(field)) {
        processedValue = parseInt(value);
        if (isNaN(processedValue)) {
          Alert.alert('Erreur', 'Veuillez entrer une valeur numérique valide');
          return;
        }
        
        // Validation des plages
        if (field === 'height' && (processedValue < 100 || processedValue > 250)) {
          Alert.alert('Erreur', 'Taille entre 100 et 250 cm');
          return;
        }
      }

      if (field === 'biography' && value.length > 200) {
        Alert.alert('Erreur', 'La biographie ne peut pas dépasser 200 caractères');
        return;
      }

      // Mettre à jour localement
      setProfileData(prev => ({ ...prev, [field]: processedValue }));
      setEditMode(prev => ({ ...prev, [field]: false }));
      
      // Mettre à jour dans Supabase
      await supabaseService.updateUserProfile({ [field]: processedValue });
      
      Alert.alert('Succès', 'Profil mis à jour');
    } catch (error) {
      console.error(`❌ [ACCOUNT] Erreur mise à jour ${field}:`, error);
      Alert.alert('Erreur', `Impossible de mettre à jour ${field}`);
    }
  };

  // Gestion de l'ajout d'email (CORRIGÉ)
  const handleAddEmail = async () => {
    const { newEmail, newPassword } = emailData;
    
    if (!newEmail.trim() || !newPassword.trim()) {
      Alert.alert('Erreur', 'Email et mot de passe requis');
      return;
    }

    if (!newEmail.includes('@')) {
      Alert.alert('Erreur', 'Format d\'email invalide');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Erreur', 'Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    setEmailData(prev => ({ ...prev, isLoading: true }));

    try {
      const result = await supabaseService.addEmailToAccount(newEmail, newPassword);
      
      Alert.alert(
        'Email ajouté avec succès !',
        result.message,
        [
          { 
            text: 'OK', 
            onPress: () => {
              closeModal('addEmail');
              setEmailData({ newEmail: '', newPassword: '', isLoading: false });
              loadUserData(); // Recharger les données
            }
          }
        ]
      );
    } catch (error) {
      console.error('❌ [ACCOUNT] Erreur ajout email:', error);
      
      let errorMessage = 'Erreur inconnue';
      if (error.message.includes('email address is invalid')) {
        errorMessage = 'Adresse email invalide';
      } else if (error.message.includes('already registered')) {
        errorMessage = 'Cette adresse email est déjà utilisée';
      } else {
        errorMessage = error.message;
      }
      
      Alert.alert('Erreur', errorMessage);
    } finally {
      setEmailData(prev => ({ ...prev, isLoading: false }));
    }
  };

  // Gestion des amis (SUPPRIMÉ - déplacé vers FriendsScreen)
  const searchUsers = async (query) => {
    console.log('🔍 [ACCOUNT-DEBUG] ==================== DEBUT RECHERCHE UI ====================');
    console.log('🔍 [ACCOUNT-DEBUG] Query reçue:', query);
    console.log('🔍 [ACCOUNT-DEBUG] Query après trim:', query.trim());
    
    if (!query.trim()) {
      console.log('🔍 [ACCOUNT-DEBUG] Query vide, reset des résultats');
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    
    try {
      setIsSearching(true);
      console.log('🔍 [ACCOUNT-DEBUG] Démarrage recherche...');
      console.log('🔍 [ACCOUNT-DEBUG] SupabaseService connecté?', supabaseService.isAuthenticated());
      console.log('🔍 [ACCOUNT-DEBUG] Current user:', supabaseService.getCurrentUser()?.id);
      
      const results = await supabaseService.searchUsersByUsername(query);
      
      console.log('🔍 [ACCOUNT-DEBUG] Résultats reçus du service:', results);
      console.log('🔍 [ACCOUNT-DEBUG] Nombre de résultats:', results?.length || 0);
      console.log('🔍 [ACCOUNT-DEBUG] Type des résultats:', typeof results);
      console.log('🔍 [ACCOUNT-DEBUG] Array?', Array.isArray(results));
      
      setSearchResults(results);
      console.log('🔍 [ACCOUNT-DEBUG] setState searchResults terminé');
    } catch (error) {
      console.error('❌ [ACCOUNT-DEBUG] Erreur recherche utilisateurs:', error);
      console.error('❌ [ACCOUNT-DEBUG] Message d\'erreur:', error.message);
      console.error('❌ [ACCOUNT-DEBUG] Stack trace:', error.stack);
      Alert.alert('Erreur', 'Impossible de rechercher les utilisateurs');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
      console.log('🔍 [ACCOUNT-DEBUG] ==================== FIN RECHERCHE UI ====================');
    }
  };

  const sendFriendRequest = async (userId, username) => {
    try {
      await supabaseService.sendFriendRequest(userId);
      Alert.alert(
        'Demande envoyée !', 
        `Votre demande d'ami a été envoyée à ${username}. Ils recevront une notification.`,
        [{ text: 'OK' }]
      );
      // Retirer l'utilisateur des résultats
      setSearchResults(prev => prev.filter(user => user.user_id !== userId));
    } catch (error) {
      console.error('❌ [ACCOUNT] Erreur envoi demande:', error);
      let message = 'Impossible d\'envoyer la demande d\'ami';
      if (error.message.includes('déjà amis')) {
        message = 'Vous êtes déjà amis avec cet utilisateur';
      } else if (error.message.includes('déjà envoyée')) {
        message = 'Demande déjà envoyée à cet utilisateur';
      } else if (error.message.includes('déjà envoyé une demande')) {
        message = 'Cet utilisateur vous a déjà envoyé une demande d\'ami';
      }
      Alert.alert('Erreur', message);
    }
  };

  const respondToFriendRequest = async (friendshipId, response, username) => {
    try {
      await supabaseService.respondToFriendRequest(friendshipId, response);
      const message = response === 'accepted' 
        ? `Vous êtes maintenant amis avec ${username} !` 
        : `Demande de ${username} refusée`;
      Alert.alert('Succès', message);
      await loadFriendsData();
    } catch (error) {
      console.error('❌ [ACCOUNT] Erreur réponse demande:', error);
      Alert.alert('Erreur', 'Impossible de répondre à la demande');
    }
  };

  const removeFriend = async (friendshipId, friendName) => {
    Alert.alert(
      'Supprimer ami',
      `Voulez-vous supprimer ${friendName} de vos amis ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabaseService.removeFriend(friendshipId);
              Alert.alert('Succès', `${friendName} a été supprimé de vos amis`);
              await loadFriendsData();
            } catch (error) {
              console.error('❌ [ACCOUNT] Erreur suppression ami:', error);
              Alert.alert('Erreur', 'Impossible de supprimer l\'ami');
            }
          }
        }
      ]
    );
  };

  // Utilitaires
  const openModal = (modalName) => {
    setModals(prev => ({ ...prev, [modalName]: true }));
  };

  const closeModal = (modalName) => {
    setModals(prev => ({ ...prev, [modalName]: false }));
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
              resetUserData();
            } catch (error) {
              console.error('❌ [ACCOUNT] Erreur déconnexion:', error);
              Alert.alert('Erreur', 'Impossible de se déconnecter');
            }
          }
        }
      ]
    );
  };

  // Rendu de l'en-tête utilisateur
  const renderUserHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity 
        style={styles.profileImageContainer}
        onPress={() => openModal('imageOptions')}
      >
        {profileData.profileImageUrl ? (
          <Image source={{ uri: profileData.profileImageUrl }} style={styles.profileImage} />
        ) : (
          <View style={styles.defaultProfileImage}>
            <Ionicons name="person" size={50} color="#666666" />
          </View>
        )}
        <View style={styles.editImageBadge}>
          <Ionicons name="camera" size={16} color="#ffffff" />
        </View>
      </TouchableOpacity>
      
      <Text style={styles.usernameText}>
        {profileData.username || 'Utilisateur'}
      </Text>
      
      {profileData.biography ? (
        <Text style={styles.biographyText}>{profileData.biography}</Text>
      ) : (
        <TouchableOpacity 
          style={styles.addBiographyButton}
          onPress={() => setEditMode(prev => ({ ...prev, biography: true }))}
        >
          <Text style={styles.addBiographyText}>+ Ajouter une biographie</Text>
        </TouchableOpacity>
      )}
      
      <Text style={styles.memberSince}>
        Membre depuis {userProfile?.created_at ? new Date(userProfile.created_at).toLocaleDateString() : 'Récemment'}
      </Text>
    </View>
  );

  // Rendu des statistiques rapides (AMÉLIORÉ avec redirection)
  const renderQuickStats = () => (
    <View style={styles.quickStats}>
      <TouchableOpacity 
        style={styles.statItem}
        onPress={() => navigation.navigate('Friends')}
      >
        <View style={styles.statContainer}>
          <Text style={styles.statNumber}>{friends.length}</Text>
          <Text style={styles.statLabel}>Amis</Text>
          {friendRequests.length > 0 && (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationText}>{friendRequests.length}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.statItem}
        onPress={() => navigation.navigate('TrajectoryHistory')}
      >
        <Text style={styles.statNumber}>{trajectories.length}</Text>
        <Text style={styles.statLabel}>Trajets</Text>
      </TouchableOpacity>
      
      <View style={styles.statItem}>
        <Text style={styles.statNumber}>
          {userStats?.totalDistance ? `${(userStats.totalDistance / 1000).toFixed(1)}` : '0'}
        </Text>
        <Text style={styles.statLabel}>km</Text>
      </View>
    </View>
  );

  // Rendu principal du contenu
  const renderMainContent = () => (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {renderUserHeader()}
      {renderQuickStats()}
      
      {/* Notification de demandes d'amis (AMÉLIORÉE) */}
      {friendRequests.length > 0 && (
        <TouchableOpacity 
          style={styles.friendRequestNotification}
          onPress={() => navigation.navigate('Friends')}
          activeOpacity={0.8}
        >
          <View style={styles.notificationContent}>
            <Ionicons name="people" size={24} color="#ffaa00" />
            <View style={styles.notificationTextContainer}>
              <Text style={styles.notificationTitle}>
                {friendRequests.length} nouvelle{friendRequests.length > 1 ? 's' : ''} demande{friendRequests.length > 1 ? 's' : ''} d'ami
              </Text>
              <Text style={styles.notificationSubtitle}>
                Cliquez pour voir et répondre aux demandes
              </Text>
            </View>
          </View>
          <View style={styles.notificationButton}>
            <Text style={styles.notificationButtonText}>Voir</Text>
            <Ionicons name="arrow-forward" size={16} color="#000000" />
          </View>
        </TouchableOpacity>
      )}

      {/* Actions principales (AMÉLIORÉES) */}
      <View style={styles.actionButtons}>
        <TouchableOpacity 
          style={[styles.actionButton, styles.friendsButton]}
          onPress={() => navigation.navigate('Friends')}
        >
          <Ionicons name="people" size={24} color="#ffffff" />
          <Text style={styles.actionButtonText}>Mes amis</Text>
          {friendRequests.length > 0 && (
            <View style={styles.actionBadge}>
              <Text style={styles.actionBadgeText}>{friendRequests.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionButton, styles.trajetsButton]}
          onPress={() => navigation.navigate('TrajectoryHistory')}
        >
          <Ionicons name="map" size={24} color="#ffffff" />
          <Text style={styles.actionButtonText}>Mes trajets</Text>
        </TouchableOpacity>
      </View>

      {/* Section Email (SIMPLIFIÉE) */}
      {!profileData.hasRealEmail && (
        <View style={styles.emailSection}>
          <View style={styles.sectionHeader}>
            <Ionicons name="mail-outline" size={20} color="#ffaa00" />
            <Text style={styles.sectionTitle}>Sécurité du compte</Text>
          </View>
          <Text style={styles.sectionDescription}>
            Ajoutez un email pour sécuriser votre compte anonyme
          </Text>
          <TouchableOpacity 
            style={styles.addEmailButton}
            onPress={() => openModal('addEmail')}
          >
            <Ionicons name="shield-checkmark" size={20} color="#000000" />
            <Text style={styles.addEmailButtonText}>Ajouter un email</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bouton de déconnexion */}
      <View style={styles.logoutSection}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out" size={24} color="#ff4444" />
          <Text style={styles.logoutButtonText}>Déconnexion</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.spacer} />
    </ScrollView>
  );

  // Rendu des modales
  const renderModals = () => (
    <View>
      {/* Modal options d'image */}
      <Modal
        visible={modals.imageOptions}
        transparent={true}
        animationType="slide"
        onRequestClose={() => closeModal('imageOptions')}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Photo de profil</Text>
              <TouchableOpacity onPress={() => closeModal('imageOptions')}>
                <Ionicons name="close" size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={styles.modalOption}
              onPress={() => {
                closeModal('imageOptions');
                selectProfileImage();
              }}
            >
              <Ionicons name="image" size={24} color="#00ff88" />
              <Text style={styles.modalOptionText}>Choisir depuis la galerie</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.modalOption}
              onPress={() => {
                closeModal('imageOptions');
                takeProfilePhoto();
              }}
            >
              <Ionicons name="camera" size={24} color="#00ff88" />
              <Text style={styles.modalOptionText}>Prendre une photo</Text>
            </TouchableOpacity>

            {profileData.profileImageUrl && (
              <TouchableOpacity 
                style={styles.modalOption}
                onPress={() => {
                  closeModal('imageOptions');
                  removeProfileImage();
                }}
              >
                <Ionicons name="trash" size={24} color="#ff4444" />
                <Text style={[styles.modalOptionText, { color: '#ff4444' }]}>Supprimer la photo</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal ajout d'email */}
      <Modal
        visible={modals.addEmail}
        transparent={true}
        animationType="slide"
        onRequestClose={() => closeModal('addEmail')}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ajouter un email</Text>
              <TouchableOpacity onPress={() => closeModal('addEmail')}>
                <Ionicons name="close" size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDescription}>
              Ajoutez un email et un mot de passe pour sécuriser votre compte anonyme.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={emailData.newEmail}
                onChangeText={(text) => setEmailData(prev => ({ ...prev, newEmail: text }))}
                placeholder="votre.email@exemple.com"
                placeholderTextColor="#666666"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Mot de passe</Text>
              <TextInput
                style={styles.input}
                value={emailData.newPassword}
                onChangeText={(text) => setEmailData(prev => ({ ...prev, newPassword: text }))}
                placeholder="Minimum 6 caractères"
                placeholderTextColor="#666666"
                secureTextEntry
              />
            </View>

            <TouchableOpacity 
              style={styles.modalButton}
              onPress={handleAddEmail}
              disabled={emailData.isLoading}
            >
              {emailData.isLoading ? (
                <ActivityIndicator size="small" color="#000000" />
              ) : (
                <>
                  <Ionicons name="mail" size={20} color="#000000" />
                  <Text style={styles.modalButtonText}>Ajouter l'email</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );

  // Chargement
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00ff88" />
          <Text style={styles.loadingText}>Chargement du profil...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Rendu principal
  return (
    <SafeAreaView style={styles.container}>
      {isAuthenticated ? (
        <>
          {renderMainContent()}
          {renderModals()}
        </>
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
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 18,
    marginTop: 20,
  },
  header: {
    alignItems: 'center',
    padding: 30,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  profileImageContainer: {
    position: 'relative',
    marginBottom: 20,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#00ff88',
  },
  defaultProfileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#666666',
  },
  editImageBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: '#00ff88',
    padding: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#000000',
  },
  usernameText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  biographyText: {
    color: '#cccccc',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 8,
    lineHeight: 22,
  },
  addBiographyButton: {
    marginBottom: 8,
  },
  addBiographyText: {
    color: '#00ff88',
    fontSize: 16,
    textDecorationLine: 'underline',
  },
  memberSince: {
    color: '#666666',
    fontSize: 14,
  },
  quickStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  statItem: {
    alignItems: 'center',
    padding: 10,
    position: 'relative',
  },
  statContainer: {
    alignItems: 'center',
  },
  statNumber: {
    color: '#00ff88',
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#cccccc',
    fontSize: 14,
    marginTop: 4,
  },
  notificationBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#ff4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#000000',
  },
  notificationText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  warningSection: {
    padding: 20,
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 170, 0, 0.1)',
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ffaa00',
  },
  warningContent: {
    flex: 1,
    marginLeft: 15,
  },
  warningTitle: {
    color: '#ffaa00',
    fontSize: 16,
    fontWeight: 'bold',
  },
  warningSubtitle: {
    color: '#cccccc',
    fontSize: 14,
    marginTop: 4,
  },
  warningButton: {
    backgroundColor: '#ffaa00',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  warningButtonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  editSection: {
    padding: 20,
    backgroundColor: '#1a1a1a',
    marginHorizontal: 20,
    marginVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333333',
  },
  editSectionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  textAreaInput: {
    color: '#ffffff',
    fontSize: 16,
    padding: 15,
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    textAlignVertical: 'top',
    minHeight: 100,
  },
  characterCount: {
    color: '#666666',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 5,
  },
  editButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#666666',
    paddingVertical: 12,
    borderRadius: 8,
    marginRight: 10,
  },
  cancelButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#00ff88',
    paddingVertical: 12,
    borderRadius: 8,
    marginLeft: 10,
  },
  saveButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
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
    backgroundColor: '#1a1a1a',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#333333',
  },
  profileLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 15,
    flex: 1,
  },
  profileValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editableValue: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  profileValue: {
    color: '#cccccc',
    fontSize: 16,
    marginRight: 8,
  },
  inlineEdit: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  numberInput: {
    color: '#ffffff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    minWidth: 60,
    textAlign: 'center',
  },
  unitText: {
    color: '#666666',
    fontSize: 14,
    marginLeft: 8,
    marginRight: 10,
  },
  miniButton: {
    backgroundColor: '#00ff88',
    padding: 8,
    borderRadius: 6,
    marginLeft: 5,
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 15,
    gap: 15,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 12,
    gap: 8,
    position: 'relative',
  },
  friendsButton: {
    backgroundColor: '#00ff88',
  },
  trajetsButton: {
    backgroundColor: '#007acc',
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  actionBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#ff4444',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  spacer: {
    height: 40,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: '#333333',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalSubtitle: {
    color: '#cccccc',
    fontSize: 16,
    marginBottom: 20,
    lineHeight: 22,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  modalOptionText: {
    color: '#ffffff',
    fontSize: 16,
    marginLeft: 15,
    fontWeight: '600',
  },
  modalCancel: {
    backgroundColor: 'transparent',
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  modalCancelText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  requestsSection: {
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  requestsTitle: {
    color: '#ffaa00',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  requestsSubtitle: {
    color: '#cccccc',
    fontSize: 14,
    marginBottom: 10,
  },
  requestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 170, 0, 0.1)',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ffaa00',
  },
  requestUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  requestAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 15,
  },
  requestAvatarDefault: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  requestInfo: {
    flex: 1,
  },
  requestName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  requestBio: {
    color: '#cccccc',
    fontSize: 14,
    marginTop: 2,
  },
  requestDate: {
    color: '#666666',
    fontSize: 12,
    marginTop: 4,
  },
  requestActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  acceptButton: {
    backgroundColor: '#00ff88',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    minWidth: 80,
    justifyContent: 'center',
    gap: 5,
  },
  declineButton: {
    backgroundColor: '#ff4444',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    minWidth: 80,
    justifyContent: 'center',
    gap: 5,
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  friendRequestNotification: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 170, 0, 0.1)',
    padding: 15,
    marginHorizontal: 20,
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#ffaa00',
  },
  notificationContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  notificationTextContainer: {
    flex: 1,
    marginLeft: 15,
  },
  notificationTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  notificationSubtitle: {
    color: '#cccccc',
    fontSize: 14,
  },
  notificationButton: {
    backgroundColor: '#ffaa00',
    padding: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  notificationButtonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  emailSection: {
    padding: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  sectionDescription: {
    color: '#cccccc',
    fontSize: 14,
    marginBottom: 10,
  },
  addEmailButton: {
    backgroundColor: '#ffaa00',
    padding: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  addEmailButtonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  logoutSection: {
    padding: 20,
  },
  logoutButton: {
    backgroundColor: 'transparent',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
}); 