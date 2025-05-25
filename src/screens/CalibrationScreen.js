import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useLocalization } from '../context/LocalizationContext';
import { OrientationCalibrator } from '../algorithms/OrientationCalibrator';
import { LocalizationSDK } from '../algorithms/LocalizationSDK';
import * as Haptics from 'expo-haptics';

export default function CalibrationScreen() {
  const { state, actions } = useLocalization();
  const [calibrationStep, setCalibrationStep] = useState(0);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [pocketCalibrationError, setPocketCalibrationError] = useState(null);
  const [orientationCalibrator] = useState(() => new OrientationCalibrator());
  const [localizationSDK] = useState(() => new LocalizationSDK({
    userHeight: 1.7,
    adaptiveSampling: true,
    energyOptimization: true
  }));
  const progressAnim = new Animated.Value(0);

  const calibrationSteps = [
    {
      title: 'Préparation',
      description: 'Préparez-vous pour la calibration en 2 étapes',
      icon: 'information-circle',
      duration: 0
    },
    {
      title: 'Étape 1: Téléphone à Plat',
      description: 'Placez votre téléphone à plat sur une surface stable pendant 5 secondes',
      icon: 'phone-portrait',
      duration: 5000
    },
    {
      title: 'Étape 2: Téléphone en Poche',
      description: 'Placez votre téléphone dans votre poche et attendez (7 secondes total)',
      icon: 'wallet',
      duration: 7000
    },
    {
      title: 'Terminé',
      description: 'Calibration terminée ! Vous recevrez une vibration.',
      icon: 'checkmark-circle',
      duration: 0
    }
  ];

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: calibrationProgress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [calibrationProgress]);

  const startCalibration = async () => {
    if (isCalibrating) return;

    Alert.alert(
      'Commencer la calibration',
      'Assurez-vous d\'être dans un environnement calme et stable.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Commencer',
          onPress: () => performCalibration()
        }
      ]
    );
  };

  const performCalibration = async () => {
    setIsCalibrating(true);
    setCalibrationStep(1);
    setCalibrationProgress(0);
    setPocketCalibrationError(null);
    actions.setCalibrating(true);

    try {
      // Initialiser le SDK de localisation
      if (!localizationSDK.isInitialized) {
        await localizationSDK.initialize();
      }

      // Utiliser la calibration complète du LocalizationSDK
      await localizationSDK.calibrateAll((progressInfo) => {
        const { step, progress, message, pocketCalibration } = progressInfo;
        
        // Mise à jour de l'affichage selon l'étape
        if (step === 'sensors') {
          setCalibrationStep(1);
          setCalibrationProgress(progress * 100);
        } else if (step === 'pocket') {
          setCalibrationStep(2);
          setCalibrationProgress(progress * 100);
        } else if (step === 'complete') {
          setCalibrationStep(3);
          setCalibrationProgress(100);
          
          // Stocker la matrice de calibration dans le contexte
          if (pocketCalibration && pocketCalibration.rotationMatrix) {
            actions.setPocketCalibrationMatrix(
              pocketCalibration.rotationMatrix, 
              pocketCalibration.avgGravity
            );
          }
        }
        
        // Gestion des erreurs de calibration poche
        if (message && message.includes('Mouvement détecté')) {
          setPocketCalibrationError(message);
        } else {
          setPocketCalibrationError(null);
        }
      });
      
      // Terminé avec vibration
      setCalibrationStep(3);
      setCalibrationProgress(100);
      actions.setCalibrating(false);
      
      // Vibration de fin
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } catch (error) {
        console.warn('Vibration non disponible:', error);
      }
      
      Alert.alert(
        'Succès', 
        'Calibration terminée avec succès !\\n\\nVotre appareil est calibré pour un usage en poche.'
      );
      
    } catch (error) {
      console.error('Erreur calibration:', error);
      Alert.alert('Erreur', 'Échec de la calibration. Veuillez réessayer.');
      actions.setCalibrating(false);
    } finally {
      setIsCalibrating(false);
    }
  };

  /**
   * Répéter la calibration complète en cas d'erreur
   */
  const retryCalibration = async () => {
    setPocketCalibrationError(null);
    setCalibrationStep(1);
    setCalibrationProgress(0);
    
    try {
      await performCalibration();
    } catch (error) {
      setPocketCalibrationError(`Erreur: ${error.message}`);
    }
  };

  const resetCalibration = () => {
    Alert.alert(
      'Réinitialiser la calibration',
      'Cela effacera toutes les données de calibration existantes.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Réinitialiser',
          style: 'destructive',
          onPress: () => {
            setCalibrationStep(0);
            setCalibrationProgress(0);
            setPocketCalibrationError(null);
            actions.setCalibrating(false);
            
            // Réinitialiser le calibrateur d'orientation et le SDK
            orientationCalibrator.isCalibrated = false;
            if (localizationSDK.isInitialized) {
              // Reset du SDK si besoin
              console.log('Calibration réinitialisée');
            }
          }
        }
      ]
    );
  };

  const getCurrentStepInfo = () => {
    return calibrationSteps[calibrationStep] || calibrationSteps[0];
  };

  const renderCalibrationStatus = () => {
    return (
      <View style={styles.statusContainer}>
        <Text style={styles.statusTitle}>État de la calibration</Text>
        
        <View style={styles.statusGrid}>
          <View style={styles.statusItem}>
            <Ionicons 
              name="phone-portrait" 
              size={24} 
              color={calibrationProgress > 50 ? '#00ff88' : '#666666'} 
            />
            <Text style={[
              styles.statusLabel,
              { color: calibrationProgress > 50 ? '#00ff88' : '#666666' }
            ]}>
              Téléphone à Plat
            </Text>
          </View>
          
          <View style={styles.statusItem}>
            <Ionicons 
              name="wallet" 
              size={24} 
              color={calibrationProgress >= 100 ? '#00ff88' : '#666666'} 
            />
            <Text style={[
              styles.statusLabel,
              { color: calibrationProgress >= 100 ? '#00ff88' : '#666666' }
            ]}>
              Téléphone en Poche
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderProgressBar = () => {
    return (
      <View style={styles.progressContainer}>
        <Text style={styles.progressTitle}>Progression</Text>
        <View style={styles.progressBar}>
          <Animated.View 
            style={[
              styles.progressFill,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 100],
                  outputRange: ['0%', '100%']
                })
              }
            ]} 
          />
        </View>
        <Text style={styles.progressText}>
          {Math.round(calibrationProgress)}%
        </Text>
      </View>
    );
  };

  const renderCurrentStep = () => {
    const stepInfo = getCurrentStepInfo();
    
    return (
      <View style={styles.stepContainer}>
        <View style={styles.stepIcon}>
          <Ionicons 
            name={stepInfo.icon} 
            size={64} 
            color={isCalibrating ? '#00ff88' : '#ffffff'} 
          />
        </View>
        
        <Text style={styles.stepTitle}>{stepInfo.title}</Text>
        <Text style={styles.stepDescription}>{stepInfo.description}</Text>
        
        {isCalibrating && (
          <View style={styles.pulseContainer}>
            <View style={styles.pulseRing} />
            <Text style={styles.calibratingText}>
              {calibrationStep === 1 ? 'Étape 1: Téléphone à plat...' : 
               calibrationStep === 2 ? 'Étape 2: Téléphone en poche...' : 
               'Calibration en cours...'}
            </Text>
          </View>
        )}
        
        {/* Affichage des erreurs de calibration poche */}
        {pocketCalibrationError && (
          <View style={styles.errorContainer}>
            <Ionicons name="warning" size={24} color="#ff4444" />
            <Text style={styles.errorText}>{pocketCalibrationError}</Text>
            <TouchableOpacity 
              style={styles.retryButton}
              onPress={retryCalibration}
            >
              <Text style={styles.retryButtonText}>Recommencer Calibration</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderSensorData = () => {
    if (!state.sensors) return null;

    return (
      <View style={styles.sensorDataContainer}>
        <Text style={styles.sensorDataTitle}>Données actuelles</Text>
        
        <View style={styles.sensorRow}>
          <Text style={styles.sensorLabel}>Accélération:</Text>
          <Text style={styles.sensorValue}>
            X: {state.sensors.accelerometer?.x?.toFixed(2) || '0.00'} m/s²
          </Text>
        </View>
        
        <View style={styles.sensorRow}>
          <Text style={styles.sensorLabel}>Rotation:</Text>
          <Text style={styles.sensorValue}>
            Z: {state.sensors.gyroscope?.z?.toFixed(3) || '0.000'} rad/s
          </Text>
        </View>
        
        <View style={styles.sensorRow}>
          <Text style={styles.sensorLabel}>Champ magnétique:</Text>
          <Text style={styles.sensorValue}>
            Magnitude: {
              state.sensors.magnetometer 
                ? Math.sqrt(
                    state.sensors.magnetometer.x ** 2 + 
                    state.sensors.magnetometer.y ** 2 + 
                    state.sensors.magnetometer.z ** 2
                  ).toFixed(1)
                : '0.0'
            } µT
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* État de la calibration */}
        {renderCalibrationStatus()}
        
        {/* Barre de progression */}
        {renderProgressBar()}
        
        {/* Étape actuelle */}
        {renderCurrentStep()}
        
        {/* Données des capteurs */}
        {renderSensorData()}
        
        {/* Contrôles */}
        <View style={styles.controlsContainer}>
          <TouchableOpacity 
            style={[
              styles.primaryButton,
              isCalibrating && styles.disabledButton
            ]}
            onPress={startCalibration}
            disabled={isCalibrating}
          >
            <Ionicons 
              name={isCalibrating ? "hourglass" : "play"} 
              size={20} 
              color="#ffffff" 
            />
            <Text style={styles.buttonText}>
              {isCalibrating ? 'Calibration...' : 'Démarrer la calibration'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.secondaryButton}
            onPress={resetCalibration}
            disabled={isCalibrating}
          >
            <Ionicons name="refresh" size={20} color="#00ff88" />
            <Text style={styles.secondaryButtonText}>Réinitialiser</Text>
          </TouchableOpacity>
        </View>
        
        {/* Description de la calibration simplifiée */}
        <View style={styles.descriptionContainer}>
          <Text style={styles.descriptionTitle}>📱 Calibration Simplifiée</Text>
          <Text style={styles.descriptionText}>
            Calibration rapide en 2 étapes : téléphone à plat (5s) puis en poche (7s). Une vibration vous signalera la fin.
          </Text>
        </View>

        {/* Conseils */}
        <View style={styles.tipsContainer}>
          <Text style={styles.tipsTitle}>💡 Conseils</Text>
          <Text style={styles.tipsText}>
            • Étape 1 : Posez votre téléphone à plat sur une surface stable{'\n'}
            • Restez immobile pendant 5 secondes{'\n'}
            • Étape 2 : Placez le téléphone dans votre poche{'\n'}
            • Attendez 2 secondes puis restez immobile 5 secondes{'\n'}
            • Une vibration vous confirmera la fin de calibration
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  statusContainer: {
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 136, 0.3)',
  },
  statusTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  statusGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statusItem: {
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  progressContainer: {
    marginBottom: 30,
  },
  progressTitle: {
    color: '#ffffff',
    fontSize: 14,
    marginBottom: 10,
    textAlign: 'center',
  },
  progressBar: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 4,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#00ff88',
    borderRadius: 4,
  },
  progressText: {
    color: '#ffffff',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  stepContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  stepIcon: {
    marginBottom: 20,
  },
  stepTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  stepDescription: {
    color: '#cccccc',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  pulseContainer: {
    alignItems: 'center',
    position: 'relative',
  },
  pulseRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: '#00ff88',
    opacity: 0.6,
  },
  calibratingText: {
    color: '#00ff88',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    borderRadius: 8,
    padding: 15,
    marginTop: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.3)',
  },
  errorText: {
    color: '#ff4444',
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 10,
  },
  retryButton: {
    backgroundColor: '#ff4444',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 6,
    marginTop: 10,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  descriptionContainer: {
    backgroundColor: 'rgba(0, 123, 255, 0.1)',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: 'rgba(0, 123, 255, 0.3)',
  },
  descriptionTitle: {
    color: '#007bff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  descriptionText: {
    color: '#cccccc',
    fontSize: 14,
    lineHeight: 20,
  },
  sensorDataContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 8,
    padding: 15,
    marginBottom: 20,
  },
  sensorDataTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  sensorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sensorLabel: {
    color: '#888888',
    fontSize: 12,
  },
  sensorValue: {
    color: '#ffffff',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  controlsContainer: {
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: '#00ff88',
    borderRadius: 8,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  disabledButton: {
    backgroundColor: '#666666',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#00ff88',
    borderRadius: 8,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#00ff88',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  tipsContainer: {
    backgroundColor: 'rgba(255, 170, 0, 0.1)',
    borderRadius: 8,
    padding: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 170, 0, 0.3)',
  },
  tipsTitle: {
    color: '#ffaa00',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  tipsText: {
    color: '#cccccc',
    fontSize: 12,
    lineHeight: 18,
  },
}); 