import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Alert,
  Share,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, Line, Text as SvgText, G, Rect } from 'react-native-svg';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { useLocalization } from '../context/LocalizationContext';
import { LocalizationSDK } from '../algorithms/LocalizationSDK';

const { width: screenWidth } = Dimensions.get('window');

export default function AnalyticsScreen() {
  const { state } = useLocalization();
  const [analyticsData, setAnalyticsData] = useState({
    totalDistance: 0,
    averageSpeed: 0,
    maxSpeed: 0,
    averageAccuracy: 0,
    sessionDuration: 0,
    confidenceHistory: [],
    speedHistory: [],
    accuracyDistribution: { high: 0, medium: 0, low: 0 }
  });

  const [selectedMetric, setSelectedMetric] = useState('confidence');
  const [logSessions, setLogSessions] = useState([]);
  const [isExporting, setIsExporting] = useState(false);

  // Instance SDK pour accéder aux logs
  const [localizationSDK] = useState(() => new LocalizationSDK({ logging: { enabled: false } }));

  // Charger les sessions de logs disponibles
  useEffect(() => {
    loadLogSessions();
  }, []);

  const loadLogSessions = async () => {
    try {
      const sessions = await localizationSDK.getLogSessions();
      setLogSessions(sessions);
    } catch (error) {
      console.error('Erreur chargement sessions:', error);
    }
  };

  // Calcul des métriques en temps réel avec optimisation
  useEffect(() => {
    if (state.trajectory.length > 1) {
      // Éviter les recalculs trop fréquents
      const lastCalculation = Date.now() - (analyticsData.lastUpdate || 0);
      if (lastCalculation > 1000) { // Recalculer maximum toutes les secondes
        calculateAnalytics();
      }
    }
  }, [state.trajectory.length, state.pose.x, state.pose.y]); // Dépendances optimisées

  const calculateAnalytics = () => {
    const trajectory = state.trajectory;
    
    // Calcul de la distance totale
    let totalDistance = 0;
    const speeds = [];
    const confidences = [];
    
    for (let i = 1; i < trajectory.length; i++) {
      const prev = trajectory[i - 1];
      const curr = trajectory[i];
      
      // Distance euclidienne
      const distance = Math.sqrt(
        Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2)
      );
      totalDistance += distance;
      
      // Vitesse instantanée
      const timeDiff = (curr.timestamp - prev.timestamp) / 1000; // en secondes
      if (timeDiff > 0) {
        const speed = distance / timeDiff;
        speeds.push(speed);
      }
      
      // Niveau de confiance
      if (curr.confidence !== undefined) {
        confidences.push(curr.confidence);
      }
    }

    // Statistiques de vitesse
    const averageSpeed = speeds.length > 0 
      ? speeds.reduce((a, b) => a + b, 0) / speeds.length 
      : 0;
    const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;
    
    // Statistiques de confiance
    const averageAccuracy = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

    // Distribution de précision
    const accuracyDistribution = {
      high: confidences.filter(c => c > 0.8).length,
      medium: confidences.filter(c => c > 0.5 && c <= 0.8).length,
      low: confidences.filter(c => c <= 0.5).length
    };

    // Durée de session
    const sessionDuration = trajectory.length > 0 
      ? (trajectory[trajectory.length - 1].timestamp - trajectory[0].timestamp) / 1000 
      : 0;

    setAnalyticsData({
      totalDistance,
      averageSpeed,
      maxSpeed,
      averageAccuracy,
      sessionDuration,
      confidenceHistory: confidences.slice(-100), // Derniers 100 points
      speedHistory: speeds.slice(-100),
      accuracyDistribution,
      lastUpdate: Date.now() // Ajout du timestamp
    });
  };

  /**
   * *** NOUVELLE FONCTION D'EXPORTATION COMPLÈTE ***
   */
  const exportCompleteLogData = async (sessionId = null) => {
    setIsExporting(true);
    
    try {
      let logData;
      let filename;
      
      if (sessionId) {
        // Exporter une session spécifique
        logData = await localizationSDK.exportSession(sessionId, 'json');
        filename = `pdr_log_${sessionId}.json`;
      } else {
        // Exporter la session courante ou créer un export des données actuelles
        const currentStatus = localizationSDK.getLoggingStatus();
        
        if (currentStatus.isLogging && currentStatus.currentSession) {
          // Session active - exporter les données en cours
          logData = await localizationSDK.exportCurrentSession('json');
          filename = `pdr_log_current_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        } else {
          // Pas de session active - créer un export des données du contexte
          logData = createContextExport();
          filename = `pdr_context_export_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        }
      }
      
      if (!logData) {
        Alert.alert('Erreur', 'Aucune donnée à exporter');
        return;
      }
      
      // Enrichir les données avec des métadonnées d'analyse
      const enrichedData = {
        ...logData,
        exportMetadata: {
          exportDate: new Date().toISOString(),
          exportType: sessionId ? 'session' : 'current',
          analyticsData: analyticsData,
          trajectoryData: state.trajectory,
          currentPose: state.pose,
          systemInfo: {
            platform: Platform.OS,
            screenDimensions: { width: screenWidth },
            appVersion: '1.0.0'
          }
        },
        analysisReady: {
          sensorDataPoints: logData.logs ? logData.logs.length : 0,
          timeRange: logData.duration ? `${(logData.duration / 1000).toFixed(1)}s` : 'N/A',
          dataQuality: assessDataQuality(logData)
        }
      };
      
      // Sauvegarder et partager le fichier
      await saveAndShareLogFile(enrichedData, filename);
      
    } catch (error) {
      console.error('Erreur exportation:', error);
      Alert.alert('Erreur', `Impossible d'exporter les données: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * Création d'un export des données du contexte actuel
   */
  const createContextExport = () => {
    return {
      sessionId: `context_export_${Date.now()}`,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      duration: 0,
      totalEntries: state.trajectory.length,
      logs: state.trajectory.map((point, index) => ({
        timestamp: point.timestamp,
        relativeTime: index > 0 ? point.timestamp - state.trajectory[0].timestamp : 0,
        sensors: {
          // Données capteurs du contexte (si disponibles)
          accelerometer: state.sensors?.accelerometer || null,
          gyroscope: state.sensors?.gyroscope || null,
          magnetometer: state.sensors?.magnetometer || null,
          metadata: state.sensors?.metadata || {}
        },
        algorithm: {
          pdr: {
            position: { x: point.x, y: point.y, z: 0 },
            mode: state.currentMode || 'unknown',
            stepCount: state.stepCount || 0,
            confidence: point.confidence || 0
          },
          sdk: {
            position: { x: point.x, y: point.y, z: 0 },
            confidence: point.confidence || 0,
            isTracking: state.isTracking
          }
        }
      })),
      statistics: {
        totalLogs: state.trajectory.length,
        stepCount: state.stepCount || 0,
        distance: analyticsData.totalDistance,
        averageSpeed: analyticsData.averageSpeed,
        maxSpeed: analyticsData.maxSpeed,
        averageAccuracy: analyticsData.averageAccuracy
      }
    };
  };

  /**
   * Évaluation de la qualité des données
   */
  const assessDataQuality = (logData) => {
    if (!logData.logs || logData.logs.length === 0) {
      return { score: 0, issues: ['Aucune donnée disponible'] };
    }
    
    const logs = logData.logs;
    const issues = [];
    let score = 100;
    
    // Vérifier la continuité des données capteurs
    const sensorDataCount = logs.filter(log => 
      log.sensors?.accelerometer && log.sensors?.gyroscope
    ).length;
    
    const sensorCoverage = sensorDataCount / logs.length;
    if (sensorCoverage < 0.8) {
      issues.push(`Données capteurs incomplètes (${(sensorCoverage * 100).toFixed(1)}%)`);
      score -= 20;
    }
    
    // Vérifier la fréquence d'échantillonnage
    if (logs.length > 1) {
      const duration = (logs[logs.length - 1].relativeTime - logs[0].relativeTime) / 1000;
      const sampleRate = logs.length / duration;
      
      if (sampleRate < 0.5) {
        issues.push(`Fréquence d'échantillonnage faible (${sampleRate.toFixed(1)} Hz)`);
        score -= 15;
      }
    }
    
    // Vérifier la cohérence des données algorithme
    const algorithmDataCount = logs.filter(log => 
      log.algorithm?.pdr || log.algorithm?.sdk
    ).length;
    
    const algorithmCoverage = algorithmDataCount / logs.length;
    if (algorithmCoverage < 0.9) {
      issues.push(`Données algorithme incomplètes (${(algorithmCoverage * 100).toFixed(1)}%)`);
      score -= 10;
    }
    
    return {
      score: Math.max(0, score),
      issues: issues.length > 0 ? issues : ['Données de bonne qualité'],
      sensorCoverage: sensorCoverage * 100,
      algorithmCoverage: algorithmCoverage * 100,
      sampleRate: logs.length > 1 ? logs.length / ((logs[logs.length - 1].relativeTime - logs[0].relativeTime) / 1000) : 0
    };
  };

  /**
   * Sauvegarde et partage du fichier de logs
   */
  const saveAndShareLogFile = async (data, filename) => {
    try {
      const jsonString = JSON.stringify(data, null, 2);
      const fileUri = FileSystem.documentDirectory + filename;
      
      // Sauvegarder le fichier
      await FileSystem.writeAsStringAsync(fileUri, jsonString);
      
      // Partager le fichier
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Exporter les logs PDR'
        });
      } else {
        // Fallback pour les plateformes sans partage de fichiers
        await Share.share({
          message: `Logs PDR exportés: ${filename}\n\nTaille: ${(jsonString.length / 1024).toFixed(1)} KB`,
          title: 'Export des logs PDR'
        });
      }
      
      Alert.alert(
        'Export réussi',
        `Fichier sauvegardé: ${filename}\nTaille: ${(jsonString.length / 1024).toFixed(1)} KB\nEntrées: ${data.logs ? data.logs.length : 0}`,
        [{ text: 'OK' }]
      );
      
    } catch (error) {
      throw new Error(`Erreur sauvegarde: ${error.message}`);
    }
  };

  /**
   * Rendu de la section d'exportation des logs
   */
  const renderLogExportSection = () => {
    return (
      <View style={styles.exportContainer}>
        <Text style={styles.sectionTitle}>📊 Exportation des Logs</Text>
        
        {/* Informations sur les sessions disponibles */}
        <View style={styles.sessionsInfo}>
          <Text style={styles.infoText}>
            Sessions disponibles: {logSessions.length}
          </Text>
          {logSessions.length > 0 && (
            <Text style={styles.infoSubtext}>
              Dernière session: {new Date(logSessions[0]?.startTime).toLocaleString()}
            </Text>
          )}
        </View>
        
        {/* Boutons d'exportation */}
        <View style={styles.exportButtons}>
          <TouchableOpacity 
            style={[styles.exportButton, styles.primaryExportButton]}
            onPress={() => exportCompleteLogData()}
            disabled={isExporting}
          >
            <Ionicons name="download" size={20} color="#ffffff" />
            <Text style={styles.exportButtonText}>
              {isExporting ? 'Export en cours...' : 'Exporter Session Courante'}
            </Text>
          </TouchableOpacity>
          
          {logSessions.length > 0 && (
            <TouchableOpacity 
              style={[styles.exportButton, styles.secondaryExportButton]}
              onPress={() => showSessionSelector()}
              disabled={isExporting}
            >
              <Ionicons name="archive" size={20} color="#4ecdc4" />
              <Text style={[styles.exportButtonText, { color: '#4ecdc4' }]}>
                Exporter Session Archivée
              </Text>
            </TouchableOpacity>
          )}
        </View>
        
        {/* Informations sur le format d'export */}
        <View style={styles.formatInfo}>
          <Text style={styles.formatTitle}>📋 Format d'export JSON:</Text>
          <Text style={styles.formatItem}>• Données capteurs (accéléromètre, gyroscope, magnétomètre)</Text>
          <Text style={styles.formatItem}>• Décisions algorithme (PDR, EKF, AttitudeTracker)</Text>
          <Text style={styles.formatItem}>• Timestamps synchronisés</Text>
          <Text style={styles.formatItem}>• Métadonnées de qualité</Text>
          <Text style={styles.formatItem}>• Statistiques de session</Text>
        </View>
      </View>
    );
  };

  /**
   * Sélecteur de session pour l'export
   */
  const showSessionSelector = () => {
    const sessionOptions = logSessions.map((session, index) => ({
      text: `${session.id} (${new Date(session.startTime).toLocaleDateString()})`,
      onPress: () => exportCompleteLogData(session.id)
    }));
    
    sessionOptions.push({ text: 'Annuler', style: 'cancel' });
    
    Alert.alert(
      'Sélectionner une session',
      'Choisissez la session à exporter:',
      sessionOptions
    );
  };

  /**
   * Rendu des métriques principales
   */
  const renderMainMetrics = () => {
    const metrics = [
      {
        title: 'Distance parcourue',
        value: `${analyticsData.totalDistance.toFixed(1)} m`,
        icon: 'walk',
        color: '#00ff88'
      },
      {
        title: 'Vitesse moyenne',
        value: `${analyticsData.averageSpeed.toFixed(2)} m/s`,
        icon: 'speedometer',
        color: '#4ecdc4'
      },
      {
        title: 'Précision moyenne',
        value: `${(analyticsData.averageAccuracy * 100).toFixed(0)}%`,
        icon: 'checkmark-circle',
        color: '#45b7d1'
      },
      {
        title: 'Durée de session',
        value: formatDuration(analyticsData.sessionDuration),
        icon: 'time',
        color: '#ffa726'
      }
    ];

    return (
      <View style={styles.metricsContainer}>
        <Text style={styles.sectionTitle}>Métriques de Performance</Text>
        <View style={styles.metricsGrid}>
          {metrics.map((metric, index) => (
            <View key={index} style={styles.metricCard}>
              <Ionicons name={metric.icon} size={24} color={metric.color} />
              <Text style={styles.metricValue}>{metric.value}</Text>
              <Text style={styles.metricTitle}>{metric.title}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  /**
   * Graphique de confiance au fil du temps
   */
  const renderConfidenceChart = () => {
    const data = analyticsData.confidenceHistory;
    if (!data || data.length < 2) {
      return (
        <View style={styles.chartContainer}>
          <Text style={styles.chartTitle}>Évolution de la confiance</Text>
          <View style={styles.noDataContainer}>
            <Text style={styles.noDataText}>Pas assez de données</Text>
          </View>
        </View>
      );
    }

    const chartWidth = screenWidth - 40;
    const chartHeight = 120;
    const padding = 20;

    const pathData = data.map((value, index) => {
      const x = padding + (index / (data.length - 1)) * (chartWidth - 2 * padding);
      const y = padding + (1 - value) * (chartHeight - 2 * padding);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');

    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>Évolution de la confiance</Text>
        <Svg width={chartWidth} height={chartHeight} style={styles.chart}>
          {/* Zones de qualité */}
          <Rect
            x={padding}
            y={padding}
            width={chartWidth - 2 * padding}
            height={(chartHeight - 2 * padding) * 0.2}
            fill="rgba(0, 255, 136, 0.1)"
          />
          <Rect
            x={padding}
            y={padding + (chartHeight - 2 * padding) * 0.2}
            width={chartWidth - 2 * padding}
            height={(chartHeight - 2 * padding) * 0.3}
            fill="rgba(255, 170, 0, 0.1)"
          />
          <Rect
            x={padding}
            y={padding + (chartHeight - 2 * padding) * 0.5}
            width={chartWidth - 2 * padding}
            height={(chartHeight - 2 * padding) * 0.5}
            fill="rgba(255, 68, 68, 0.1)"
          />
          
          {/* Ligne de données */}
          <Path
            d={pathData}
            stroke="#00ff88"
            strokeWidth="3"
            fill="none"
          />
          
          {/* Points de données */}
          {data.slice(-10).map((value, index) => {
            const actualIndex = data.length - 10 + index;
            const x = padding + (actualIndex / (data.length - 1)) * (chartWidth - 2 * padding);
            const y = padding + (1 - value) * (chartHeight - 2 * padding);
            return (
              <Circle
                key={index}
                cx={x}
                cy={y}
                r="3"
                fill="#00ff88"
              />
            );
          })}
        </Svg>
        
        <View style={styles.chartLegend}>
          <View style={styles.legendRow}>
            <View style={[styles.legendColor, { backgroundColor: 'rgba(0, 255, 136, 0.3)' }]} />
            <Text style={styles.legendText}>Haute confiance (80-100%)</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendColor, { backgroundColor: 'rgba(255, 170, 0, 0.3)' }]} />
            <Text style={styles.legendText}>Confiance moyenne (50-80%)</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendColor, { backgroundColor: 'rgba(255, 68, 68, 0.3)' }]} />
            <Text style={styles.legendText}>Faible confiance (0-50%)</Text>
          </View>
        </View>
      </View>
    );
  };

  /**
   * Distribution de la précision
   */
  const renderAccuracyDistribution = () => {
    const { high, medium, low } = analyticsData.accuracyDistribution;
    const total = high + medium + low;
    
    if (total === 0) {
      return (
        <View style={styles.distributionContainer}>
          <Text style={styles.sectionTitle}>Distribution de la précision</Text>
          <View style={styles.noDataContainer}>
            <Text style={styles.noDataText}>Aucune donnée disponible</Text>
          </View>
        </View>
      );
    }

    const highPercent = (high / total) * 100;
    const mediumPercent = (medium / total) * 100;
    const lowPercent = (low / total) * 100;

    return (
      <View style={styles.distributionContainer}>
        <Text style={styles.sectionTitle}>Distribution de la précision</Text>
        
        <View style={styles.distributionBar}>
          <View style={[styles.distributionSegment, { 
            width: `${highPercent}%`, 
            backgroundColor: '#00ff88' 
          }]} />
          <View style={[styles.distributionSegment, { 
            width: `${mediumPercent}%`, 
            backgroundColor: '#ffaa00' 
          }]} />
          <View style={[styles.distributionSegment, { 
            width: `${lowPercent}%`, 
            backgroundColor: '#ff4444' 
          }]} />
        </View>
        
        <View style={styles.distributionStats}>
          <View style={styles.statItem}>
            <View style={[styles.statColor, { backgroundColor: '#00ff88' }]} />
            <Text style={styles.statText}>Haute: {high} ({highPercent.toFixed(0)}%)</Text>
          </View>
          <View style={styles.statItem}>
            <View style={[styles.statColor, { backgroundColor: '#ffaa00' }]} />
            <Text style={styles.statText}>Moyenne: {medium} ({mediumPercent.toFixed(0)}%)</Text>
          </View>
          <View style={styles.statItem}>
            <View style={[styles.statColor, { backgroundColor: '#ff4444' }]} />
            <Text style={styles.statText}>Faible: {low} ({lowPercent.toFixed(0)}%)</Text>
          </View>
        </View>
      </View>
    );
  };

  /**
   * Informations système avancées
   */
  const renderSystemInfo = () => {
    return (
      <View style={styles.systemContainer}>
        <Text style={styles.sectionTitle}>Informations Système</Text>
        
        <View style={styles.infoGrid}>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Points de trajectoire</Text>
            <Text style={styles.infoValue}>{state.trajectory.length}</Text>
          </View>
          
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Landmarks détectés</Text>
            <Text style={styles.infoValue}>{state.landmarks.length}</Text>
          </View>
          
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Fréquence de mise à jour</Text>
            <Text style={styles.infoValue}>{state.settings.updateRate} Hz</Text>
          </View>
          
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Position actuelle</Text>
            <Text style={styles.infoValue}>
              ({state.pose.x.toFixed(1)}, {state.pose.y.toFixed(1)})
            </Text>
          </View>
          
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Vitesse max</Text>
            <Text style={styles.infoValue}>
              {analyticsData.maxSpeed.toFixed(2)} m/s
            </Text>
          </View>
          
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Algo utilisé</Text>
            <Text style={styles.infoValue}>EKF + IMU</Text>
          </View>
        </View>
      </View>
    );
  };

  /**
   * Formatage de la durée
   */
  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Métriques principales */}
        {renderMainMetrics()}
        
        {/* Graphique de confiance */}
        {renderConfidenceChart()}
        
        {/* Distribution de précision */}
        {renderAccuracyDistribution()}
        
        {/* Informations système */}
        {renderSystemInfo()}
        
        {/* Section d'exportation des logs */}
        {renderLogExportSection()}
        
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
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  metricCard: {
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    width: '48%',
    marginBottom: 15,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 136, 0.3)',
  },
  metricValue: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 8,
  },
  metricTitle: {
    color: '#cccccc',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  chartContainer: {
    marginHorizontal: 20,
    marginBottom: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: '#333333',
  },
  chartTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  chart: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 8,
  },
  chartLegend: {
    marginTop: 10,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 2,
    marginRight: 8,
  },
  legendText: {
    color: '#cccccc',
    fontSize: 12,
  },
  distributionContainer: {
    marginHorizontal: 20,
    marginBottom: 25,
  },
  distributionBar: {
    flexDirection: 'row',
    height: 20,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 15,
  },
  distributionSegment: {
    height: '100%',
  },
  distributionStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statColor: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  statText: {
    color: '#ffffff',
    fontSize: 12,
  },
  systemContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  infoCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 12,
    width: '48%',
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
  exportContainer: {
    padding: 20,
  },
  sessionsInfo: {
    marginBottom: 15,
  },
  infoText: {
    color: '#ffffff',
    fontSize: 14,
  },
  infoSubtext: {
    color: '#888888',
    fontSize: 12,
  },
  exportButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  exportButton: {
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
    borderRadius: 8,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryExportButton: {
    backgroundColor: '#4ecdc4',
  },
  secondaryExportButton: {
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
  },
  exportButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  formatInfo: {
    marginBottom: 15,
  },
  formatTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  formatItem: {
    color: '#888888',
    fontSize: 12,
    marginBottom: 5,
  },
  noDataContainer: {
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noDataText: {
    color: '#666666',
    fontSize: 14,
  },
  spacer: {
    height: 40,
  },
}); 