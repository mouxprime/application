import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, Line, Text as SvgText, G } from 'react-native-svg';
import * as Battery from 'expo-battery';

import { useLocalization } from '../context/LocalizationContext';
import { configurationService } from '../services/ConfigurationService';

const { width: screenWidth } = Dimensions.get('window');

export default function SensorsScreen() {
  const { state } = useLocalization();
  const [sensorHistory, setSensorHistory] = useState({
    accelerometer: [],
    gyroscope: [],
    magnetometer: []
  });
  const [maxHistoryLength] = useState(100); // Nombre de points à afficher

  // États pour la batterie réelle
  const [batteryLevel, setBatteryLevel] = useState(1.0);
  const [batteryState, setBatteryState] = useState('unknown');
  
  // États pour la configuration des capteurs
  const [sensorsConfig, setSensorsConfig] = useState({
    frequency: 50,
    enabled: { accelerometer: true, gyroscope: true },
    limits: { minFrequency: 5, maxFrequency: 75 }
  });
  
  // États pour les modales
  const [showSamplingModal, setShowSamplingModal] = useState(false);
  const [tempSamplingRate, setTempSamplingRate] = useState(50);

  // Initialisation de la batterie et configuration
  useEffect(() => {
    const initializeBatteryAndConfig = async () => {
      try {
        // Initialiser la batterie
        const level = await Battery.getBatteryLevelAsync();
        const batteryState = await Battery.getBatteryStateAsync();
        setBatteryLevel(level);
        setBatteryState(batteryState);
        
        // Initialiser la configuration des capteurs
        if (!configurationService.isInitialized) {
          await configurationService.initialize();
        }
        const config = configurationService.getSensorsConfiguration();
        setSensorsConfig(config);
        setTempSamplingRate(config.frequency);
        
        console.log('🔋 [SENSORS-SCREEN] Batterie:', (level * 100).toFixed(1) + '%', batteryState);
        console.log('🔧 [SENSORS-SCREEN] Configuration capteurs:', config);
      } catch (error) {
        console.error('❌ [SENSORS-SCREEN] Erreur initialisation:', error);
      }
    };

    initializeBatteryAndConfig();

    // Mise à jour batterie toutes les 30 secondes
    const batteryInterval = setInterval(async () => {
      try {
        const level = await Battery.getBatteryLevelAsync();
        const batteryState = await Battery.getBatteryStateAsync();
        setBatteryLevel(level);
        setBatteryState(batteryState);
      } catch (error) {
        console.warn('⚠️ [SENSORS-SCREEN] Erreur mise à jour batterie:', error);
      }
    }, 30000);

    return () => clearInterval(batteryInterval);
  }, []);

  // *** CORRECTION: Mise à jour de l'historique des capteurs avec throttling ***
  useEffect(() => {
    if (state.sensors && state.sensors.timestamp) {
      // Throttling: mettre à jour seulement toutes les 100ms
      const now = Date.now();
      const lastUpdate = sensorHistory.lastUpdate || 0;
      
      if (now - lastUpdate >= 100) {
        setSensorHistory(prev => {
          const newHistory = { ...prev, lastUpdate: now };
          
          // Ajout des nouvelles données avec timestamp
          const timestamp = now;
          
          if (state.sensors.accelerometer) {
            newHistory.accelerometer = [
              ...prev.accelerometer.slice(-maxHistoryLength + 1),
              { ...state.sensors.accelerometer, timestamp }
            ];
          }
          
          if (state.sensors.gyroscope) {
            newHistory.gyroscope = [
              ...prev.gyroscope.slice(-maxHistoryLength + 1),
              { ...state.sensors.gyroscope, timestamp }
            ];
          }
          
          if (state.sensors.magnetometer) {
            newHistory.magnetometer = [
              ...prev.magnetometer.slice(-maxHistoryLength + 1),
              { ...state.sensors.magnetometer, timestamp }
            ];
          }
          
          return newHistory;
        });
      }
    }
  }, [state.sensors?.timestamp]); // Dépendance plus spécifique

  /**
   * Génération d'un graphique SVG pour un capteur
   */
  const renderSensorGraph = (sensorType, data, title, unit) => {
    if (!data || data.length === 0) {
      return (
        <View style={styles.graphContainer}>
          <Text style={styles.graphTitle}>{title}</Text>
          <View style={styles.noDataContainer}>
            <Text style={styles.noDataText}>Aucune donnée disponible</Text>
          </View>
        </View>
      );
    }

    const graphWidth = screenWidth - 40;
    const graphHeight = 120;
    const padding = 20;

    // Calcul des valeurs min/max pour normalisation
    const allValues = data.flatMap(d => [d.x, d.y, d.z]);
    const minValue = Math.min(...allValues);
    const maxValue = Math.max(...allValues);
    const range = maxValue - minValue || 1;

    // Génération des chemins SVG
    const generatePath = (values, color) => {
      if (values.length < 2) return null;

      const points = values.map((value, index) => {
        const x = padding + (index / (values.length - 1)) * (graphWidth - 2 * padding);
        const y = padding + (1 - (value - minValue) / range) * (graphHeight - 2 * padding);
        return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
      }).join(' ');

      return <Path d={points} stroke={color} strokeWidth="2" fill="none" />;
    };

    const xValues = data.map(d => d.x);
    const yValues = data.map(d => d.y);
    const zValues = data.map(d => d.z);

    return (
      <View style={styles.graphContainer}>
        <Text style={styles.graphTitle}>{title}</Text>
        <Svg width={graphWidth} height={graphHeight} style={styles.graph}>
          {/* Grille de fond */}
          <G>
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => {
              const y = padding + ratio * (graphHeight - 2 * padding);
              return (
                <Line
                  key={`grid-${index}`}
                  x1={padding}
                  y1={y}
                  x2={graphWidth - padding}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.1)"
                  strokeWidth="1"
                />
              );
            })}
          </G>
          
          {/* Lignes de données */}
          {generatePath(xValues, '#ff6b6b')}
          {generatePath(yValues, '#4ecdc4')}
          {generatePath(zValues, '#45b7d1')}
        </Svg>
        
        {/* Légende */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#ff6b6b' }]} />
            <Text style={styles.legendText}>X: {data[data.length - 1]?.x.toFixed(2)} {unit}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#4ecdc4' }]} />
            <Text style={styles.legendText}>Y: {data[data.length - 1]?.y.toFixed(2)} {unit}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#45b7d1' }]} />
            <Text style={styles.legendText}>Z: {data[data.length - 1]?.z.toFixed(2)} {unit}</Text>
          </View>
        </View>
      </View>
    );
  };

  /**
   * Affichage des métriques dérivées
   */
  const renderDerivedMetrics = () => {
    const acceleration = state.sensors.accelerometer;
    const gyroscope = state.sensors.gyroscope;
    const magnetometer = state.sensors.magnetometer;

    // Calculs dérivés
    const accelerationMagnitude = acceleration 
      ? Math.sqrt(acceleration.x ** 2 + acceleration.y ** 2 + acceleration.z ** 2)
      : 0;

    const gyroscopeMagnitude = gyroscope
      ? Math.sqrt(gyroscope.x ** 2 + gyroscope.y ** 2 + gyroscope.z ** 2)
      : 0;

    const magneticHeading = magnetometer
      ? Math.atan2(magnetometer.y, magnetometer.x) * 180 / Math.PI
      : 0;

    return (
      <View style={styles.metricsContainer}>
        <Text style={styles.sectionTitle}>Métriques Dérivées</Text>
        
        <View style={styles.metricRow}>
          <View style={styles.metricCard}>
            <Ionicons name="speedometer" size={24} color="#00ff88" />
            <Text style={styles.metricLabel}>Accél. Totale</Text>
            <Text style={styles.metricValue}>{accelerationMagnitude.toFixed(2)} m/s²</Text>
          </View>
          
          <View style={styles.metricCard}>
            <Ionicons name="refresh" size={24} color="#ff8800" />
            <Text style={styles.metricLabel}>Rotation</Text>
            <Text style={styles.metricValue}>{gyroscopeMagnitude.toFixed(2)} rad/s</Text>
          </View>
        </View>

        <View style={styles.metricRow}>
          <View style={styles.metricCard}>
            <Ionicons name="compass" size={24} color="#0088ff" />
            <Text style={styles.metricLabel}>Cap Magnétique</Text>
            <Text style={styles.metricValue}>{magneticHeading.toFixed(1)}°</Text>
          </View>
          
          <View style={styles.metricCard}>
            <Ionicons name="pulse" size={24} color="#ff4444" />
            <Text style={styles.metricLabel}>État</Text>
            <Text style={styles.metricValue}>
              {state.isTracking ? 'ACTIF' : 'ARRÊTÉ'}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  /**
   * Métriques PDR (Pedestrian Dead Reckoning)
   */
  const renderPDRMetrics = () => {
    const getActivityColor = (mode) => {
      switch (mode) {
        case 'walking': return '#00ff88';
        case 'running': return '#ff8800';
        case 'crawling': return '#ffaa00';
        case 'stationary': return '#666666';
        default: return '#ffffff';
      }
    };

    const getActivityLabel = (mode) => {
      switch (mode) {
        case 'walking': return 'MARCHE';
        case 'running': return 'COURSE';
        case 'crawling': return 'RAMPER';
        case 'stationary': return 'IMMOBILE';
        default: return 'INCONNU';
      }
    };

    const getBatteryColor = () => {
      if (batteryState === 'charging') return '#00ff88';
      if (batteryLevel > 0.5) return '#00ff88';
      if (batteryLevel > 0.25) return '#ffaa00';
      return '#ff4444';
    };

    const getBatteryIcon = () => {
      if (batteryState === 'charging') return 'battery-charging';
      if (batteryLevel > 0.75) return 'battery-full';
      if (batteryLevel > 0.5) return 'battery-half';
      if (batteryLevel > 0.25) return 'battery-dead';
      return 'battery-dead';
    };

    return (
      <View style={styles.metricsContainer}>
        <Text style={styles.sectionTitle}>Métriques PDR</Text>
        
        <View style={styles.metricRow}>
          <View style={styles.metricCard}>
            <Ionicons name="walk" size={24} color={getActivityColor(state.currentMode)} />
            <Text style={styles.metricLabel}>Mode d'activité</Text>
            <Text style={[styles.metricValue, { color: getActivityColor(state.currentMode) }]}>
              {getActivityLabel(state.currentMode)}
            </Text>
          </View>
          
          <View style={styles.metricCard}>
            <Ionicons name="footsteps" size={24} color="#00ff88" />
            <Text style={styles.metricLabel}>Nombre de pas</Text>
            <Text style={styles.metricValue}>{state.stepCount || 0}</Text>
          </View>
        </View>

        <View style={styles.metricRow}>
          <TouchableOpacity 
            style={styles.metricCard} 
            onPress={() => setShowSamplingModal(true)}
          >
            <Ionicons name="analytics" size={24} color="#0088ff" />
            <Text style={styles.metricLabel}>Échantillonnage</Text>
            <Text style={styles.metricValue}>{sensorsConfig.frequency} Hz</Text>
            <Text style={styles.editHint}>Appuyer pour modifier</Text>
          </TouchableOpacity>
          
          <View style={styles.metricCard}>
            <Ionicons name={getBatteryIcon()} size={24} color={getBatteryColor()} />
            <Text style={styles.metricLabel}>Batterie</Text>
            <Text style={[styles.metricValue, { color: getBatteryColor() }]}>
              {(batteryLevel * 100).toFixed(0)}%
            </Text>
            {batteryState === 'charging' && (
              <Text style={styles.batteryStatus}>En charge</Text>
            )}
          </View>
        </View>

        <View style={styles.metricRow}>
          <View style={styles.metricCard}>
            <Ionicons name="map" size={24} color="#ff4499" />
            <Text style={styles.metricLabel}>ZUPT Actif</Text>
            <Text style={[styles.metricValue, { color: state.isZUPT ? '#00ff88' : '#666666' }]}>
              {state.isZUPT ? 'OUI' : 'NON'}
            </Text>
          </View>
          
          <View style={styles.metricCard}>
            <Ionicons name="trail-sign" size={24} color="#8844ff" />
            <Text style={styles.metricLabel}>Distance</Text>
            <Text style={styles.metricValue}>
              {(state.distance || 0).toFixed(1)} m
            </Text>
          </View>
        </View>
      </View>
    );
  };

  /**
   * Indicateur de qualité du signal
   */
  const renderSignalQuality = () => {
    const quality = state.pose.confidence * 100;
    const getQualityColor = (value) => {
      if (value > 80) return '#00ff88';
      if (value > 60) return '#ffaa00';
      if (value > 40) return '#ff8800';
      return '#ff4444';
    };

    return (
      <View style={styles.qualityContainer}>
        <Text style={styles.sectionTitle}>Qualité du Signal</Text>
        <View style={styles.qualityBar}>
          <View 
            style={[
              styles.qualityFill, 
              { 
                width: `${quality}%`,
                backgroundColor: getQualityColor(quality)
              }
            ]} 
          />
        </View>
        <Text style={styles.qualityText}>
          Confiance: {quality.toFixed(0)}%
        </Text>
      </View>
    );
  };

  /**
   * Informations sur les capteurs
   */
  const renderSensorInfo = () => {
    return (
      <View style={styles.infoContainer}>
        <Text style={styles.sectionTitle}>Informations Système</Text>
        
        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Fréquence</Text>
            <Text style={styles.infoValue}>{state.settings.updateRate} Hz</Text>
          </View>
          
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Dernière MAJ</Text>
            <Text style={styles.infoValue}>
              {new Date(state.lastUpdate).toLocaleTimeString()}
            </Text>
          </View>
          
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Calibration</Text>
            <Text style={[
              styles.infoValue,
              { color: state.isCalibrating ? '#ffaa00' : '#00ff88' }
            ]}>
              {state.isCalibrating ? 'EN COURS' : 'TERMINÉE'}
            </Text>
          </View>
          
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Points Trajectoire</Text>
            <Text style={styles.infoValue}>{state.trajectory.length}</Text>
          </View>
        </View>
      </View>
    );
  };

  /**
   * Réinitialisation des données
   */
  const resetSensorData = () => {
    Alert.alert(
      'Réinitialiser les données',
      'Voulez-vous effacer l\'historique des capteurs ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Réinitialiser',
          onPress: () => {
            setSensorHistory({
              accelerometer: [],
              gyroscope: [],
              magnetometer: []
            });
          }
        }
      ]
    );
  };

  /**
   * Modal pour régler l'échantillonnage
   */
  const renderSamplingModal = () => {
    const handleSave = async () => {
      try {
        await configurationService.setSensorsFrequency(tempSamplingRate);
        const updatedConfig = configurationService.getSensorsConfiguration();
        setSensorsConfig(updatedConfig);
        setShowSamplingModal(false);
        
        Alert.alert(
          'Succès', 
          `Fréquence d'échantillonnage mise à jour : ${tempSamplingRate} Hz`
        );
      } catch (error) {
        console.error('❌ [SENSORS-SCREEN] Erreur sauvegarde fréquence:', error);
        Alert.alert('Erreur', 'Impossible de sauvegarder la fréquence : ' + error.message);
      }
    };

    return (
      <Modal
        visible={showSamplingModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowSamplingModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="analytics" size={24} color="#0088ff" />
              <Text style={styles.modalTitle}>Échantillonnage des Capteurs</Text>
              <TouchableOpacity onPress={() => setShowSamplingModal(false)}>
                <Ionicons name="close" size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.modalDescription}>
                Ajustez la fréquence d'échantillonnage des capteurs entre {sensorsConfig.limits.minFrequency} et {sensorsConfig.limits.maxFrequency} Hz.
              </Text>
              
              <View style={styles.sliderContainer}>
                <Text style={styles.sliderLabel}>Fréquence : {tempSamplingRate} Hz</Text>
                <TextInput
                  style={styles.frequencyInput}
                  keyboardType="numeric"
                  value={tempSamplingRate.toString()}
                  onChangeText={(text) => {
                    const value = parseInt(text);
                    if (!isNaN(value) && value >= sensorsConfig.limits.minFrequency && value <= sensorsConfig.limits.maxFrequency) {
                      setTempSamplingRate(value);
                    } else if (text === '') {
                      // Permettre la saisie vide temporairement
                      setTempSamplingRate(sensorsConfig.limits.minFrequency);
                    }
                  }}
                  placeholder={`${sensorsConfig.limits.minFrequency}-${sensorsConfig.limits.maxFrequency}`}
                  placeholderTextColor="#666666"
                />
                
                <View style={styles.frequencyButtons}>
                  <TouchableOpacity 
                    style={styles.frequencyPreset}
                    onPress={() => setTempSamplingRate(10)}
                  >
                    <Text style={styles.presetText}>10 Hz</Text>
                    <Text style={styles.presetLabel}>Économique</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={styles.frequencyPreset}
                    onPress={() => setTempSamplingRate(25)}
                  >
                    <Text style={styles.presetText}>25 Hz</Text>
                    <Text style={styles.presetLabel}>Normal</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={styles.frequencyPreset}
                    onPress={() => setTempSamplingRate(50)}
                  >
                    <Text style={styles.presetText}>50 Hz</Text>
                    <Text style={styles.presetLabel}>Précis</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.frequencyInfo}>
                <Text style={styles.infoTitle}>Recommandations :</Text>
                <Text style={styles.infoText}>• 5-15 Hz : Économie d'énergie maximale</Text>
                <Text style={styles.infoText}>• 20-30 Hz : Usage normal recommandé</Text>
                <Text style={styles.infoText}>• 50-75 Hz : Précision maximale (plus de batterie)</Text>
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity 
                  style={styles.cancelButton}
                  onPress={() => {
                    setTempSamplingRate(sensorsConfig.frequency);
                    setShowSamplingModal(false);
                  }}
                >
                  <Text style={styles.cancelButtonText}>Annuler</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.saveButton}
                  onPress={handleSave}
                >
                  <Text style={styles.saveButtonText}>Sauvegarder</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Métriques dérivées */}
        {renderDerivedMetrics()}

        {/* Métriques PDR */}
        {renderPDRMetrics()}

        {/* Qualité du signal */}
        {renderSignalQuality()}

        {/* Graphiques des capteurs */}
        {renderSensorGraph(
          'accelerometer',
          sensorHistory.accelerometer,
          'Accéléromètre',
          'm/s²'
        )}

        {renderSensorGraph(
          'gyroscope',
          sensorHistory.gyroscope,
          'Gyroscope',
          'rad/s'
        )}

        {renderSensorGraph(
          'magnetometer',
          sensorHistory.magnetometer,
          'Magnétomètre',
          'µT'
        )}

        {/* Informations système */}
        {renderSensorInfo()}

        {/* Bouton de réinitialisation */}
        <TouchableOpacity style={styles.resetButton} onPress={resetSensorData}>
          <Ionicons name="refresh" size={20} color="#ffffff" />
          <Text style={styles.resetButtonText}>Réinitialiser les données</Text>
        </TouchableOpacity>

        {/* Modal pour régler l'échantillonnage */}
        {renderSamplingModal()}

        <View style={styles.spacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  metricsContainer: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 15,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  metricCard: {
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    width: '48%',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 136, 0.3)',
  },
  metricLabel: {
    color: '#cccccc',
    fontSize: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  metricValue: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  qualityContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  qualityBar: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 4,
    marginBottom: 8,
  },
  qualityFill: {
    height: '100%',
    borderRadius: 4,
  },
  qualityText: {
    color: '#ffffff',
    fontSize: 14,
    textAlign: 'center',
  },
  graphContainer: {
    marginHorizontal: 20,
    marginBottom: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: '#333333',
  },
  graphTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  graph: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 8,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
  },
  legendText: {
    color: '#cccccc',
    fontSize: 12,
  },
  noDataContainer: {
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noDataText: {
    color: '#666666',
    fontSize: 14,
  },
  infoContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  infoItem: {
    width: '48%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  infoLabel: {
    color: '#888888',
    fontSize: 12,
    marginBottom: 4,
  },
  infoValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: '#ff4444',
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 20,
    marginBottom: 20,
  },
  resetButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  spacer: {
    height: 40,
  },
  editHint: {
    color: '#888888',
    fontSize: 12,
    marginTop: 4,
  },
  batteryStatus: {
    color: '#888888',
    fontSize: 12,
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    width: '80%',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  modalBody: {
    flex: 1,
  },
  modalDescription: {
    color: '#cccccc',
    fontSize: 14,
    marginBottom: 20,
  },
  sliderContainer: {
    marginBottom: 20,
  },
  sliderLabel: {
    color: '#cccccc',
    fontSize: 12,
    marginBottom: 8,
  },
  frequencyInput: {
    width: '100%',
    height: 40,
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 8,
    padding: 12,
    color: '#ffffff',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 'bold',
  },
  frequencyButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  frequencyPreset: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 8,
    padding: 12,
  },
  presetText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  presetLabel: {
    color: '#888888',
    fontSize: 12,
  },
  frequencyInfo: {
    marginBottom: 20,
  },
  infoTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  infoText: {
    color: '#cccccc',
    fontSize: 14,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: '#ff4444',
    borderRadius: 8,
    padding: 12,
  },
  cancelButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: 'rgba(0, 255, 136, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 136, 0.3)',
    borderRadius: 8,
    padding: 12,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
}); 