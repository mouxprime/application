import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, Line, Text as SvgText, G, Rect } from 'react-native-svg';

import { useLocalization } from '../context/LocalizationContext';

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
    accuracyDistribution: { high: 0, medium: 0, low: 0 },
    verticalDetection: null
  });

  const [selectedMetric, setSelectedMetric] = useState('confidence');

  // *** CORRECTION: Calcul des métriques avec throttling pour éviter les boucles infinies ***
  useEffect(() => {
    if (state.trajectory.length > 1) {
      // Throttling: recalculer seulement si assez de temps s'est écoulé
      const now = Date.now();
      if (!analyticsData.lastCalculation || now - analyticsData.lastCalculation > 1000) {
        calculateAnalytics();
      }
    }
  }, [state.trajectory.length, state.stepCount]); // Dépendances plus spécifiques

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

    // *** NOUVEAU: Métriques de détection verticale ***
    const verticalMetrics = state.pdrMetrics?.verticalDetection || null;

    setAnalyticsData({
      totalDistance,
      averageSpeed,
      maxSpeed,
      averageAccuracy,
      sessionDuration,
      confidenceHistory: confidences.slice(-50), // 50 derniers points
      speedHistory: speeds.slice(-50),
      accuracyDistribution,
      verticalDetection: verticalMetrics, // Ajout des métriques verticales
      lastCalculation: Date.now() // *** NOUVEAU: Timestamp pour throttling ***
    });
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
      },
      // *** NOUVEAU: Métriques de crawling ***
      {
        title: 'Distance crawling',
        value: `${(state.crawlDistance || 0).toFixed(1)} m`,
        icon: 'git-merge',
        color: '#ff6b6b'
      },
      {
        title: 'Nombre de pas',
        value: `${state.stepCount || 0}`,
        icon: 'footsteps',
        color: '#4ecdc4'
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
        
        <View style={styles.distributionLegend}>
          <View style={styles.legendRow}>
            <View style={[styles.legendColor, { backgroundColor: '#00ff88' }]} />
            <Text style={styles.legendText}>Haute ({highPercent.toFixed(1)}%)</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendColor, { backgroundColor: '#ffaa00' }]} />
            <Text style={styles.legendText}>Moyenne ({mediumPercent.toFixed(1)}%)</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendColor, { backgroundColor: '#ff4444' }]} />
            <Text style={styles.legendText}>Faible ({lowPercent.toFixed(1)}%)</Text>
          </View>
        </View>
      </View>
    );
  };

  /**
   * *** NOUVEAU: Métriques de détection verticale ***
   */
  const renderVerticalDetectionMetrics = () => {
    const verticalData = analyticsData.verticalDetection;
    
    if (!verticalData) {
      return (
        <View style={styles.verticalContainer}>
          <Text style={styles.sectionTitle}>🔄 Détection Verticale</Text>
          <View style={styles.noDataContainer}>
            <Text style={styles.noDataText}>Détection verticale non disponible</Text>
          </View>
        </View>
      );
    }

    const getMethodColor = (method) => {
      switch (method) {
        case 'vertical_projection': return '#00ff88';
        case 'magnitude_fallback': return '#ffaa00';
        case 'magnitude_default': return '#ff8800';
        case 'magnitude_only': return '#ff4444';
        default: return '#888888';
      }
    };

    const getMethodLabel = (method) => {
      switch (method) {
        case 'vertical_projection': return 'Projection Verticale';
        case 'magnitude_fallback': return 'Magnitude (Fallback)';
        case 'magnitude_default': return 'Magnitude (Défaut)';
        case 'magnitude_only': return 'Magnitude Seule';
        default: return 'Inconnu';
      }
    };

    return (
      <View style={styles.verticalContainer}>
        <Text style={styles.sectionTitle}>🔄 Détection Verticale</Text>
        
        {/* État actuel */}
        <View style={styles.verticalStatusRow}>
          <Text style={styles.verticalLabel}>Méthode:</Text>
          <View style={[styles.methodBadge, { backgroundColor: getMethodColor(verticalData.method) }]}>
            <Text style={styles.methodBadgeText}>
              {getMethodLabel(verticalData.method)}
            </Text>
          </View>
        </View>

        {/* Confiance d'orientation */}
        <View style={styles.verticalStatusRow}>
          <Text style={styles.verticalLabel}>Confiance Orientation:</Text>
          <Text style={[styles.verticalValue, { 
            color: verticalData.orientationConfidence > 0.5 ? '#00ff88' : '#ffaa00' 
          }]}>
            {(verticalData.orientationConfidence * 100).toFixed(0)}%
          </Text>
        </View>

        {/* Dernier pic vertical */}
        {verticalData.lastVerticalPeak > 0 && (
          <View style={styles.verticalStatusRow}>
            <Text style={styles.verticalLabel}>Dernier Pic Vertical:</Text>
            <Text style={styles.verticalValue}>
              {verticalData.lastVerticalPeak.toFixed(3)}g
            </Text>
          </View>
        )}

        {/* État fallback */}
        {verticalData.fallbackActive && (
          <View style={styles.verticalStatusRow}>
            <Text style={styles.verticalLabel}>⚠️ Fallback Actif</Text>
            <Text style={styles.verticalValue}>
              Orientation instable
            </Text>
          </View>
        )}
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
   * Exportation des données
   */
  const exportData = () => {
    const exportData = {
      timestamp: new Date().toISOString(),
      trajectory: state.trajectory,
      analytics: analyticsData,
      settings: state.settings,
      pose: state.pose
    };

    // TODO: Implémenter l'exportation réelle
    console.log('Données exportées:', exportData);
    alert('Fonctionnalité d\'exportation à implémenter');
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

  /**
   * *** NOUVEAU: Rendu des métriques physiologiques ***
   */
  const renderPhysiologicalMetrics = () => {
    const pdrState = state.pdr;
    if (!pdrState?.physiologicalMetrics) {
      return null;
    }

    const metrics = pdrState.physiologicalMetrics;
    
    const getFrequencyColor = () => {
      const ratio = metrics.currentStepFrequency / metrics.maxAllowedFrequency;
      if (ratio > 0.8) return '#ff4444'; // Rouge si proche du max
      if (ratio > 0.6) return '#ffaa00'; // Orange si élevé
      return '#00ff88'; // Vert si normal
    };

    const getGyroColor = () => {
      if (!metrics.gyroConfirmationEnabled) return '#888888';
      if (metrics.lastGyroActivity > 0.3) return '#00ff88';
      if (metrics.lastGyroActivity > 0.1) return '#ffaa00';
      return '#ff4444';
    };

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🧬 Garde-fous Physiologiques</Text>
        
        <View style={styles.metricsGrid}>
          {/* Fréquence de pas */}
          <View style={styles.metricCard}>
            <Ionicons name="pulse" size={24} color={getFrequencyColor()} />
            <Text style={styles.metricTitle}>Fréquence Pas</Text>
            <Text style={[styles.metricValue, { color: getFrequencyColor() }]}>
              {metrics.currentStepFrequency.toFixed(1)} Hz
            </Text>
            <Text style={styles.metricSubtitle}>
              Max: {metrics.maxAllowedFrequency} Hz
            </Text>
          </View>

          {/* Historique des pas */}
          <View style={styles.metricCard}>
            <Ionicons name="time" size={24} color="#4ecdc4" />
            <Text style={styles.metricTitle}>Historique</Text>
            <Text style={[styles.metricValue, { color: '#4ecdc4' }]}>
              {metrics.stepHistoryLength}
            </Text>
            <Text style={styles.metricSubtitle}>pas récents</Text>
          </View>

          {/* Confirmation gyroscopique */}
          <View style={styles.metricCard}>
            <Ionicons 
              name={metrics.gyroConfirmationEnabled ? "checkmark-circle" : "close-circle"} 
              size={24} 
              color={getGyroColor()} 
            />
            <Text style={styles.metricTitle}>Gyro Confirm</Text>
            <Text style={[styles.metricValue, { color: getGyroColor() }]}>
              {metrics.gyroConfirmationEnabled ? 
                metrics.lastGyroActivity.toFixed(2) : 'OFF'
              }
            </Text>
            <Text style={styles.metricSubtitle}>
              {metrics.gyroConfirmationEnabled ? 'rad/s' : 'désactivé'}
            </Text>
          </View>
        </View>

        {/* Indicateurs d'état */}
        <View style={styles.statusIndicators}>
          <View style={[
            styles.statusIndicator,
            { backgroundColor: metrics.currentStepFrequency / metrics.maxAllowedFrequency > 0.8 ? 
              'rgba(255, 68, 68, 0.2)' : 'rgba(0, 255, 136, 0.2)' }
          ]}>
            <Text style={[
              styles.statusText,
              { color: metrics.currentStepFrequency / metrics.maxAllowedFrequency > 0.8 ? 
                '#ff4444' : '#00ff88' }
            ]}>
              {metrics.currentStepFrequency / metrics.maxAllowedFrequency > 0.8 ? 
                '⚠️ Fréquence élevée' : '✅ Fréquence normale'}
            </Text>
          </View>

          {metrics.gyroConfirmationEnabled && (
            <View style={[
              styles.statusIndicator,
              { backgroundColor: metrics.lastGyroActivity > 0.1 ? 
                'rgba(0, 255, 136, 0.2)' : 'rgba(255, 170, 0, 0.2)' }
            ]}>
              <Text style={[
                styles.statusText,
                { color: metrics.lastGyroActivity > 0.1 ? '#00ff88' : '#ffaa00' }
              ]}>
                {metrics.lastGyroActivity > 0.1 ? 
                  '✅ Gyro actif' : '⚠️ Gyro faible'}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
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
        
        {/* Métriques de détection verticale */}
        {renderVerticalDetectionMetrics()}
        
        {/* Informations système */}
        {renderSystemInfo()}
        
        {/* Métriques physiologiques */}
        {renderPhysiologicalMetrics()}
        
        {/* Boutons d'action */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.exportButton} onPress={exportData}>
            <Ionicons name="download" size={20} color="#ffffff" />
            <Text style={styles.buttonText}>Exporter les données</Text>
          </TouchableOpacity>
        </View>
        
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
    width: '31%',
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
  distributionLegend: {
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
  actionsContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  exportButton: {
    backgroundColor: '#4ecdc4',
    borderRadius: 8,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
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
  verticalContainer: {
    marginHorizontal: 20,
    marginBottom: 25,
  },
  verticalStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  verticalLabel: {
    color: '#cccccc',
    fontSize: 12,
    marginRight: 8,
  },
  verticalValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  methodBadge: {
    padding: 4,
    borderRadius: 4,
  },
  methodBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  section: {
    padding: 20,
  },
  metricSubtitle: {
    color: '#888888',
    fontSize: 12,
  },
  statusIndicators: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  statusIndicator: {
    padding: 8,
    borderRadius: 8,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
}); 