import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function ExploreScreen() {
  const [searchText, setSearchText] = useState('');

  const categories = [
    { id: 1, title: 'Technologie', icon: 'laptop', color: '#6C5CE7', count: 24 },
    { id: 2, title: 'Design', icon: 'brush', color: '#FD79A8', count: 18 },
    { id: 3, title: 'Business', icon: 'briefcase', color: '#FDCB6E', count: 31 },
    { id: 4, title: 'Santé', icon: 'fitness', color: '#00B894', count: 12 },
    { id: 5, title: 'Éducation', icon: 'school', color: '#0984E3', count: 27 },
    { id: 6, title: 'Voyage', icon: 'airplane', color: '#E17055', count: 15 },
  ];

  const trendingItems = [
    {
      id: 1,
      title: 'Intelligence Artificielle en 2024',
      subtitle: 'Les dernières tendances et innovations',
      views: '1.2k',
      category: 'Technologie',
    },
    {
      id: 2,
      title: 'Design System Moderne',
      subtitle: 'Guide complet pour créer des interfaces cohérentes',
      views: '856',
      category: 'Design',
    },
    {
      id: 3,
      title: 'Entrepreneuriat Digital',
      subtitle: 'Comment démarrer son business en ligne',
      views: '2.1k',
      category: 'Business',
    },
  ];

  const renderCategory = ({ item }) => (
    <TouchableOpacity style={styles.categoryCard}>
      <View style={[styles.categoryIcon, { backgroundColor: item.color }]}>
        <Ionicons name={item.icon} size={24} color="white" />
      </View>
      <Text style={styles.categoryTitle}>{item.title}</Text>
      <Text style={styles.categoryCount}>{item.count} articles</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Barre de recherche */}
        <View style={styles.searchSection}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher des articles, catégories..."
              value={searchText}
              onChangeText={setSearchText}
              placeholderTextColor="#666"
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')}>
                <Ionicons name="close-circle" size={20} color="#666" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Catégories */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Catégories</Text>
          <FlatList
            data={categories}
            renderItem={renderCategory}
            keyExtractor={(item) => item.id.toString()}
            numColumns={2}
            columnWrapperStyle={styles.categoryRow}
            scrollEnabled={false}
          />
        </View>

        {/* Tendances */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Tendances</Text>
            <TouchableOpacity>
              <Text style={styles.seeAllText}>Voir tout</Text>
            </TouchableOpacity>
          </View>
          
          {trendingItems.map((item) => (
            <TouchableOpacity key={item.id} style={styles.trendingCard}>
              <View style={styles.trendingContent}>
                <View style={styles.trendingInfo}>
                  <Text style={styles.trendingTitle}>{item.title}</Text>
                  <Text style={styles.trendingSubtitle}>{item.subtitle}</Text>
                  <View style={styles.trendingMeta}>
                    <Text style={styles.trendingCategory}>{item.category}</Text>
                    <View style={styles.dot} />
                    <Ionicons name="eye" size={14} color="#999" />
                    <Text style={styles.trendingViews}>{item.views}</Text>
                  </View>
                </View>
                <View style={styles.trendingIcon}>
                  <Ionicons name="trending-up" size={24} color="#FF6B6B" />
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Section recommandations */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recommandé pour vous</Text>
          <View style={styles.recommendationCard}>
            <Ionicons name="sparkles" size={32} color="#FFD700" />
            <Text style={styles.recommendationText}>
              Découvrez du contenu personnalisé basé sur vos intérêts
            </Text>
            <TouchableOpacity style={styles.recommendationButton}>
              <Text style={styles.recommendationButtonText}>Personnaliser</Text>
            </TouchableOpacity>
          </View>
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
  searchSection: {
    backgroundColor: 'white',
    padding: 20,
    marginBottom: 15,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 15,
    height: 50,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  section: {
    marginBottom: 25,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginHorizontal: 20,
    marginBottom: 15,
  },
  seeAllText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  categoryRow: {
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginBottom: 15,
  },
  categoryCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    width: '48%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  categoryIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  categoryCount: {
    fontSize: 14,
    color: '#666',
  },
  trendingCard: {
    backgroundColor: 'white',
    marginHorizontal: 20,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  trendingContent: {
    flexDirection: 'row',
    padding: 15,
  },
  trendingInfo: {
    flex: 1,
  },
  trendingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  trendingSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  trendingMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trendingCategory: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '600',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#999',
    marginHorizontal: 8,
  },
  trendingViews: {
    fontSize: 12,
    color: '#999',
    marginLeft: 4,
  },
  trendingIcon: {
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 15,
  },
  recommendationCard: {
    backgroundColor: 'white',
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  recommendationText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginVertical: 15,
  },
  recommendationButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  recommendationButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
}); 