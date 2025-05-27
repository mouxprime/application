import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import MapScreen from '../screens/MapScreen';
import SensorsScreen from '../screens/SensorsScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import AccountScreen from '../screens/AccountScreen';

const Tab = createBottomTabNavigator();

export default function MainNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Carte') {
            iconName = focused ? 'map' : 'map-outline';
          } else if (route.name === 'Capteurs') {
            iconName = focused ? 'hardware-chip' : 'hardware-chip-outline';
          } else if (route.name === 'Analytique') {
            iconName = focused ? 'analytics' : 'analytics-outline';
          } else if (route.name === 'Mon Compte') {
            iconName = focused ? 'person' : 'person-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#00ff88',
        tabBarInactiveTintColor: '#888888',
        tabBarStyle: {
          backgroundColor: '#1a1a1a',
          borderTopColor: '#333333',
          borderTopWidth: 1,
        },
        headerStyle: {
          backgroundColor: '#1a1a1a',
        },
        headerTintColor: '#ffffff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      })}
    >
      <Tab.Screen 
        name="Carte" 
        component={MapScreen}
        options={{
          headerTitle: 'Localisation Intérieure'
        }}
      />
      <Tab.Screen 
        name="Capteurs" 
        component={SensorsScreen}
        options={{
          headerTitle: 'Données Capteurs'
        }}
      />

      <Tab.Screen 
        name="Analytique" 
        component={AnalyticsScreen}
        options={{
          headerTitle: 'Analyse Performance'
        }}
      />

      <Tab.Screen 
        name="Mon Compte" 
        component={AccountScreen}
        options={{
          headerTitle: 'Mon Compte'
        }}
      />
    </Tab.Navigator>
  );
} 