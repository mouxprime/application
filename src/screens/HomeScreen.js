import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const quickActions = [
    { id: 1, title: 'Scanner', icon: 'qr-code', color: '#FF6B6B' },
    { id: 2, title: 'Favoris', icon: 'heart', color: '#4ECDC4' },
    { id: 3, title: 'Historique', icon: 'time', color: '#45B7D1' },
    { id: 4, title: 'Partager', icon: 'share', color: '#FFA726' },
  ];

  const recentItems = [
    { id: 1, title: 'Article récent 1', subtitle: 'Description courte', time: '2h' },
    { id: 2, title: 'Article récent 2', subtitle: 'Description courte', time: '4h' },
    { id: 3, title: 'Article récent 3', subtitle: 'Description courte', time: '1j' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* En-tête de bienvenue */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeText}>Bonjour ! 👋</Text>
          <Text style={styles.subtitleText}>
            Que souhaitez-vous faire aujourd'hui ?
          </Text>
        </View>

        {/* Actions rapides */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions rapides</Text>
          <View style={styles.actionsGrid}>
            {quickActions.map((action) => (
              <TouchableOpacity
                key={action.id}
                style={[styles.actionCard, { backgroundColor: action.color }]}
                activeOpacity={0.8}
              >
                <Ionicons name={action.icon} size={32} color="white" />
                <Text style={styles.actionTitle}>{action.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Activités récentes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Récents</Text>
          {recentItems.map((item) => (
            <TouchableOpacity key={item.id} style={styles.recentCard}>
              <View style={styles.recentContent}>
                <View style={styles.recentInfo}>
                  <Text style={styles.recentTitle}>{item.title}</Text>
                  <Text style={styles.recentSubtitle}>{item.subtitle}</Text>
                </View>
                <View style={styles.recentMeta}>
                  <Text style={styles.recentTime}>{item.time}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#666" />
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Carte de suggestion */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.suggestionCard}>
            <View style={styles.suggestionContent}>
              <Ionicons name="bulb" size={24} color="#FFD700" />
              <View style={styles.suggestionText}>
                <Text style={styles.suggestionTitle}>Astuce du jour</Text>
                <Text style={styles.suggestionDescription}>
                  Découvrez de nouvelles fonctionnalités dans l'onglet Explorer !
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  welcomeSection: {
    padding: 20,
    backgroundColor: 'white',
    marginBottom: 15,
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  subtitleText: {
    fontSize: 16,
    color: '#666',
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginHorizontal: 20,
    marginBottom: 15,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    justifyContent: 'space-between',
  },
  actionCard: {
    width: (width - 60) / 2,
    height: 120,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  recentCard: {
    backgroundColor: 'white',
    marginHorizontal: 20,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  recentContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
  },
  recentInfo: {
    flex: 1,
  },
  recentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  recentSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  recentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recentTime: {
    fontSize: 12,
    color: '#999',
    marginRight: 8,
  },
  suggestionCard: {
    backgroundColor: '#FFF9E6',
    marginHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFE066',
  },
  suggestionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
  },
  suggestionText: {
    flex: 1,
    marginLeft: 12,
  },
  suggestionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  suggestionDescription: {
    fontSize: 14,
    color: '#666',
  },
}); 