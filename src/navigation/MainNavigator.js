import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, Text, StyleSheet, Dimensions } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';

import MapScreen from '../screens/MapScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import ConfigurationScreen from '../screens/ConfigurationScreen';
import AccountScreen from '../screens/AccountScreen';
import TrajectoryHistoryScreen from '../screens/TrajectoryHistoryScreen';
import FriendsScreen from '../screens/FriendsScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();
const { width: screenWidth } = Dimensions.get('window');

// Stack Navigator pour l'écran Account (pour permettre la navigation vers TrajectoryHistory et Friends)
function AccountStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: '#1a1a1a',
        },
        headerTintColor: '#ffffff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen 
        name="AccountMain" 
        component={AccountScreen} 
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="TrajectoryHistory" 
        component={TrajectoryHistoryScreen} 
        options={{ 
          title: 'Historique des Trajets',
          headerShown: false // Le composant gère son propre header
        }}
      />
      <Stack.Screen 
        name="Friends" 
        component={FriendsScreen} 
        options={{ 
          title: 'Mes Amis',
          headerShown: false // Le composant gère son propre header
        }}
      />
    </Stack.Navigator>
  );
}

// Configuration des onglets avec leurs informations
const tabsConfig = [
  {
    name: 'Carte',
    component: MapScreen,
    iconFocused: 'map',
    iconUnfocused: 'map-outline',
  },
  {
    name: 'Analytique',
    component: AnalyticsScreen,
    headerTitle: 'Analyse & Capteurs',
    iconFocused: 'analytics',
    iconUnfocused: 'analytics-outline',
  },
  {
    name: 'Configuration',
    component: ConfigurationScreen,
    headerTitle: 'Configuration & Paramètres',
    iconFocused: 'settings',
    iconUnfocused: 'settings-outline',
  },
  {
    name: 'Mon Compte',
    component: AccountStack, // Utiliser le Stack au lieu du composant direct
    headerTitle: 'Mon Compte',
    iconFocused: 'person',
    iconUnfocused: 'person-outline',
  },
];

export default function MainNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          const tabConfig = tabsConfig.find(tab => tab.name === route.name);
          const iconName = focused ? tabConfig?.iconFocused : tabConfig?.iconUnfocused;
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#00ff88',
        tabBarInactiveTintColor: '#888888',
        tabBarStyle: {
          backgroundColor: '#1a1a1a',
          borderTopColor: '#333333',
          borderTopWidth: 1,
          paddingHorizontal: 0, // Supprimer le padding pour permettre le scroll
        },
        tabBarScrollEnabled: true, // Activer le scroll horizontal
        tabBarItemStyle: {
          minWidth: 80, // Largeur minimale pour chaque onglet
          maxWidth: screenWidth / 3, // Largeur maximale
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        headerStyle: {
          backgroundColor: '#1a1a1a',
        },
        headerTintColor: '#ffffff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      })}
      tabBar={(props) => <ScrollableTabBar {...props} />}
    >
      {tabsConfig.map((tab) => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          component={tab.component}
          options={{
            headerTitle: tab.headerTitle,
            headerShown: !['Carte', 'Configuration', 'Mon Compte'].includes(tab.name),
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

// Composant de barre d'onglets scrollable personnalisée
function ScrollableTabBar({ state, descriptors, navigation }) {
  const focusedOptions = descriptors[state.routes[state.index].key].options;

  if (focusedOptions.tabBarVisible === false) {
    return null;
  }

  return (
    <View style={styles.tabBarContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollView}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = options.tabBarLabel !== undefined
            ? options.tabBarLabel
            : options.title !== undefined
            ? options.title
            : route.name;

          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          // Obtenir l'icône depuis la configuration
          const tabConfig = tabsConfig.find(tab => tab.name === route.name);
          const iconName = isFocused ? tabConfig?.iconFocused : tabConfig?.iconUnfocused;
          const color = isFocused ? '#00ff88' : '#888888';

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              style={[
                styles.tabItem,
                isFocused && styles.tabItemFocused
              ]}
            >
              <Ionicons name={iconName} size={24} color={color} />
              <Text style={[styles.tabLabel, { color }]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    backgroundColor: '#1a1a1a',
    borderTopColor: '#333333',
    borderTopWidth: 1,
    paddingBottom: 20, // Espace pour les appareils avec encoche
  },
  scrollView: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    minWidth: 80,
    borderRadius: 12,
    marginHorizontal: 4,
  },
  tabItemFocused: {
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 136, 0.3)',
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
}); 