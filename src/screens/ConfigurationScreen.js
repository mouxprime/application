import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import UserProfileSetup from '../components/UserProfileSetup';
import { configurationService } from '../services/ConfigurationService';
import { diagnosticService } from '../services/DiagnosticService';
import { userProfileService } from '../services/UserProfileService';
import { appearanceService } from '../services/AppearanceService';

export default function ConfigurationScreen() {
  // États pour la configuration des outils
  const [pedometerMode, setPedometerMode] = useState('application');
  const [compassMode, setCompassMode] = useState('native');
  const [isLoading, setIsLoading] = useState(true);
  const [hasNativePedometer, setHasNativePedometer] = useState(false);

  // États pour le profil utilisateur
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [userProfile, setUserProfile] = useState(null);

  // *** NOUVEAU: États pour la configuration des couleurs ***
  const [appearanceConfig, setAppearanceConfig] = useState(null);
  const [showColorPicker, setShowColorPicker] = useState({ visible: false, colorKey: '', currentColor: '' });

  // *** NOUVEAU: États pour la configuration des capteurs ***
  const [sensorsConfig, setSensorsConfig] = useState({
    frequency: 50,
    enabled: {
      accelerometer: true,
      gyroscope: true
    }
  });

  useEffect(() => {
    initializeConfiguration();
    initializeUserProfile();
    initializeAppearance();
  }, []);

  const initializeConfiguration = async () => {
    try {
      // Initialiser le service de configuration
      await configurationService.initialize();
      
      // Charger la configuration actuelle
      const config = configurationService.getConfiguration();
      setPedometerMode(config.pedometerMode);
      setCompassMode(config.compassMode);
      
      // *** NOUVEAU: Charger la configuration des capteurs ***
      const sensorsConfiguration = configurationService.getSensorsConfiguration();
      setSensorsConfig(sensorsConfiguration);
      
      // Vérifier la disponibilité du podomètre natif
      const nativeAvailable = await configurationService.isNativePedometerAvailable();
      setHasNativePedometer(nativeAvailable);
      
    } catch (error) {
      console.error('Erreur lors de l\'initialisation de la configuration:', error);
      Alert.alert('Erreur', 'Impossible de charger la configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const initializeUserProfile = async () => {
    try {
      await userProfileService.initialize();
      const profile = userProfileService.getProfile();
      setUserProfile(profile);
      
      // Écouter les changements de profil
      userProfileService.addListener((updatedProfile) => {
        setUserProfile(updatedProfile);
      });
    } catch (error) {
      console.error('❌ [CONFIGURATION] Erreur initialisation profil:', error);
    }
  };

  const initializeAppearance = async () => {
    try {
      await appearanceService.initialize();
      const config = appearanceService.getConfiguration();
      setAppearanceConfig(config);
    } catch (error) {
      console.error('❌ [APPEARANCE] Erreur initialisation configuration:', error);
    }
  };

  const handlePedometerModeChange = async (mode) => {
    try {
      await configurationService.setPedometerMode(mode);
      setPedometerMode(mode);
      
      if (mode === 'native' && !hasNativePedometer) {
        Alert.alert(
          'Attention',
          'Le podomètre natif n\'est pas disponible sur cet appareil. L\'application utilisera le mode application en fallback.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Erreur lors du changement de mode podomètre:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder la configuration');
    }
  };

  const handleUserProfileSetup = () => {
    setShowProfileSetup(true);
  };

  // *** NOUVEAU: Gestion des couleurs ***
  const handleColorSelection = (colorKey, colorValue) => {
    setShowColorPicker({ visible: true, colorKey, currentColor: colorValue });
  };

  const applyColorChange = async (newColor) => {
    try {
      await appearanceService.setColor(showColorPicker.colorKey, newColor);
      const updatedConfig = appearanceService.getConfiguration();
      setAppearanceConfig(updatedConfig);
      setShowColorPicker({ visible: false, colorKey: '', currentColor: '' });
    } catch (error) {
      console.error('❌ [APPEARANCE] Erreur application couleur:', error);
      Alert.alert('Erreur', 'Impossible d\'appliquer la couleur: ' + error.message);
    }
  };

  const resetAppearanceToDefaults = () => {
    Alert.alert(
      'Réinitialiser l\'apparence',
      'Êtes-vous sûr de vouloir réinitialiser toutes les couleurs aux valeurs par défaut ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Réinitialiser',
          style: 'destructive',
          onPress: async () => {
            try {
              await appearanceService.resetToDefaults();
              const config = appearanceService.getConfiguration();
              setAppearanceConfig(config);
              Alert.alert('Succès', 'Couleurs réinitialisées');
            } catch (error) {
              Alert.alert('Erreur', 'Impossible de réinitialiser les couleurs');
            }
          }
        }
      ]
    );
  };

  const handlePedometerDiagnostic = async () => {
    try {
      console.log('🔍 [DIAGNOSTIC] Génération du rapport de diagnostic...');
      
      const report = await diagnosticService.generateReport();
      
      console.log('📊 [DIAGNOSTIC] Rapport généré:', report);
      
      // Afficher les résultats dans une alerte
      const statusText = report.pedometer.nativeModuleStatus === 'available' ? 
        '✅ Disponible' : 
        report.pedometer.nativeModuleStatus === 'unavailable' ? 
        '❌ Indisponible' :
        report.pedometer.nativeModuleStatus === 'missing' ?
        '❌ Module manquant' :
        '❌ Erreur';
      
      const deviceText = report.pedometer.isPhysicalDevice ? 
        '📱 Appareil physique' : 
        '🖥️ Simulateur';
      
      const recommendations = report.pedometer.recommendations.slice(0, 3).join('\n\n');
      
      Alert.alert(
        'Diagnostic Podomètre Natif',
        `Statut: ${statusText}\n` +
        `Appareil: ${deviceText}\n` +
        `Plateforme: ${report.pedometer.platform}\n\n` +
        `Recommandations:\n${recommendations}`,
        [
          { text: 'OK', style: 'default' }
        ]
      );
      
    } catch (error) {
      console.error('❌ [DIAGNOSTIC] Erreur:', error);
      Alert.alert('Erreur', 'Impossible de générer le diagnostic: ' + error.message);
    }
  };

  const resetToDefaults = () => {
    Alert.alert(
      'Réinitialiser la configuration',
      'Êtes-vous sûr de vouloir réinitialiser tous les paramètres aux valeurs par défaut ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Réinitialiser',
          style: 'destructive',
          onPress: async () => {
            try {
              await configurationService.resetToDefaults();
              const config = configurationService.getConfiguration();
              setPedometerMode(config.pedometerMode);
              setCompassMode(config.compassMode);
              Alert.alert('Succès', 'Configuration réinitialisée');
            } catch (error) {
              Alert.alert('Erreur', 'Impossible de réinitialiser la configuration');
            }
          }
        }
      ]
    );
  };

  // *** NOUVEAU: Gestion des capteurs ***
  const handleSensorsFrequencyChange = async (frequency) => {
    try {
      await configurationService.setSensorsFrequency(frequency);
      const updatedConfig = configurationService.getSensorsConfiguration();
      setSensorsConfig(updatedConfig);
    } catch (error) {
      console.error('❌ [CONFIGURATION] Erreur changement fréquence capteurs:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder la fréquence des capteurs: ' + error.message);
    }
  };

  const handleSensorToggle = async (sensorName, enabled) => {
    try {
      await configurationService.setSensorEnabled(sensorName, enabled);
      const updatedConfig = configurationService.getSensorsConfiguration();
      setSensorsConfig(updatedConfig);
    } catch (error) {
      console.error('❌ [CONFIGURATION] Erreur activation/désactivation capteur:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder la configuration des capteurs: ' + error.message);
    }
  };

  const diagnosticSettings = [
    {
      id: 1,
      title: 'Diagnostic Podomètre',
      subtitle: 'Analyser la disponibilité du module natif',
      icon: 'medical',
      color: '#00ff88',
      hasArrow: true,
      onPress: handlePedometerDiagnostic,
    },
  ];

  const SettingItem = ({ item, children }) => (
    <TouchableOpacity 
      style={styles.settingItem}
      onPress={item.onPress}
    >
      <View style={styles.settingContent}>
        <View style={[styles.settingIcon, { backgroundColor: item.color }]}>
          <Ionicons name={item.icon} size={20} color="#000000" />
        </View>
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>{item.title}</Text>
          {item.subtitle && (
            <Text style={styles.settingSubtitle}>{item.subtitle}</Text>
          )}
        </View>
      </View>
      {children || (item.hasArrow && (
        <Ionicons name="chevron-forward" size={20} color="#888888" />
      ))}
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Chargement de la configuration...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Section Configuration des Outils */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Configuration des Outils</Text>
          
          {/* Podomètre */}
          <View style={styles.toolSection}>
            <View style={styles.sectionHeader}>
              <Ionicons name="walk" size={24} color="#00ff88" />
              <Text style={styles.toolSectionTitle}>Podomètre</Text>
            </View>
            
            <Text style={styles.sectionDescription}>
              Choisissez le système de détection de pas à utiliser
            </Text>

            <View style={styles.optionContainer}>
              <TouchableOpacity
                style={[
                  styles.optionCard,
                  pedometerMode === 'application' && styles.optionCardSelected
                ]}
                onPress={() => handlePedometerModeChange('application')}
              >
                <View style={styles.optionHeader}>
                  <Ionicons 
                    name="phone-portrait" 
                    size={20} 
                    color={pedometerMode === 'application' ? '#00ff88' : '#888'} 
                  />
                  <Text style={[
                    styles.optionTitle,
                    pedometerMode === 'application' && styles.optionTitleSelected
                  ]}>
                    Podomètre Application
                  </Text>
                  {pedometerMode === 'application' && (
                    <Ionicons name="checkmark-circle" size={20} color="#00ff88" />
                  )}
                </View>
                <Text style={styles.optionDescription}>
                  Utilise l'algorithme PDR intégré à l'application pour détecter les pas
                </Text>
                <View style={styles.optionFeatures}>
                  <Text style={styles.featureText}>✓ Disponible sur tous les appareils</Text>
                  <Text style={styles.featureText}>✓ Algorithme personnalisé</Text>
                  <Text style={styles.featureText}>✓ Détection adaptative</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.optionCard,
                  pedometerMode === 'native' && styles.optionCardSelected,
                  !hasNativePedometer && styles.optionCardDisabled
                ]}
                onPress={() => hasNativePedometer && handlePedometerModeChange('native')}
                disabled={!hasNativePedometer}
              >
                <View style={styles.optionHeader}>
                  <Ionicons 
                    name="hardware-chip" 
                    size={20} 
                    color={
                      !hasNativePedometer ? '#444' :
                      pedometerMode === 'native' ? '#00ff88' : '#888'
                    } 
                  />
                  <Text style={[
                    styles.optionTitle,
                    pedometerMode === 'native' && styles.optionTitleSelected,
                    !hasNativePedometer && styles.optionTitleDisabled
                  ]}>
                    Podomètre Natif iOS
                  </Text>
                  {pedometerMode === 'native' && hasNativePedometer && (
                    <Ionicons name="checkmark-circle" size={20} color="#00ff88" />
                  )}
                  {!hasNativePedometer && (
                    <Ionicons name="close-circle" size={20} color="#ff4444" />
                  )}
                </View>
                <Text style={[
                  styles.optionDescription,
                  !hasNativePedometer && styles.optionDescriptionDisabled
                ]}>
                  Utilise CoreMotion/CMPedometer d'iOS pour une précision maximale
                </Text>
                <View style={styles.optionFeatures}>
                  <Text style={[
                    styles.featureText,
                    !hasNativePedometer && styles.featureTextDisabled
                  ]}>
                    {hasNativePedometer ? '✓' : '✗'} Disponible uniquement sur iOS
                  </Text>
                  <Text style={[
                    styles.featureText,
                    !hasNativePedometer && styles.featureTextDisabled
                  ]}>
                    {hasNativePedometer ? '✓' : '✗'} Précision optimale
                  </Text>
                  <Text style={[
                    styles.featureText,
                    !hasNativePedometer && styles.featureTextDisabled
                  ]}>
                    {hasNativePedometer ? '✓' : '✗'} Économie d'énergie
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Boussole */}
          <View style={styles.toolSection}>
            <View style={styles.sectionHeader}>
              <Ionicons name="compass" size={24} color="#00ff88" />
              <Text style={styles.toolSectionTitle}>Boussole</Text>
            </View>
            
            <Text style={styles.sectionDescription}>
              Système d'orientation utilisé (uniquement natif disponible)
            </Text>

            <View style={styles.optionContainer}>
              <View style={[styles.optionCard, styles.optionCardSelected]}>
                <View style={styles.optionHeader}>
                  <Ionicons name="compass" size={20} color="#00ff88" />
                  <Text style={[styles.optionTitle, styles.optionTitleSelected]}>
                    Boussole Native {Platform.OS === 'ios' ? 'iOS' : 'Android'}
                  </Text>
                  <Ionicons name="checkmark-circle" size={20} color="#00ff88" />
                </View>
                <Text style={styles.optionDescription}>
                  Utilise la boussole native du système pour l'orientation
                </Text>
                <View style={styles.optionFeatures}>
                  <Text style={styles.featureText}>✓ Précision optimale</Text>
                  <Text style={styles.featureText}>✓ Calibration automatique</Text>
                  <Text style={styles.featureText}>✓ Économie d'énergie</Text>
                </View>
              </View>
            </View>

            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={20} color="#00ff88" />
              <Text style={styles.infoText}>
                Les modules de boussole personnalisés ont été supprimés. 
                Seule la boussole native est maintenant disponible pour une meilleure fiabilité.
              </Text>
            </View>
          </View>
        </View>

        {/* Section Profil Utilisateur */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profil Utilisateur</Text>
          
          <View style={styles.profileCard}>
            <View style={styles.profileHeader}>
              <Ionicons name="person-circle" size={32} color="#00ff88" />
              <View style={styles.profileInfo}>
                <Text style={styles.profileTitle}>Configuration Personnelle</Text>
                {userProfile && (
                  <Text style={styles.profileSubtitle}>
                    Taille: {userProfile.height} cm • Poids: {userProfile.weight} kg
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={handleUserProfileSetup}>
                <Ionicons name="chevron-forward" size={20} color="#888888" />
              </TouchableOpacity>
            </View>
            
            {userProfile && (
              <View style={styles.profileStats}>
                <View style={styles.profileStat}>
                  <Text style={styles.profileStatValue}>{userProfile.height}</Text>
                  <Text style={styles.profileStatLabel}>cm</Text>
                </View>
                <View style={styles.profileStat}>
                  <Text style={styles.profileStatValue}>{userProfile.weight}</Text>
                  <Text style={styles.profileStatLabel}>kg</Text>
                </View>
                <View style={styles.profileStat}>
                  <Text style={styles.profileStatValue}>{userProfile.calculatedStepLength?.toFixed(3)}</Text>
                  <Text style={styles.profileStatLabel}>m/pas</Text>
                </View>
              </View>
            )}
            
            <TouchableOpacity style={styles.profileButton} onPress={handleUserProfileSetup}>
              <Ionicons name="settings" size={20} color="#000000" />
              <Text style={styles.profileButtonText}>Configurer le profil</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* *** NOUVEAU: Section Configuration des Couleurs *** */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Configuration des Couleurs</Text>
          
          {appearanceConfig && (
            <View style={styles.colorsContainer}>
              {/* Couleur de fond */}
              <View style={styles.colorItem}>
                <Text style={styles.colorLabel}>Fond de carte</Text>
                <TouchableOpacity
                  style={[styles.colorPreview, { backgroundColor: appearanceConfig.backgroundColor }]}
                  onPress={() => handleColorSelection('backgroundColor', appearanceConfig.backgroundColor)}
                >
                  <Text style={styles.colorValue}>{appearanceConfig.backgroundColor}</Text>
                </TouchableOpacity>
              </View>

              {/* Couleur de trajectoire */}
              <View style={styles.colorItem}>
                <Text style={styles.colorLabel}>Tracé de trajectoire</Text>
                <TouchableOpacity
                  style={[styles.colorPreview, { backgroundColor: appearanceConfig.trajectoryColor }]}
                  onPress={() => handleColorSelection('trajectoryColor', appearanceConfig.trajectoryColor)}
                >
                  <Text style={[styles.colorValue, { 
                    color: appearanceConfig.trajectoryColor === '#000000' ? '#ffffff' : '#000000' 
                  }]}>
                    {appearanceConfig.trajectoryColor}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Couleur de grille */}
              <View style={styles.colorItem}>
                <Text style={styles.colorLabel}>Grille de référence</Text>
                <TouchableOpacity
                  style={[styles.colorPreview, { backgroundColor: appearanceConfig.gridColor }]}
                  onPress={() => handleColorSelection('gridColor', appearanceConfig.gridColor)}
                >
                  <Text style={[styles.colorValue, { 
                    color: appearanceConfig.gridColor === '#000000' ? '#ffffff' : '#000000' 
                  }]}>
                    {appearanceConfig.gridColor}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Couleur utilisateur */}
              <View style={styles.colorItem}>
                <Text style={styles.colorLabel}>Position utilisateur</Text>
                <TouchableOpacity
                  style={[styles.colorPreview, { backgroundColor: appearanceConfig.userColor }]}
                  onPress={() => handleColorSelection('userColor', appearanceConfig.userColor)}
                >
                  <Text style={[styles.colorValue, { 
                    color: appearanceConfig.userColor === '#000000' ? '#ffffff' : '#000000' 
                  }]}>
                    {appearanceConfig.userColor}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Couleur orientation */}
              <View style={styles.colorItem}>
                <Text style={styles.colorLabel}>Direction/Orientation</Text>
                <TouchableOpacity
                  style={[styles.colorPreview, { backgroundColor: appearanceConfig.orientationColor }]}
                  onPress={() => handleColorSelection('orientationColor', appearanceConfig.orientationColor)}
                >
                  <Text style={[styles.colorValue, { 
                    color: appearanceConfig.orientationColor === '#000000' ? '#ffffff' : '#000000' 
                  }]}>
                    {appearanceConfig.orientationColor}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Bouton de réinitialisation */}
              <TouchableOpacity style={styles.resetColorsButton} onPress={resetAppearanceToDefaults}>
                <Ionicons name="color-palette" size={20} color="#ff6b35" />
                <Text style={styles.resetColorsButtonText}>Réinitialiser les couleurs</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Section Diagnostic */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Diagnostic</Text>
          
          <View style={styles.settingsGroup}>
            {diagnosticSettings.map((item) => (
              <SettingItem key={item.id} item={item} />
            ))}
          </View>
        </View>

        {/* Section Informations Système */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations Système</Text>

          <View style={styles.infoContainer}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Plateforme:</Text>
              <Text style={styles.infoValue}>{Platform.OS}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Podomètre natif</Text>
              <Text style={[
                styles.infoValue,
                hasNativePedometer ? styles.infoValueSuccess : styles.infoValueError
              ]}>
                {hasNativePedometer ? 'Disponible' : 'Non disponible'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Boussole native</Text>
              <Text style={[styles.infoValue, styles.infoValueSuccess]}>
                Disponible
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Mode actuel</Text>
              <Text style={[
                styles.infoValue,
                pedometerMode === 'native' ? styles.infoValueSuccess : styles.infoValueWarning
              ]}>
                {pedometerMode === 'native' ? 'NATIF' : 'APPLICATION'}
              </Text>
            </View>
          </View>
        </View>

        {/* Bouton de réinitialisation */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.resetButton} onPress={resetToDefaults}>
            <Ionicons name="refresh" size={20} color="#ff4444" />
            <Text style={styles.resetButtonText}>Réinitialiser la configuration</Text>
          </TouchableOpacity>
        </View>

        {/* Espace en bas */}
        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Modal de configuration du profil */}
      <UserProfileSetup
        visible={showProfileSetup}
        onClose={() => setShowProfileSetup(false)}
      />

      {/* *** NOUVEAU: Modal de sélection de couleurs *** */}
      <Modal
        visible={showColorPicker.visible}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.colorPickerOverlay}>
          <View style={styles.colorPickerContent}>
            <View style={styles.colorPickerHeader}>
              <Ionicons name="color-palette" size={32} color="#00ff88" />
              <Text style={styles.colorPickerTitle}>Choisir une couleur</Text>
              <TouchableOpacity 
                onPress={() => setShowColorPicker({ visible: false, colorKey: '', currentColor: '' })}
                style={styles.colorPickerClose}
              >
                <Ionicons name="close" size={24} color="#888888" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.colorPickerSubtitle}>
              {showColorPicker.colorKey === 'backgroundColor' ? 'Fond de carte' :
               showColorPicker.colorKey === 'trajectoryColor' ? 'Tracé de trajectoire' :
               showColorPicker.colorKey === 'gridColor' ? 'Grille de référence' :
               showColorPicker.colorKey === 'userColor' ? 'Position utilisateur' :
               showColorPicker.colorKey === 'orientationColor' ? 'Direction/Orientation' : ''}
            </Text>
            
            {/* Couleur actuelle */}
            <View style={styles.currentColorSection}>
              <Text style={styles.currentColorLabel}>Couleur actuelle :</Text>
              <View style={[styles.currentColorPreview, { backgroundColor: showColorPicker.currentColor }]}>
                <Text style={[styles.currentColorText, { 
                  color: showColorPicker.currentColor === '#000000' ? '#ffffff' : '#000000' 
                }]}>
                  {showColorPicker.currentColor}
                </Text>
              </View>
            </View>
            
            {/* Couleurs prédéfinies */}
            <Text style={styles.presetColorsTitle}>Couleurs prédéfinies :</Text>
            <View style={styles.presetColorsGrid}>
              {(showColorPicker.colorKey === 'backgroundColor' ? 
                appearanceService.getPresetColors().backgrounds : 
                appearanceService.getPresetColors().trajectories
              ).map((preset, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.presetColorItem, { backgroundColor: preset.value }]}
                  onPress={() => applyColorChange(preset.value)}
                >
                  <Text style={[styles.presetColorName, { 
                    color: preset.value === '#000000' ? '#ffffff' : '#000000',
                    opacity: preset.value === '#000000' || preset.value === '#ffffff' ? 1 : 0
                  }]}>
                    {preset.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingTop: 0,
    paddingBottom: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 16,
  },
  header: {
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 10,
  },
  headerSubtitle: {
    color: '#888888',
    fontSize: 14,
    marginTop: 5,
    textAlign: 'center',
  },
  section: {
    margin: 15,
    padding: 15,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333333',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 15,
  },
  toolSection: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  toolSectionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  sectionDescription: {
    color: '#888888',
    fontSize: 14,
    marginBottom: 15,
    lineHeight: 20,
  },
  optionContainer: {
    gap: 10,
  },
  optionCard: {
    padding: 15,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#333333',
  },
  optionCardSelected: {
    borderColor: '#00ff88',
    backgroundColor: '#1a2a1a',
  },
  optionCardDisabled: {
    backgroundColor: '#1a1a1a',
    borderColor: '#222222',
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  optionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
    marginLeft: 10,
  },
  optionTitleSelected: {
    color: '#00ff88',
  },
  optionTitleDisabled: {
    color: '#444444',
  },
  optionDescription: {
    color: '#888888',
    fontSize: 14,
    marginBottom: 10,
    lineHeight: 18,
  },
  optionDescriptionDisabled: {
    color: '#444444',
  },
  optionFeatures: {
    gap: 4,
  },
  featureText: {
    color: '#aaaaaa',
    fontSize: 12,
  },
  featureTextDisabled: {
    color: '#444444',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    backgroundColor: '#1a2a1a',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#00ff88',
    marginTop: 15,
  },
  infoText: {
    color: '#aaaaaa',
    fontSize: 13,
    marginLeft: 10,
    flex: 1,
    lineHeight: 18,
  },
  settingsGroup: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333333',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  settingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  settingText: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '500',
  },
  settingSubtitle: {
    fontSize: 14,
    color: '#888888',
    marginTop: 2,
  },
  infoContainer: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#333333',
    gap: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    color: '#888888',
    fontSize: 14,
  },
  infoValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  infoValueSuccess: {
    color: '#00ff88',
  },
  infoValueError: {
    color: '#ff4444',
  },
  infoValueWarning: {
    color: '#ffaa00',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    backgroundColor: '#2a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ff4444',
  },
  resetButtonText: {
    color: '#ff4444',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  bottomSpacing: {
    height: 30,
  },
  profileCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#333333',
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  profileInfo: {
    flex: 1,
    marginLeft: 15,
  },
  profileTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  profileSubtitle: {
    fontSize: 14,
    color: '#888888',
  },
  profileStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  profileStat: {
    alignItems: 'center',
  },
  profileStatValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  profileStatLabel: {
    fontSize: 12,
    color: '#888888',
  },
  profileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00ff88',
    padding: 15,
    borderRadius: 12,
  },
  profileButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
    marginLeft: 8,
  },
  colorsContainer: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#333333',
    gap: 10,
  },
  colorItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  colorLabel: {
    color: '#888888',
    fontSize: 14,
  },
  colorPreview: {
    width: 100,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  resetColorsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    backgroundColor: '#2a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ff4444',
  },
  resetColorsButtonText: {
    color: '#ff4444',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  colorPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorPickerContent: {
    backgroundColor: '#1a1a1a',
    padding: 20,
    borderRadius: 12,
    width: '80%',
    maxHeight: '80%',
  },
  colorPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  colorPickerTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
  },
  colorPickerClose: {
    padding: 5,
  },
  colorPickerSubtitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  currentColorSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  currentColorLabel: {
    color: '#ffffff',
    fontSize: 14,
    marginRight: 10,
  },
  currentColorPreview: {
    width: 100,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  currentColorText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  presetColorsTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  presetColorsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  presetColorItem: {
    width: '30%',
    padding: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#333333',
  },
  presetColorName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
}); 