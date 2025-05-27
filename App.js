import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import MainNavigator from './src/navigation/MainNavigator';
import { LocalizationProvider } from './src/context/LocalizationContext';
import { AuthProvider } from './src/context/AuthContext';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <LocalizationProvider>
          <NavigationContainer>
            <MainNavigator />
            <StatusBar style="light" backgroundColor="#1a1a1a" />
          </NavigationContainer>
        </LocalizationProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
