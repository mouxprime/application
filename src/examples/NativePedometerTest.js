// NativePedometerTest.js
// Test spécifique pour valider les fonctionnalités du podomètre natif optimisé

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform, ScrollView } from 'react-native';
import { Pedometer } from 'expo-sensors';

// *** NOUVEAU: Import du module natif pour test ***
let ExpoNativePedometer = null;
try {
  ExpoNativePedometer = require('../../modules/expo-native-pedometer/src/index');
  console.log('✅ [TEST] Module natif ExpoNativePedometer chargé pour test');
} catch (error) {
  console.log('⚠️ [TEST] Module natif non disponible pour test');
}

const NativePedometerTest = () => {
  const [isAvailable, setIsAvailable] = useState(false);
  const [permissions, setPermissions] = useState(null);
  const [currentData, setCurrentData] = useState(null);
  const [historicalData, setHistoricalData] = useState([]);
  const [isTracking, setIsTracking] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [nativeTestData, setNativeTestData] = useState(null); // *** NOUVEAU: Données test natif ***
  const [nativeSubscription, setNativeSubscription] = useState(null); // *** NOUVEAU: Subscription test ***

  useEffect(() => {
    checkAvailability();
    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, []);

  const checkAvailability = async () => {
    try {
      const available = await Pedometer.isAvailableAsync();
      setIsAvailable(available);
      console.log(`📱 Podomètre disponible: ${available}`);
    } catch (error) {
      console.error('Erreur vérification disponibilité:', error);
    }
  };

  const requestPermissions = async () => {
    try {
      const result = await Pedometer.requestPermissionsAsync();
      setPermissions(result);
      console.log('🔐 Permissions:', result);
      
      if (result.status === 'granted') {
        Alert.alert('Succès', 'Permissions accordées pour le podomètre');
      } else {
        Alert.alert('Erreur', 'Permissions refusées');
      }
    } catch (error) {
      console.error('Erreur demande permissions:', error);
      Alert.alert('Erreur', error.message);
    }
  };

  const startTracking = async () => {
    if (!isAvailable) {
      Alert.alert('Erreur', 'Podomètre non disponible');
      return;
    }

    if (permissions?.status !== 'granted') {
      await requestPermissions();
      return;
    }

    try {
      const sub = Pedometer.watchStepCount(result => {
        setCurrentData(result);
        console.log('📊 Données temps réel:', result);
      });
      
      setSubscription(sub);
      setIsTracking(true);
      Alert.alert('Succès', 'Suivi démarré');
    } catch (error) {
      console.error('Erreur démarrage suivi:', error);
      Alert.alert('Erreur', error.message);
    }
  };

  const stopTracking = () => {
    if (subscription) {
      subscription.remove();
      setSubscription(null);
    }
    setIsTracking(false);
    Alert.alert('Info', 'Suivi arrêté');
  };

  const getHistoricalData = async (hours = 1) => {
    if (!isAvailable || permissions?.status !== 'granted') {
      Alert.alert('Erreur', 'Podomètre non disponible ou permissions manquantes');
      return;
    }

    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - hours * 60 * 60 * 1000);
      
      const data = await Pedometer.getStepCountAsync(startDate, endDate);
      
      const newEntry = {
        period: `${hours}h`,
        startDate: startDate.toLocaleTimeString(),
        endDate: endDate.toLocaleTimeString(),
        ...data
      };
      
      setHistoricalData(prev => [newEntry, ...prev.slice(0, 4)]); // Garder 5 entrées max
      console.log(`📈 Données historiques (${hours}h):`, data);
    } catch (error) {
      console.error('Erreur récupération données historiques:', error);
      Alert.alert('Erreur', error.message);
    }
  };

  const testCMPedometerFeatures = async () => {
    if (Platform.OS !== 'ios') {
      Alert.alert('Info', 'Test spécifique iOS - CMPedometer');
      return;
    }

    // Test des différentes périodes
    await getHistoricalData(0.5); // 30 minutes
    await getHistoricalData(1);   // 1 heure
    await getHistoricalData(6);   // 6 heures
    await getHistoricalData(24);  // 24 heures
    
    Alert.alert('Test CMPedometer', 'Tests des données historiques terminés');
  };

  // *** NOUVEAU: Test du module natif CMPedometer ***
  const testNativeModule = async () => {
    if (Platform.OS !== 'ios' || !ExpoNativePedometer) {
      Alert.alert('Info', 'Module natif CMPedometer non disponible');
      return;
    }

    try {
      console.log('🧪 [TEST-NATIVE] Démarrage test module natif...');
      
      // Vérification de la disponibilité
      const available = await ExpoNativePedometer.isAvailable();
      console.log('🧪 [TEST-NATIVE] Disponibilité:', available);
      
      if (!available) {
        Alert.alert('Test Natif', 'CMPedometer non disponible sur cet appareil');
        return;
      }
      
      // Obtenir le statut
      const status = await ExpoNativePedometer.getStatus();
      console.log('🧪 [TEST-NATIVE] Statut:', status);
      
      // S'abonner aux événements
      const subscription = ExpoNativePedometer.addStepLengthListener((event) => {
        console.log('🧪 [TEST-NATIVE] Événement reçu:', event);
        setNativeTestData({
          ...event,
          receivedAt: new Date().toLocaleTimeString()
        });
      });
      setNativeSubscription(subscription);
      
      // Démarrer le suivi
      await ExpoNativePedometer.startStepLengthTracking();
      console.log('🧪 [TEST-NATIVE] Suivi démarré');
      
      Alert.alert(
        'Test Natif Démarré', 
        'Le module natif CMPedometer est maintenant actif.\n\nMarchéz pour voir les données de distance transmises en temps réel.',
        [
          {
            text: 'Arrêter le test',
            onPress: stopNativeTest
          },
          {
            text: 'Continuer',
            style: 'cancel'
          }
        ]
      );
      
    } catch (error) {
      console.error('🧪 [TEST-NATIVE] Erreur:', error);
      Alert.alert('Erreur Test Natif', error.message);
    }
  };

  const stopNativeTest = async () => {
    try {
      if (nativeSubscription) {
        nativeSubscription.remove();
        setNativeSubscription(null);
      }
      
      if (ExpoNativePedometer) {
        await ExpoNativePedometer.stopStepLengthTracking();
        console.log('🧪 [TEST-NATIVE] Test arrêté');
      }
      
      setNativeTestData(null);
      Alert.alert('Test Natif', 'Test du module natif arrêté');
    } catch (error) {
      console.error('🧪 [TEST-NATIVE] Erreur arrêt:', error);
    }
  };

  const clearData = () => {
    setCurrentData(null);
    setHistoricalData([]);
    setNativeTestData(null); // *** NOUVEAU: Effacer aussi les données natives ***
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Test Podomètre Natif</Text>
      <Text style={styles.subtitle}>
        {Platform.OS === 'ios' ? '🍎 CMPedometer (iOS)' : '🤖 Android Pedometer'}
      </Text>

      {/* État du système */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📱 État du système</Text>
        <Text style={[styles.statusText, isAvailable ? styles.success : styles.error]}>
          Disponible: {isAvailable ? '✅' : '❌'}
        </Text>
        <Text style={[styles.statusText, permissions?.status === 'granted' ? styles.success : styles.warning]}>
          Permissions: {permissions?.status || 'Non demandées'}
        </Text>
        <Text style={[styles.statusText, isTracking ? styles.success : styles.error]}>
          Suivi: {isTracking ? '🟢 Actif' : '🔴 Inactif'}
        </Text>
      </View>

      {/* Contrôles */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🎮 Contrôles</Text>
        <View style={styles.controls}>
          <TouchableOpacity style={styles.button} onPress={requestPermissions}>
            <Text style={styles.buttonText}>Permissions</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.button, isTracking ? styles.stopButton : styles.startButton]} 
            onPress={isTracking ? stopTracking : startTracking}
          >
            <Text style={styles.buttonText}>
              {isTracking ? 'Arrêter' : 'Démarrer'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.button} onPress={() => getHistoricalData(1)}>
            <Text style={styles.buttonText}>Historique 1h</Text>
          </TouchableOpacity>
          
          {Platform.OS === 'ios' && (
            <TouchableOpacity style={styles.button} onPress={testCMPedometerFeatures}>
              <Text style={styles.buttonText}>Test CMPedometer</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity style={styles.button} onPress={testNativeModule}>
            <Text style={styles.buttonText}>Test Native Module</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.button} onPress={clearData}>
            <Text style={styles.buttonText}>Effacer</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Données temps réel */}
      {currentData && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⏱️ Données temps réel</Text>
          <Text style={styles.dataText}>Pas: {currentData.steps}</Text>
          {currentData.distance !== undefined && (
            <Text style={styles.dataText}>Distance: {currentData.distance?.toFixed(2) || 'N/A'} m</Text>
          )}
          {currentData.floorsAscended !== undefined && (
            <Text style={styles.dataText}>Étages montés: {currentData.floorsAscended || 0}</Text>
          )}
          {currentData.floorsDescended !== undefined && (
            <Text style={styles.dataText}>Étages descendus: {currentData.floorsDescended || 0}</Text>
          )}
          <Text style={styles.dataText}>
            Timestamp: {new Date(currentData.timestamp || Date.now()).toLocaleTimeString()}
          </Text>
        </View>
      )}

      {/* *** NOUVEAU: Données du test natif *** */}
      {nativeTestData && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🍎 Test Module Natif CMPedometer</Text>
          <Text style={[styles.dataText, styles.nativeData]}>
            ✅ Longueur de pas: {nativeTestData.stepLength?.toFixed(3)} m
          </Text>
          <Text style={[styles.dataText, styles.nativeData]}>
            ✅ Steps totaux: {nativeTestData.totalSteps}
          </Text>
          <Text style={[styles.dataText, styles.nativeData]}>
            ✅ Distance totale: {nativeTestData.totalDistance?.toFixed(3)} m
          </Text>
          <Text style={styles.dataText}>
            Timestamp: {new Date(nativeTestData.timestamp).toLocaleTimeString()}
          </Text>
          <Text style={styles.dataText}>
            Reçu à: {nativeTestData.receivedAt}
          </Text>
          {nativeTestData.totalSteps > 0 && nativeTestData.totalDistance > 0 && (
            <Text style={[styles.dataText, styles.calculatedData]}>
              📊 Longueur moyenne calculée: {(nativeTestData.totalDistance / nativeTestData.totalSteps).toFixed(3)} m
            </Text>
          )}
          <Text style={styles.infoText}>
            💡 Ces données proviennent directement de CMPedometer.distance
          </Text>
        </View>
      )}

      {/* Données historiques */}
      {historicalData.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📈 Données historiques</Text>
          {historicalData.map((data, index) => (
            <View key={index} style={styles.historyItem}>
              <Text style={styles.historyTitle}>Période: {data.period}</Text>
              <Text style={styles.dataText}>
                {data.startDate} → {data.endDate}
              </Text>
              <Text style={styles.dataText}>Pas: {data.steps}</Text>
              {data.distance !== undefined && (
                <Text style={styles.dataText}>Distance: {data.distance?.toFixed(2) || 'N/A'} m</Text>
              )}
              {data.floorsAscended !== undefined && (
                <Text style={styles.dataText}>Étages montés: {data.floorsAscended || 0}</Text>
              )}
              {data.floorsDescended !== undefined && (
                <Text style={styles.dataText}>Étages descendus: {data.floorsDescended || 0}</Text>
              )}
              {data.steps > 0 && data.distance > 0 && (
                <Text style={styles.dataText}>
                  Longueur de pas moyenne: {(data.distance / data.steps).toFixed(3)} m
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Informations techniques */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔧 Informations techniques</Text>
        <Text style={styles.infoText}>Plateforme: {Platform.OS}</Text>
        <Text style={styles.infoText}>Version: {Platform.Version}</Text>
        {Platform.OS === 'ios' && (
          <>
            <Text style={styles.infoText}>• Utilise CoreMotion/CMPedometer</Text>
            <Text style={styles.infoText}>• Données de distance disponibles</Text>
            <Text style={styles.infoText}>• Comptage d'étages disponible</Text>
            <Text style={styles.infoText}>• Historique illimité</Text>
          </>
        )}
        {Platform.OS === 'android' && (
          <>
            <Text style={styles.infoText}>• Utilise Android Step Counter</Text>
            <Text style={styles.infoText}>• Distance calculée</Text>
            <Text style={styles.infoText}>• Historique limité</Text>
          </>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 5,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    color: '#666',
    fontStyle: 'italic',
  },
  section: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#007AFF',
    marginBottom: 8,
    minWidth: 80,
  },
  startButton: {
    backgroundColor: '#34C759',
  },
  stopButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 12,
  },
  statusText: {
    fontSize: 16,
    marginBottom: 5,
    fontWeight: '500',
  },
  success: {
    color: '#34C759',
  },
  warning: {
    color: '#FF9500',
  },
  error: {
    color: '#FF3B30',
  },
  dataText: {
    fontSize: 14,
    marginBottom: 3,
    color: '#666',
  },
  historyItem: {
    backgroundColor: '#f8f9fa',
    padding: 10,
    borderRadius: 6,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#333',
  },
  infoText: {
    fontSize: 14,
    marginBottom: 2,
    color: '#666',
  },
  nativeData: {
    color: '#007AFF',
  },
  calculatedData: {
    color: '#34C759',
  },
});

export default NativePedometerTest; 