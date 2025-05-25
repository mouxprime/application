import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function SettingsScreen() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true);
  const [wifiOnlyEnabled, setWifiOnlyEnabled] = useState(false);

  const generalSettings = [
    {
      id: 1,
      title: 'Langue',
      subtitle: 'Français',
      icon: 'language',
      color: '#007AFF',
      hasArrow: true,
    },
    {
      id: 2,
      title: 'Région',
      subtitle: 'France',
      icon: 'location',
      color: '#FF9500',
      hasArrow: true,
    },
  ];

  const privacySettings = [
    {
      id: 1,
      title: 'Politique de confidentialité',
      icon: 'shield-checkmark',
      color: '#34C759',
      hasArrow: true,
    },
    {
      id: 2,
      title: 'Conditions d\'utilisation',
      icon: 'document-text',
      color: '#5856D6',
      hasArrow: true,
    },
    {
      id: 3,
      title: 'Gérer les données',
      icon: 'server',
      color: '#FF3B30',
      hasArrow: true,
    },
  ];

  const supportSettings = [
    {
      id: 1,
      title: 'Centre d\'aide',
      icon: 'help-circle',
      color: '#32D74B',
      hasArrow: true,
    },
    {
      id: 2,
      title: 'Nous contacter',
      icon: 'mail',
      color: '#007AFF',
      hasArrow: true,
    },
    {
      id: 3,
      title: 'Signaler un problème',
      icon: 'bug',
      color: '#FF9500',
      hasArrow: true,
    },
    {
      id: 4,
      title: 'Évaluer l\'application',
      icon: 'star',
      color: '#FFD700',
      hasArrow: true,
    },
  ];

  const SettingItem = ({ item, children }) => (
    <TouchableOpacity style={styles.settingItem}>
      <View style={styles.settingContent}>
        <View style={[styles.settingIcon, { backgroundColor: item.color }]}>
          <Ionicons name={item.icon} size={20} color="white" />
        </View>
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>{item.title}</Text>
          {item.subtitle && (
            <Text style={styles.settingSubtitle}>{item.subtitle}</Text>
          )}
        </View>
      </View>
      {children || (item.hasArrow && (
        <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
      ))}
    </TouchableOpacity>
  );

  const ToggleItem = ({ title, icon, color, value, onValueChange }) => (
    <View style={styles.settingItem}>
      <View style={styles.settingContent}>
        <View style={[styles.settingIcon, { backgroundColor: color }]}>
          <Ionicons name={icon} size={20} color="white" />
        </View>
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>{title}</Text>
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#E5E5E5', true: '#007AFF' }}
        thumbColor={value ? '#ffffff' : '#f4f3f4'}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Section Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.settingsGroup}>
            <ToggleItem
              title="Notifications push"
              icon="notifications"
              color="#FF3B30"
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
            />
          </View>
        </View>

        {/* Section Apparence */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Apparence</Text>
          <View style={styles.settingsGroup}>
            <ToggleItem
              title="Mode sombre"
              icon="moon"
              color="#5856D6"
              value={darkModeEnabled}
              onValueChange={setDarkModeEnabled}
            />
          </View>
        </View>

        {/* Section Contenu */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contenu</Text>
          <View style={styles.settingsGroup}>
            <ToggleItem
              title="Lecture automatique"
              icon="play"
              color="#34C759"
              value={autoPlayEnabled}
              onValueChange={setAutoPlayEnabled}
            />
            <ToggleItem
              title="Télécharger uniquement en Wi-Fi"
              icon="wifi"
              color="#007AFF"
              value={wifiOnlyEnabled}
              onValueChange={setWifiOnlyEnabled}
            />
          </View>
        </View>

        {/* Section Général */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Général</Text>
          <View style={styles.settingsGroup}>
            {generalSettings.map((item) => (
              <SettingItem key={item.id} item={item} />
            ))}
          </View>
        </View>

        {/* Section Confidentialité */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Confidentialité et sécurité</Text>
          <View style={styles.settingsGroup}>
            {privacySettings.map((item) => (
              <SettingItem key={item.id} item={item} />
            ))}
          </View>
        </View>

        {/* Section Support */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>
          <View style={styles.settingsGroup}>
            {supportSettings.map((item) => (
              <SettingItem key={item.id} item={item} />
            ))}
          </View>
        </View>

        {/* Section À propos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>À propos</Text>
          <View style={styles.aboutCard}>
            <View style={styles.aboutHeader}>
              <View style={styles.appIcon}>
                <Ionicons name="phone-portrait" size={32} color="#007AFF" />
              </View>
              <View style={styles.aboutInfo}>
                <Text style={styles.appName}>KTApp</Text>
                <Text style={styles.appVersion}>Version 1.0.0</Text>
              </View>
            </View>
            <Text style={styles.aboutDescription}>
              Une application mobile moderne construite avec React Native et Expo.
              Conçue pour offrir une expérience utilisateur exceptionnelle.
            </Text>
            <View style={styles.developedBy}>
              <Text style={styles.developedByText}>
                Développé avec ❤️ par l'équipe KT
              </Text>
            </View>
          </View>
        </View>

        {/* Espace en bas */}
        <View style={styles.bottomSpacing} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginHorizontal: 20,
    marginBottom: 15,
  },
  settingsGroup: {
    backgroundColor: 'white',
    marginHorizontal: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
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
    color: '#333',
    fontWeight: '500',
  },
  settingSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  aboutCard: {
    backgroundColor: 'white',
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  aboutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  appIcon: {
    width: 60,
    height: 60,
    borderRadius: 15,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  aboutInfo: {
    flex: 1,
  },
  appName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  appVersion: {
    fontSize: 16,
    color: '#666',
  },
  aboutDescription: {
    fontSize: 15,
    color: '#666',
    lineHeight: 22,
    marginBottom: 15,
  },
  developedBy: {
    borderTopWidth: 1,
    borderTopColor: '#F5F5F5',
    paddingTop: 15,
    alignItems: 'center',
  },
  developedByText: {
    fontSize: 14,
    color: '#999',
  },
  bottomSpacing: {
    height: 30,
  },
}); 