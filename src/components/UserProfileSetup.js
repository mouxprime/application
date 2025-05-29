import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { userProfileService } from '../services/UserProfileService';

/**
 * Composant de configuration du profil utilisateur
 */
export default function UserProfileSetup({ visible, onClose }) {
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [calculatedStats, setCalculatedStats] = useState(null);

  useEffect(() => {
    if (visible) {
      loadCurrentProfile();
    }
  }, [visible]);

  useEffect(() => {
    // Calculer les statistiques en temps réel
    if (height && weight) {
      const heightNum = parseFloat(height);
      const weightNum = parseFloat(weight);
      
      if (heightNum > 0 && weightNum > 0) {
        const stepLength = userProfileService.calculateStepLength(heightNum, weightNum);
        const stepsPerKm = Math.round(1000 / stepLength);
        
        setCalculatedStats({
          stepLength: stepLength,
          stepsPerKm: stepsPerKm,
          stepLengthCm: Math.round(stepLength * 100)
        });
      } else {
        setCalculatedStats(null);
      }
    } else {
      setCalculatedStats(null);
    }
  }, [height, weight]);

  const loadCurrentProfile = async () => {
    try {
      const profile = userProfileService.getProfile();
      if (profile.height) setHeight(profile.height.toString());
      if (profile.weight) setWeight(profile.weight.toString());
    } catch (error) {
      console.error('Erreur chargement profil:', error);
    }
  };

  const handleSave = async () => {
    try {
      // Validation
      const heightNum = parseFloat(height);
      const weightNum = parseFloat(weight);

      if (!height || !weight) {
        Alert.alert('Erreur', 'Veuillez remplir tous les champs');
        return;
      }

      if (isNaN(heightNum) || heightNum < 100 || heightNum > 250) {
        Alert.alert('Erreur', 'La taille doit être entre 100 et 250 cm');
        return;
      }

      if (isNaN(weightNum) || weightNum < 30 || weightNum > 300) {
        Alert.alert('Erreur', 'Le poids doit être entre 30 et 300 kg');
        return;
      }

      setIsLoading(true);

      // Sauvegarder le profil
      const result = await userProfileService.updateProfile({
        height: heightNum,
        weight: weightNum,
      });

      if (result.success) {
        Alert.alert(
          'Succès',
          'Profil mis à jour avec succès !',
          [{ text: 'OK', onPress: onClose }]
        );
      } else {
        Alert.alert('Erreur', result.error || 'Impossible de sauvegarder le profil');
      }
    } catch (error) {
      console.error('Erreur sauvegarde profil:', error);
      Alert.alert('Erreur', 'Une erreur est survenue lors de la sauvegarde');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    Alert.alert(
      'Réinitialiser le profil',
      'Êtes-vous sûr de vouloir supprimer toutes les données du profil ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Réinitialiser',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            const result = await userProfileService.resetProfile();
            setIsLoading(false);
            
            if (result.success) {
              setHeight('');
              setWeight('');
              setCalculatedStats(null);
              Alert.alert('Succès', 'Profil réinitialisé');
            } else {
              Alert.alert('Erreur', 'Impossible de réinitialiser le profil');
            }
          }
        }
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* En-tête */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#888888" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Configuration du Profil</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Description */}
          <View style={styles.descriptionCard}>
            <Ionicons name="information-circle" size={24} color="#00ff88" />
            <Text style={styles.descriptionText}>
              Configurez votre taille et poids pour optimiser la précision du calcul de la longueur de pas.
            </Text>
          </View>

          {/* Formulaire */}
          <View style={styles.formSection}>
            <Text style={styles.sectionTitle}>Informations Physiques</Text>

            {/* Taille */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Taille (cm)</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="resize-outline" size={20} color="#888888" />
                <TextInput
                  style={styles.textInput}
                  value={height}
                  onChangeText={setHeight}
                  placeholder="Ex: 175"
                  placeholderTextColor="#666666"
                  keyboardType="numeric"
                  maxLength={3}
                />
                <Text style={styles.inputUnit}>cm</Text>
              </View>
            </View>

            {/* Poids */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Poids (kg)</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="fitness-outline" size={20} color="#888888" />
                <TextInput
                  style={styles.textInput}
                  value={weight}
                  onChangeText={setWeight}
                  placeholder="Ex: 70"
                  placeholderTextColor="#666666"
                  keyboardType="numeric"
                  maxLength={3}
                />
                <Text style={styles.inputUnit}>kg</Text>
              </View>
            </View>
          </View>

          {/* Statistiques calculées */}
          {calculatedStats && (
            <View style={styles.statsSection}>
              <Text style={styles.sectionTitle}>Statistiques Calculées</Text>
              
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Ionicons name="footsteps" size={24} color="#00ff88" />
                  <Text style={styles.statValue}>{calculatedStats.stepLengthCm}</Text>
                  <Text style={styles.statLabel}>cm/pas</Text>
                </View>
                
                <View style={styles.statCard}>
                  <Ionicons name="map" size={24} color="#00ff88" />
                  <Text style={styles.statValue}>{calculatedStats.stepsPerKm}</Text>
                  <Text style={styles.statLabel}>pas/km</Text>
                </View>
              </View>

              <View style={styles.infoBox}>
                <Ionicons name="calculator" size={16} color="#00ff88" />
                <Text style={styles.infoText}>
                  Longueur de pas: {calculatedStats.stepLength.toFixed(3)} m
                  {'\n'}Calculée selon votre morphologie
                </Text>
              </View>
            </View>
          )}

          {/* Conseils */}
          <View style={styles.tipsSection}>
            <Text style={styles.sectionTitle}>Informations</Text>
            
            <View style={styles.tipItem}>
              <Ionicons name="lock-closed" size={16} color="#00ff88" />
              <Text style={styles.tipText}>
                Ces données restent privées et stockées localement
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.resetButton}
            onPress={handleReset}
            disabled={isLoading}
          >
            <Ionicons name="refresh" size={20} color="#ff4444" />
            <Text style={styles.resetButtonText}>Réinitialiser</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveButton, isLoading && styles.disabledButton]}
            onPress={handleSave}
            disabled={isLoading || !height || !weight}
          >
            {isLoading ? (
              <ActivityIndicator color="#000000" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color="#000000" />
                <Text style={styles.saveButtonText}>Sauvegarder</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  descriptionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 15,
    backgroundColor: '#1a2a1a',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#00ff88',
    marginBottom: 25,
  },
  descriptionText: {
    flex: 1,
    color: '#aaaaaa',
    fontSize: 14,
    lineHeight: 20,
    marginLeft: 12,
  },
  formSection: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 15,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333333',
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  textInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 16,
    marginLeft: 10,
  },
  inputUnit: {
    color: '#888888',
    fontSize: 14,
    fontWeight: '500',
  },
  statsSection: {
    marginBottom: 25,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333333',
    marginHorizontal: 5,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginTop: 8,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#888888',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    backgroundColor: '#1a2a1a',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#00ff88',
  },
  infoText: {
    flex: 1,
    color: '#aaaaaa',
    fontSize: 13,
    lineHeight: 18,
    marginLeft: 8,
  },
  tipsSection: {
    marginBottom: 25,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  tipText: {
    flex: 1,
    color: '#aaaaaa',
    fontSize: 14,
    lineHeight: 18,
    marginLeft: 10,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: '#333333',
    gap: 15,
  },
  resetButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    backgroundColor: '#2a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ff4444',
  },
  resetButtonText: {
    color: '#ff4444',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  saveButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    backgroundColor: '#00ff88',
    borderRadius: 12,
  },
  disabledButton: {
    backgroundColor: '#333333',
  },
  saveButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
}); 