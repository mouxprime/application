import React, { useState, useEffect, useCallback } from 'react';
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
  FlatList,
  RefreshControl,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import supabaseService from '../services/SupabaseService';

const { width } = Dimensions.get('window');

export default function FriendsScreen({ navigation }) {
  // États principaux
  const [activeTab, setActiveTab] = useState('friends'); // 'friends', 'requests', 'search'
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // États pour les données d'amis
  const [friends, setFriends] = useState([]);
  const [receivedRequests, setReceivedRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);

  // États pour la recherche
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Animation pour les onglets
  const [tabAnimation] = useState(new Animated.Value(0));

  // Chargement initial des données
  useEffect(() => {
    loadAllData();
  }, []);

  // Debounce pour la recherche
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim().length >= 3) {
        searchUsers();
      } else if (searchQuery.trim().length === 0) {
        setSearchResults([]);
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // Animation des onglets
  useEffect(() => {
    const tabIndex = ['friends', 'requests', 'search'].indexOf(activeTab);
    Animated.spring(tabAnimation, {
      toValue: tabIndex,
      useNativeDriver: true,
      tension: 100,
      friction: 8,
    }).start();
  }, [activeTab]);

  // ===============================
  // FONCTIONS DE CHARGEMENT DONNÉES
  // ===============================

  const loadAllData = async () => {
    try {
      setIsLoading(true);
      console.log('🔄 [FRIENDS] Chargement données amis...');

      const [friendsList, requests, sent] = await Promise.all([
        supabaseService.getFriends(),
        supabaseService.getFriendRequests(),
        supabaseService.getSentFriendRequests(),
      ]);

      setFriends(friendsList || []);
      setReceivedRequests(requests || []);
      setSentRequests(sent || []);

      console.log('✅ [FRIENDS] Données chargées:', {
        friends: friendsList?.length || 0,
        received: requests?.length || 0,
        sent: sent?.length || 0,
      });
    } catch (error) {
      console.error('❌ [FRIENDS] Erreur chargement:', error);
      Alert.alert('Erreur', 'Impossible de charger les données des amis');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
  }, []);

  // ===============================
  // FONCTIONS DE RECHERCHE
  // ===============================

  const searchUsers = async () => {
    if (searchQuery.trim().length < 3) return;

    try {
      setIsSearching(true);
      console.log('🔍 [FRIENDS] Recherche:', searchQuery);

      const results = await supabaseService.searchUsersByUsername(searchQuery);
      setSearchResults(results || []);

      console.log('✅ [FRIENDS] Résultats recherche:', results?.length || 0);
    } catch (error) {
      console.error('❌ [FRIENDS] Erreur recherche:', error);
      Alert.alert('Erreur', 'Impossible de rechercher les utilisateurs');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // ===============================
  // FONCTIONS D'ACTIONS AMIS
  // ===============================

  const sendFriendRequest = async (userId, username) => {
    try {
      await supabaseService.sendFriendRequest(userId);
      
      Alert.alert(
        '🎉 Demande envoyée !',
        `Votre demande d'ami a été envoyée à ${username}.`,
        [{ text: 'OK' }]
      );

      // Retirer de la recherche et actualiser les demandes envoyées
      setSearchResults(prev => prev.filter(user => user.user_id !== userId));
      const updated = await supabaseService.getSentFriendRequests();
      setSentRequests(updated || []);
    } catch (error) {
      console.error('❌ [FRIENDS] Erreur envoi demande:', error);
      
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
        ? `🎉 Vous êtes maintenant amis avec ${username} !` 
        : `Demande de ${username} refusée`;
      
      Alert.alert('Succès', message);
      await loadAllData(); // Recharger toutes les données
    } catch (error) {
      console.error('❌ [FRIENDS] Erreur réponse demande:', error);
      Alert.alert('Erreur', 'Impossible de répondre à la demande');
    }
  };

  const removeFriend = async (friendshipId, friendName) => {
    Alert.alert(
      '💔 Supprimer ami',
      `Voulez-vous supprimer ${friendName} de vos amis ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabaseService.removeFriend(friendshipId);
              Alert.alert('✅ Succès', `${friendName} a été supprimé de vos amis`);
              await loadAllData();
            } catch (error) {
              console.error('❌ [FRIENDS] Erreur suppression ami:', error);
              Alert.alert('Erreur', 'Impossible de supprimer l\'ami');
            }
          }
        }
      ]
    );
  };

  const cancelFriendRequest = async (friendshipId, username) => {
    Alert.alert(
      '🚫 Annuler demande',
      `Annuler la demande d'ami envoyée à ${username} ?`,
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Annuler',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabaseService.cancelFriendRequest(friendshipId);
              Alert.alert('✅ Succès', 'Demande d\'ami annulée');
              const updated = await supabaseService.getSentFriendRequests();
              setSentRequests(updated || []);
            } catch (error) {
              console.error('❌ [FRIENDS] Erreur annulation:', error);
              Alert.alert('Erreur', 'Impossible d\'annuler la demande');
            }
          }
        }
      ]
    );
  };

  // ===============================
  // COMPOSANTS DE RENDU
  // ===============================

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity 
        style={styles.backButton}
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="arrow-back" size={24} color="#ffffff" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Amis</Text>
      <TouchableOpacity 
        style={styles.refreshButton}
        onPress={handleRefresh}
      >
        <Ionicons name="refresh" size={24} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );

  const renderTabBar = () => {
    const tabs = [
      { key: 'friends', label: 'Mes amis', icon: 'people', count: friends.length },
      { key: 'requests', label: 'Demandes', icon: 'notifications', count: receivedRequests.length },
      { key: 'search', label: 'Rechercher', icon: 'search', count: null },
    ];

    return (
      <View style={styles.tabBar}>
        {tabs.map((tab, index) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tab,
              activeTab === tab.key && styles.activeTab
            ]}
            onPress={() => setActiveTab(tab.key)}
          >
            <View style={styles.tabContent}>
              <Ionicons 
                name={tab.icon} 
                size={20} 
                color={activeTab === tab.key ? '#ffffff' : '#666666'} 
              />
              <Text style={[
                styles.tabLabel,
                activeTab === tab.key && styles.activeTabLabel
              ]}>
                {tab.label}
              </Text>
              {tab.count !== null && tab.count > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{tab.count}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}
        
        {/* Indicateur animé */}
        <Animated.View
          style={[
            styles.tabIndicator,
            {
              transform: [{
                translateX: tabAnimation.interpolate({
                  inputRange: [0, 1, 2],
                  outputRange: [0, width / 3, (width / 3) * 2],
                })
              }]
            }
          ]}
        />
      </View>
    );
  };

  const renderAvatar = (imageUrl, size = 50) => {
    if (imageUrl) {
      return (
        <Image 
          source={{ uri: imageUrl }} 
          style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]} 
        />
      );
    }
    return (
      <View style={[styles.avatarDefault, { width: size, height: size, borderRadius: size / 2 }]}>
        <Ionicons name="person" size={size * 0.6} color="#666666" />
      </View>
    );
  };

  const renderFriendsTab = () => (
    <FlatList
      data={friends}
      keyExtractor={(item) => item.friendshipId}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#00ff88" />
      }
      renderItem={({ item }) => (
        <View style={styles.friendCard}>
          {renderAvatar(item.user.profile_image_url, 60)}
          
          <View style={styles.friendInfo}>
            <Text style={styles.friendName}>{item.user.username}</Text>
            <Text style={styles.friendBio} numberOfLines={2}>
              {item.user.biography || 'Pas de biographie'}
            </Text>
            <Text style={styles.friendSince}>
              Ami depuis {new Date(item.since).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.removeFriendButton}
            onPress={() => removeFriend(item.friendshipId, item.user.username)}
          >
            <Ionicons name="person-remove" size={20} color="#ff4444" />
          </TouchableOpacity>
        </View>
      )}
      ListEmptyComponent={() => (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={80} color="#666666" />
          <Text style={styles.emptyStateTitle}>Aucun ami pour le moment</Text>
          <Text style={styles.emptyStateSubtitle}>
            Recherchez des utilisateurs pour les ajouter en amis !
          </Text>
          <TouchableOpacity
            style={styles.searchButton}
            onPress={() => setActiveTab('search')}
          >
            <Ionicons name="search" size={18} color="#ffffff" />
            <Text style={styles.searchButtonText}>Rechercher des amis</Text>
          </TouchableOpacity>
        </View>
      )}
      contentContainerStyle={friends.length === 0 ? styles.emptyContainer : styles.listContainer}
    />
  );

  const renderRequestsTab = () => (
    <ScrollView 
      style={styles.requestsContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#00ff88" />
      }
    >
      {/* Demandes reçues */}
      <View style={styles.requestSection}>
        <Text style={styles.sectionTitle}>
          📨 Demandes reçues ({receivedRequests.length})
        </Text>
        <Text style={styles.sectionSubtitle}>
          Nouvelles demandes d'amitié à traiter
        </Text>

        {receivedRequests.length === 0 ? (
          <View style={styles.emptySection}>
            <Ionicons name="mail-open-outline" size={40} color="#666666" />
            <Text style={styles.emptySectionText}>Aucune demande reçue</Text>
          </View>
        ) : (
          receivedRequests.map((request) => (
            <View key={request.id} style={styles.requestCard}>
              {renderAvatar(request.requester.profile_image_url, 50)}
              
              <View style={styles.requestInfo}>
                <Text style={styles.requestName}>{request.requester.username}</Text>
                <Text style={styles.requestBio} numberOfLines={2}>
                  {request.requester.biography || 'Pas de biographie'}
                </Text>
                <Text style={styles.requestDate}>
                  {new Date(request.created_at).toLocaleDateString('fr-FR')}
                </Text>
              </View>

              <View style={styles.requestActions}>
                <TouchableOpacity
                  style={styles.acceptButton}
                  onPress={() => respondToFriendRequest(request.id, 'accepted', request.requester.username)}
                >
                  <Ionicons name="checkmark" size={18} color="#ffffff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.declineButton}
                  onPress={() => respondToFriendRequest(request.id, 'declined', request.requester.username)}
                >
                  <Ionicons name="close" size={18} color="#ffffff" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Demandes envoyées */}
      <View style={styles.requestSection}>
        <Text style={styles.sectionTitle}>
          📤 Demandes envoyées ({sentRequests.length})
        </Text>
        <Text style={styles.sectionSubtitle}>
          En attente de réponse
        </Text>

        {sentRequests.length === 0 ? (
          <View style={styles.emptySection}>
            <Ionicons name="paper-plane-outline" size={40} color="#666666" />
            <Text style={styles.emptySectionText}>Aucune demande envoyée</Text>
          </View>
        ) : (
          sentRequests.map((request) => (
            <View key={request.id} style={styles.sentRequestCard}>
              {renderAvatar(request.addressee.profile_image_url, 45)}
              
              <View style={styles.requestInfo}>
                <Text style={styles.requestName}>{request.addressee.username}</Text>
                <Text style={styles.requestDate}>
                  Envoyée le {new Date(request.created_at).toLocaleDateString('fr-FR')}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => cancelFriendRequest(request.id, request.addressee.username)}
              >
                <Ionicons name="close" size={16} color="#ff4444" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );

  const renderSearchTab = () => (
    <View style={styles.searchContainer}>
      {/* Barre de recherche */}
      <View style={styles.searchInputContainer}>
        <Ionicons name="search" size={20} color="#666666" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Nom d'utilisateur (min. 3 caractères)..."
          placeholderTextColor="#666666"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {isSearching && (
          <ActivityIndicator size="small" color="#00ff88" style={styles.searchLoader} />
        )}
      </View>

      {/* Résultats de recherche */}
      <FlatList
        data={searchResults}
        keyExtractor={(item) => item.user_id}
        renderItem={({ item }) => (
          <View style={styles.searchResultCard}>
            {renderAvatar(item.profile_image_url, 50)}
            
            <View style={styles.resultInfo}>
              <Text style={styles.resultName}>{item.username}</Text>
              <Text style={styles.resultBio} numberOfLines={2}>
                {item.biography || 'Pas de biographie'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.addFriendButton}
              onPress={() => sendFriendRequest(item.user_id, item.username)}
            >
              <Ionicons name="person-add" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={() => {
          if (searchQuery.trim().length === 0) {
            return (
              <View style={styles.searchEmptyState}>
                <Ionicons name="search-outline" size={80} color="#666666" />
                <Text style={styles.emptyStateTitle}>Rechercher des amis</Text>
                <Text style={styles.emptyStateSubtitle}>
                  Tapez au moins 3 caractères pour commencer la recherche
                </Text>
              </View>
            );
          } else if (searchQuery.trim().length < 3) {
            return (
              <View style={styles.searchEmptyState}>
                <Ionicons name="create-outline" size={60} color="#666666" />
                <Text style={styles.emptyStateSubtitle}>
                  Tapez {3 - searchQuery.trim().length} caractère{3 - searchQuery.trim().length > 1 ? 's' : ''} de plus...
                </Text>
              </View>
            );
          } else {
            return (
              <View style={styles.searchEmptyState}>
                <Ionicons name="sad-outline" size={60} color="#666666" />
                <Text style={styles.emptyStateSubtitle}>
                  Aucun utilisateur trouvé pour "{searchQuery}"
                </Text>
              </View>
            );
          }
        }}
        contentContainerStyle={styles.searchResults}
      />
    </View>
  );

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00ff88" />
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      );
    }

    switch (activeTab) {
      case 'friends':
        return renderFriendsTab();
      case 'requests':
        return renderRequestsTab();
      case 'search':
        return renderSearchTab();
      default:
        return renderFriendsTab();
    }
  };

  // ===============================
  // RENDU PRINCIPAL
  // ===============================

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      {renderTabBar()}
      {renderContent()}
    </SafeAreaView>
  );
}

// ===============================
// STYLES
// ===============================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  refreshButton: {
    padding: 5,
  },

  // Barre d'onglets
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    position: 'relative',
  },
  tab: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
  },
  tabContent: {
    alignItems: 'center',
    position: 'relative',
  },
  tabLabel: {
    color: '#666666',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  activeTabLabel: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  tabBadge: {
    position: 'absolute',
    top: -8,
    right: -15,
    backgroundColor: '#ff4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    width: width / 3,
    height: 3,
    backgroundColor: '#00ff88',
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#ffffff',
    marginTop: 10,
    fontSize: 16,
  },

  // Avatars
  avatar: {
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  avatarDefault: {
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },

  // Onglet Amis
  listContainer: {
    padding: 15,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 15,
  },
  friendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
  },
  friendInfo: {
    flex: 1,
    marginLeft: 15,
  },
  friendName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  friendBio: {
    color: '#cccccc',
    fontSize: 14,
    marginBottom: 4,
  },
  friendSince: {
    color: '#666666',
    fontSize: 12,
  },
  removeFriendButton: {
    padding: 10,
  },

  // États vides
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 15,
    marginBottom: 10,
  },
  emptyStateSubtitle: {
    color: '#666666',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00ff88',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  searchButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Onglet Demandes
  requestsContainer: {
    flex: 1,
    padding: 15,
  },
  requestSection: {
    marginBottom: 30,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  sectionSubtitle: {
    color: '#666666',
    fontSize: 14,
    marginBottom: 15,
  },
  emptySection: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptySectionText: {
    color: '#666666',
    fontSize: 14,
    marginTop: 10,
  },

  // Cartes de demandes
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 170, 0, 0.1)',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 170, 0, 0.3)',
  },
  requestInfo: {
    flex: 1,
    marginLeft: 15,
  },
  requestName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  requestBio: {
    color: '#cccccc',
    fontSize: 14,
    marginBottom: 4,
  },
  requestDate: {
    color: '#666666',
    fontSize: 12,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 10,
  },
  acceptButton: {
    backgroundColor: '#00ff88',
    padding: 12,
    borderRadius: 8,
  },
  declineButton: {
    backgroundColor: '#ff4444',
    padding: 12,
    borderRadius: 8,
  },

  // Demandes envoyées
  sentRequestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
  },
  cancelButton: {
    padding: 10,
  },

  // Onglet Recherche
  searchContainer: {
    flex: 1,
    padding: 15,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 15,
    marginBottom: 20,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 16,
    paddingVertical: 15,
  },
  searchLoader: {
    marginLeft: 10,
  },
  searchResults: {
    flexGrow: 1,
  },
  searchEmptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },

  // Résultats de recherche
  searchResultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
  },
  resultInfo: {
    flex: 1,
    marginLeft: 15,
  },
  resultName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  resultBio: {
    color: '#cccccc',
    fontSize: 14,
  },
  addFriendButton: {
    backgroundColor: '#00ff88',
    padding: 12,
    borderRadius: 8,
  },
}); 