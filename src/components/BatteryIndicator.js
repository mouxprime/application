import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { diagnosticService } from '../services/DiagnosticService';

/**
 * Composant d'indicateur de batterie avancé avec surveillance de consommation
 */
export default function BatteryIndicator({ style, showDetails = false }) {
  const [batteryLevel, setBatteryLevel] = useState(1);
  const [batteryState, setBatteryState] = useState('unknown');
  const [consumption, setConsumption] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [diagnosticReport, setDiagnosticReport] = useState(null);

  console.log('🔋 [BATTERY-INDICATOR] Composant initialisé, showDetails:', showDetails);

  useEffect(() => {
    console.log('🔋 [BATTERY-INDICATOR] useEffect démarré');
    
    // Démarrer la surveillance de la batterie
    diagnosticService.startBatteryMonitoring();

    // Mise à jour périodique
    const updateInterval = setInterval(updateBatteryInfo, 10000); // Toutes les 10 secondes

    // Première mise à jour
    updateBatteryInfo();

    return () => {
      console.log('🔋 [BATTERY-INDICATOR] Nettoyage du composant');
      clearInterval(updateInterval);
      diagnosticService.stopBatteryMonitoring();
    };
  }, []);

  const updateBatteryInfo = async () => {
    try {
      console.log('🔋 [BATTERY-INDICATOR] Mise à jour des infos batterie...');
      const stats = diagnosticService.getDetailedStats();
      
      console.log('🔋 [BATTERY-INDICATOR] Stats reçues:', stats);
      
      setBatteryLevel(stats.battery.currentLevel / 100);
      setBatteryState(stats.battery.batteryState);
      setConsumption(stats.battery);

      console.log('🔋 [BATTERY-INDICATOR] État mis à jour:', {
        level: stats.battery.currentLevel,
        state: stats.battery.batteryState,
        consumption: stats.battery.consumption
      });

    } catch (error) {
      console.error('❌ [BATTERY-INDICATOR] Erreur mise à jour:', error);
    }
  };

  const handlePress = async () => {
    if (showDetails) {
      try {
        const report = await diagnosticService.generateReport();
        setDiagnosticReport(report);
        setShowModal(true);
      } catch (error) {
        console.error('❌ [BATTERY-INDICATOR] Erreur génération rapport:', error);
      }
    }
  };

  const getBatteryIcon = () => {
    if (batteryState === 'charging') return 'battery-charging';
    if (batteryLevel > 0.75) return 'battery-full';
    if (batteryLevel > 0.5) return 'battery-half';
    if (batteryLevel > 0.25) return 'battery-dead';
    return 'battery-dead';
  };

  const getBatteryColor = () => {
    if (batteryState === 'charging') return '#00ff88';
    if (batteryLevel > 0.5) return '#00ff88';
    if (batteryLevel > 0.25) return '#ffaa00';
    return '#ff4444';
  };

  const getConsumptionColor = () => {
    if (!consumption || consumption.rate === 0) return '#888888';
    if (consumption.rate < 10) return '#00ff88'; // Faible consommation
    if (consumption.rate < 20) return '#ffaa00'; // Consommation modérée
    return '#ff4444'; // Consommation élevée
  };

  const formatDuration = (milliseconds) => {
    const minutes = Math.floor(milliseconds / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${minutes}m`;
  };

  const renderDetailedModal = () => {
    if (!diagnosticReport) return null;

    return (
      <Modal
        visible={showModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="analytics" size={24} color="#00ff88" />
              <Text style={styles.modalTitle}>Diagnostic Batterie & Système</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              {/* Informations batterie */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🔋 Consommation Batterie</Text>
                
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Niveau actuel:</Text>
                  <Text style={[styles.statValue, { color: getBatteryColor() }]}>
                    {diagnosticReport.battery.battery.currentLevel.toFixed(1)}%
                  </Text>
                </View>

                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Niveau initial:</Text>
                  <Text style={styles.statValue}>
                    {diagnosticReport.battery.battery.initialLevel.toFixed(1)}%
                  </Text>
                </View>

                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Consommation:</Text>
                  <Text style={[styles.statValue, { color: getConsumptionColor() }]}>
                    {diagnosticReport.battery.battery.consumption.toFixed(1)}%
                  </Text>
                </View>

                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Taux de consommation:</Text>
                  <Text style={[styles.statValue, { color: getConsumptionColor() }]}>
                    {diagnosticReport.battery.battery.rate.toFixed(1)}%/h
                  </Text>
                </View>

                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Durée session:</Text>
                  <Text style={styles.statValue}>
                    {formatDuration(diagnosticReport.battery.battery.duration)}
                  </Text>
                </View>

                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>État:</Text>
                  <Text style={[styles.statValue, { color: getBatteryColor() }]}>
                    {diagnosticReport.battery.battery.batteryState === 'charging' ? 'En charge' : 
                     diagnosticReport.battery.battery.batteryState === 'unplugged' ? 'Débranchée' : 
                     'Inconnu'}
                  </Text>
                </View>
              </View>

              {/* Diagnostic podomètre */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🚶 Diagnostic Podomètre</Text>
                
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Statut module natif:</Text>
                  <Text style={[styles.statValue, { 
                    color: diagnosticReport.pedometer.nativeModuleStatus === 'available' ? '#00ff88' : '#ff4444' 
                  }]}>
                    {diagnosticReport.pedometer.nativeModuleStatus === 'available' ? 'Disponible' :
                     diagnosticReport.pedometer.nativeModuleStatus === 'unavailable' ? 'Indisponible' :
                     diagnosticReport.pedometer.nativeModuleStatus === 'missing' ? 'Manquant' :
                     diagnosticReport.pedometer.nativeModuleStatus === 'error' ? 'Erreur' : 'Inconnu'}
                  </Text>
                </View>

                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Appareil physique:</Text>
                  <Text style={[styles.statValue, { 
                    color: diagnosticReport.pedometer.isPhysicalDevice ? '#00ff88' : '#ffaa00' 
                  }]}>
                    {diagnosticReport.pedometer.isPhysicalDevice ? 'Oui' : 'Non (Simulateur)'}
                  </Text>
                </View>

                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Plateforme:</Text>
                  <Text style={styles.statValue}>
                    {diagnosticReport.pedometer.platform} {diagnosticReport.pedometer.platformVersion}
                  </Text>
                </View>

                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Mode recommandé:</Text>
                  <Text style={[styles.statValue, { color: '#00ff88' }]}>
                    {diagnosticReport.summary.recommendedMode === 'native' ? 'Natif iOS' : 'Application'}
                  </Text>
                </View>
              </View>

              {/* Recommandations */}
              {diagnosticReport.pedometer.recommendations.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>💡 Recommandations</Text>
                  {diagnosticReport.pedometer.recommendations.map((rec, index) => (
                    <Text key={index} style={styles.recommendation}>
                      • {rec}
                    </Text>
                  ))}
                </View>
              )}

              {/* Informations système */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>📱 Informations Système</Text>
                
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Type d'appareil:</Text>
                  <Text style={styles.statValue}>
                    {diagnosticReport.battery.device.deviceType || 'Inconnu'}
                  </Text>
                </View>

                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Enregistrements batterie:</Text>
                  <Text style={styles.statValue}>
                    {diagnosticReport.battery.monitoring.recordCount}
                  </Text>
                </View>

                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Surveillance active:</Text>
                  <Text style={[styles.statValue, { 
                    color: diagnosticReport.battery.monitoring.isActive ? '#00ff88' : '#ff4444' 
                  }]}>
                    {diagnosticReport.battery.monitoring.isActive ? 'Oui' : 'Non'}
                  </Text>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <>
      <TouchableOpacity 
        style={[styles.container, style]} 
        onPress={handlePress}
        disabled={!showDetails}
      >
        <View style={styles.batteryContainer}>
          <Ionicons 
            name={getBatteryIcon()} 
            size={20} 
            color={getBatteryColor()} 
          />
          <Text style={[styles.batteryText, { color: getBatteryColor() }]}>
            {(batteryLevel * 100).toFixed(0)}%
          </Text>
        </View>

        {consumption && consumption.status !== 'no_data' && (
          <View style={styles.consumptionContainer}>
            <Text style={[styles.consumptionText, { color: getConsumptionColor() }]}>
              {consumption.rate > 0 ? `-${consumption.rate.toFixed(1)}%/h` : '0%/h'}
            </Text>
            {consumption.rate > 15 && (
              <Ionicons name="warning" size={12} color="#ff4444" />
            )}
          </View>
        )}

        {showDetails && (
          <Ionicons name="information-circle" size={16} color="#888888" />
        )}
      </TouchableOpacity>

      {renderDetailedModal()}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333333',
  },
  batteryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  batteryText: {
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
    fontFamily: 'monospace',
  },
  consumptionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 4,
  },
  consumptionText: {
    fontSize: 10,
    fontFamily: 'monospace',
    marginRight: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 15,
    margin: 20,
    maxHeight: '80%',
    width: '90%',
    borderWidth: 2,
    borderColor: '#00ff88',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    marginLeft: 10,
  },
  modalScroll: {
    maxHeight: 400,
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  sectionTitle: {
    color: '#00ff88',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statLabel: {
    color: '#cccccc',
    fontSize: 14,
    flex: 1,
  },
  statValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  recommendation: {
    color: '#ffaa00',
    fontSize: 12,
    marginBottom: 5,
    lineHeight: 16,
  },
}); 