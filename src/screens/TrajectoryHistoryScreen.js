import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, Rect, Text as SvgText } from 'react-native-svg';

import supabaseService from '../services/SupabaseService';
import { SVGExporter } from '../utils/SVGExporter';

export default function TrajectoryHistoryScreen({ navigation }) {
  const [trajectories, setTrajectories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTrajectory, setSelectedTrajectory] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [previewModal, setPreviewModal] = useState(false);

  useEffect(() => {
    loadTrajectories();
  }, []);

  const loadTrajectories = async () => {
    try {
      setIsLoading(true);
      const userTrajectories = await supabaseService.getUserTrajectories(50);
      setTrajectories(userTrajectories || []);
    } catch (error) {
      console.error('❌ [TRAJECTORY-HISTORY] Erreur chargement trajets:', error);
      Alert.alert('Erreur', 'Impossible de charger les trajets');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDuration = (duration) => {
    if (!duration || duration <= 0) return 'N/A';
    
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = Math.floor(duration % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const formatDistance = (distance) => {
    if (!distance || distance <= 0) return '0 m';
    
    if (distance >= 1000) {
      return `${(distance / 1000).toFixed(2)} km`;
    } else {
      return `${distance.toFixed(1)} m`;
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const prepareTrajectoryForExport = (trajectory) => {
    // Convertir les données Supabase au format attendu par SVGExporter
    const trajectoryData = trajectory.trajectory_data;
    
    if (!trajectoryData || !Array.isArray(trajectoryData)) {
      throw new Error('Données de trajectoire invalides');
    }

    return {
      name: trajectory.name || 'Trajet sans nom',
      date: trajectory.created_at,
      points: trajectoryData,
      stats: {
        stepCount: trajectory.step_count || 0,
        distance: trajectory.total_distance || 0,
        duration: trajectory.duration || 0
      },
      svgPath: null // Sera généré par l'exporteur
    };
  };

  const exportTrajectoryAsSVG = async (trajectory) => {
    try {
      setIsExporting(true);
      
      // Préparer les données
      const exportData = prepareTrajectoryForExport(trajectory);
      
      // Exporter en SVG
      const result = await SVGExporter.exportTrajectoryToFile(exportData, {
        width: 1200,
        height: 800,
        backgroundColor: '#000000',
        trajectoryColor: '#00ff88',
        pointColor: '#00ff88',
        textColor: '#ffffff',
        strokeWidth: 3,
        showGrid: true
      });

      if (result.success) {
        Alert.alert(
          'Export réussi ! 📁',
          `Le fichier ${result.fileName} a été créé.\n\nVous pouvez maintenant le partager ou l'enregistrer.`,
          [
            { text: 'OK', style: 'default' }
          ]
        );
      } else {
        Alert.alert('Erreur', result.error || 'Impossible d\'exporter le trajet');
      }
    } catch (error) {
      console.error('❌ [TRAJECTORY-HISTORY] Erreur export SVG:', error);
      Alert.alert('Erreur', 'Impossible d\'exporter le trajet en SVG');
    } finally {
      setIsExporting(false);
    }
  };

  const showTrajectoryPreview = (trajectory) => {
    setSelectedTrajectory(trajectory);
    setPreviewModal(true);
  };

  const deleteTrajectory = async (trajectory) => {
    Alert.alert(
      'Supprimer le trajet',
      `Êtes-vous sûr de vouloir supprimer "${trajectory.name}" ?\n\nCette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabaseService.deleteTrajectory(trajectory.id);
              Alert.alert('Succès', 'Trajet supprimé');
              loadTrajectories(); // Recharger la liste
            } catch (error) {
              console.error('❌ [TRAJECTORY-HISTORY] Erreur suppression:', error);
              Alert.alert('Erreur', 'Impossible de supprimer le trajet');
            }
          }
        }
      ]
    );
  };

  const shareTrajectoryInfo = async (trajectory) => {
    try {
      const message = `🗺️ Trajet: ${trajectory.name}
📅 Date: ${formatDate(trajectory.created_at)}
👣 Pas: ${trajectory.step_count || 0}
📏 Distance: ${formatDistance(trajectory.total_distance || 0)}
⏱️ Durée: ${formatDuration(trajectory.duration || 0)}
📍 Points: ${trajectory.trajectory_data?.length || 0}

Généré par l'App de Navigation PDR`;

      await Share.share({
        message: message,
        title: `Trajet ${trajectory.name}`
      });
    } catch (error) {
      console.error('❌ [TRAJECTORY-HISTORY] Erreur partage:', error);
    }
  };

  const renderTrajectoryPreview = () => {
    if (!selectedTrajectory || !selectedTrajectory.trajectory_data) {
      return null;
    }

    const trajectoryData = selectedTrajectory.trajectory_data;
    
    // Calculer les limites
    const xs = trajectoryData.map(p => p.x);
    const ys = trajectoryData.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    
    const width = maxX - minX;
    const height = maxY - minY;
    const scale = Math.min(280 / width, 280 / height) * 0.8;
    
    const svgPath = trajectoryData.map((point, index) => {
      const x = (point.x - minX) * scale + 20;
      const y = (point.y - minY) * scale + 20;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(' ');

    return (
      <Svg width="320" height="320" style={styles.previewSvg}>
        <Rect width="320" height="320" fill="#1a1a1a" stroke="#333333" strokeWidth="1" />
        
        {svgPath && (
          <Path
            d={svgPath}
            stroke="#00ff88"
            strokeWidth="2"
            fill="none"
            opacity="0.9"
          />
        )}
        
        {trajectoryData.length > 0 && (
          <>
            <Circle
              cx={(trajectoryData[0].x - minX) * scale + 20}
              cy={(trajectoryData[0].y - minY) * scale + 20}
              r="4"
              fill="#00ff00"
              stroke="#ffffff"
              strokeWidth="1"
            />
            
            <Circle
              cx={(trajectoryData[trajectoryData.length - 1].x - minX) * scale + 20}
              cy={(trajectoryData[trajectoryData.length - 1].y - minY) * scale + 20}
              r="4"
              fill="#ff4444"
              stroke="#ffffff"
              strokeWidth="1"
            />
          </>
        )}
      </Svg>
    );
  };

  const renderTrajectoryItem = ({ item }) => (
    <View style={styles.trajectoryItem}>
      <View style={styles.trajectoryHeader}>
        <View style={styles.trajectoryInfo}>
          <Text style={styles.trajectoryName}>{item.name || 'Trajet sans nom'}</Text>
          <Text style={styles.trajectoryDate}>{formatDate(item.created_at)}</Text>
        </View>
        
        <View style={styles.trajectoryActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => showTrajectoryPreview(item)}
          >
            <Ionicons name="eye" size={20} color="#4ecdc4" />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => shareTrajectoryInfo(item)}
          >
            <Ionicons name="share" size={20} color="#ffaa00" />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.actionButton, isExporting && styles.actionButtonDisabled]}
            onPress={() => exportTrajectoryAsSVG(item)}
            disabled={isExporting}
          >
            <Ionicons name="download" size={20} color="#00ff88" />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => deleteTrajectory(item)}
          >
            <Ionicons name="trash" size={20} color="#ff4444" />
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.trajectoryStats}>
        <View style={styles.statItem}>
          <Ionicons name="footsteps" size={16} color="#00ff88" />
          <Text style={styles.statText}>{item.step_count || 0} pas</Text>
        </View>
        
        <View style={styles.statItem}>
          <Ionicons name="navigate" size={16} color="#00ff88" />
          <Text style={styles.statText}>{formatDistance(item.total_distance || 0)}</Text>
        </View>
        
        <View style={styles.statItem}>
          <Ionicons name="time" size={16} color="#00ff88" />
          <Text style={styles.statText}>{formatDuration(item.duration || 0)}</Text>
        </View>
        
        <View style={styles.statItem}>
          <Ionicons name="location" size={16} color="#00ff88" />
          <Text style={styles.statText}>{item.trajectory_data?.length || 0} pts</Text>
        </View>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00ff88" />
          <Text style={styles.loadingText}>Chargement des trajets...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>Historique des Trajets</Text>
        
        <TouchableOpacity 
          style={styles.refreshButton}
          onPress={loadTrajectories}
        >
          <Ionicons name="refresh" size={24} color="#00ff88" />
        </TouchableOpacity>
      </View>

      {trajectories.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="map" size={80} color="#666666" />
          <Text style={styles.emptyStateTitle}>Aucun trajet sauvegardé</Text>
          <Text style={styles.emptyStateSubtitle}>
            Vos trajets enregistrés apparaîtront ici
          </Text>
        </View>
      ) : (
        <FlatList
          data={trajectories}
          keyExtractor={(item) => item.id}
          renderItem={renderTrajectoryItem}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Modal de prévisualisation */}
      <Modal
        visible={previewModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPreviewModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedTrajectory?.name || 'Aperçu du trajet'}
              </Text>
              <TouchableOpacity onPress={() => setPreviewModal(false)}>
                <Ionicons name="close" size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>
            
            {renderTrajectoryPreview()}
            
            {selectedTrajectory && (
              <View style={styles.modalStats}>
                <Text style={styles.modalStatsTitle}>Détails du trajet :</Text>
                <Text style={styles.modalStatsText}>
                  📅 {formatDate(selectedTrajectory.created_at)}
                </Text>
                <Text style={styles.modalStatsText}>
                  👣 {selectedTrajectory.step_count || 0} pas
                </Text>
                <Text style={styles.modalStatsText}>
                  📏 {formatDistance(selectedTrajectory.total_distance || 0)}
                </Text>
                <Text style={styles.modalStatsText}>
                  ⏱️ {formatDuration(selectedTrajectory.duration || 0)}
                </Text>
                <Text style={styles.modalStatsText}>
                  📍 {selectedTrajectory.trajectory_data?.length || 0} points
                </Text>
              </View>
            )}
            
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => {
                  setPreviewModal(false);
                  if (selectedTrajectory) {
                    exportTrajectoryAsSVG(selectedTrajectory);
                  }
                }}
              >
                <Ionicons name="download" size={20} color="#000000" />
                <Text style={styles.modalButtonText}>Exporter SVG</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Indicateur d'export */}
      {isExporting && (
        <Modal visible={true} transparent={true} animationType="fade">
          <View style={styles.exportOverlay}>
            <View style={styles.exportModal}>
              <ActivityIndicator size="large" color="#00ff88" />
              <Text style={styles.exportText}>Export en cours...</Text>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 16,
    marginTop: 15,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  refreshButton: {
    padding: 8,
  },
  listContainer: {
    padding: 15,
  },
  trajectoryItem: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#333333',
  },
  trajectoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  trajectoryInfo: {
    flex: 1,
  },
  trajectoryName: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  trajectoryDate: {
    color: '#cccccc',
    fontSize: 14,
  },
  trajectoryActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 10,
    marginLeft: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  trajectoryStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 15,
    marginBottom: 5,
  },
  statText: {
    color: '#cccccc',
    fontSize: 14,
    marginLeft: 6,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyStateTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
  },
  emptyStateSubtitle: {
    color: '#666666',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: '#333333',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  previewSvg: {
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalStats: {
    marginBottom: 20,
  },
  modalStatsTitle: {
    color: '#00ff88',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  modalStatsText: {
    color: '#cccccc',
    fontSize: 14,
    marginBottom: 6,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  modalButton: {
    backgroundColor: '#00ff88',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  modalButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  exportOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exportModal: {
    backgroundColor: '#1a1a1a',
    padding: 30,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333333',
  },
  exportText: {
    color: '#ffffff',
    fontSize: 16,
    marginTop: 15,
  },
}); 