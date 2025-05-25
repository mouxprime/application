import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import MainNavigator from './src/navigation/MainNavigator';
import { LocalizationProvider } from './src/context/LocalizationContext';

export default function App() {
  return (
    <SafeAreaProvider>
      <LocalizationProvider>
        <NavigationContainer>
          <MainNavigator />
          <StatusBar style="light" backgroundColor="#1a1a1a" />
        </NavigationContainer>
      </LocalizationProvider>
    </SafeAreaProvider>
  );
}
