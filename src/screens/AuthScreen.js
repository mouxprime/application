import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import supabaseService from '../services/SupabaseService';

export default function AuthScreen({ onAuthSuccess }) {
  const [mode, setMode] = useState('signin'); // 'signin' ou 'signup'
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    height: '',
    weight: '',
    age: '',
    gender: 'unspecified'
  });

  // Vérifier si l'utilisateur est déjà connecté
  useEffect(() => {
    const checkAuthStatus = async () => {
      if (supabaseService.isAuthenticated()) {
        onAuthSuccess?.(supabaseService.getCurrentUser());
      }
    };
    
    checkAuthStatus();
  }, [onAuthSuccess]);

  const updateFormData = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const validateForm = () => {
    if (!formData.username.trim() || !formData.password) {
      Alert.alert('Erreur', 'Nom d\'utilisateur et mot de passe requis');
      return false;
    }

    if (formData.username.length < 3) {
      Alert.alert('Erreur', 'Le nom d\'utilisateur doit contenir au moins 3 caractères');
      return false;
    }

    if (formData.password.length < 6) {
      Alert.alert('Erreur', 'Le mot de passe doit contenir au moins 6 caractères');
      return false;
    }

    if (mode === 'signup') {
      if (formData.password !== formData.confirmPassword) {
        Alert.alert('Erreur', 'Les mots de passe ne correspondent pas');
        return false;
      }

      if (!formData.height || !formData.weight) {
        Alert.alert('Erreur', 'Taille et poids requis pour calculer la longueur de pas');
        return false;
      }

      const height = parseInt(formData.height);
      const weight = parseInt(formData.weight);
      if (height < 120 || height > 250 || weight < 30 || weight > 300) {
        Alert.alert('Erreur', 'Valeurs de taille ou poids invalides');
        return false;
      }

      // Validation de l'email si fourni
      if (formData.email.trim() && !formData.email.includes('@')) {
        Alert.alert('Erreur', 'Format d\'email invalide');
        return false;
      }
    }

    return true;
  };

  const handleSignIn = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const hasEmailProvided = !!formData.email.trim();
      
      if (hasEmailProvided) {
        // Connexion normale avec email
        const result = await supabaseService.signIn(formData.email.trim(), formData.password);
        Alert.alert('Succès', 'Connexion réussie !');
        onAuthSuccess?.(result.user);
      } else {
        // Connexion par username
        const result = await supabaseService.signInWithUsername(formData.username.trim(), formData.password);
        Alert.alert('Succès', 'Connexion réussie !');
        onAuthSuccess?.(result.user);
      }
    } catch (error) {
      console.error('❌ [AUTH] Erreur connexion:', error);
      
      let errorMessage = 'Erreur inconnue';
      
      if (error.message.includes('Configuration Supabase invalide')) {
        errorMessage = 'Service non configuré.\nVérifiez votre configuration Supabase.';
      } else if (error.message.includes('Service Supabase non initialisé')) {
        errorMessage = 'Service indisponible.\nVérifiez votre connexion internet et la configuration.';
      } else if (error.message.includes('Invalid login credentials') || error.message.includes('Nom d\'utilisateur introuvable')) {
        errorMessage = 'Nom d\'utilisateur ou mot de passe incorrect';
      } else {
        errorMessage = error.message;
      }
      
      Alert.alert('Erreur de connexion', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!validateForm()) return;

    // Avertissement si pas d'email
    if (!formData.email.trim()) {
      Alert.alert(
        '⚠️ Pas d\'email fourni',
        'ATTENTION : Vous n\'avez pas fourni d\'email.\n\n' +
        '🔒 Vos données ne seront JAMAIS récupérables en cas de perte de mot de passe.\n\n' +
        '💡 Recommandation : Ajoutez un email pour sécuriser votre compte.\n\n' +
        'Voulez-vous continuer sans email ?',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Ajouter un email', onPress: () => {
            // Focus sur le champ email (ou juste retourner)
            return;
          }},
          { text: 'Continuer sans email', style: 'destructive', onPress: proceedWithSignUp }
        ]
      );
      return;
    }

    proceedWithSignUp();
  };

  const proceedWithSignUp = async () => {
    setIsLoading(true);
    try {
      // Si pas d'email fourni, utiliser un email temporaire valide pour Supabase Auth
      // mais on marquera l'email comme NULL dans notre profil
      const hasRealEmail = !!formData.email.trim();
      
      // Essayer différents domaines si example.com ne fonctionne pas
      let emailForSupabase;
      if (hasRealEmail) {
        emailForSupabase = formData.email.trim();
      } else {
        const cleanUsername = formData.username.toLowerCase().replace(/[^a-z0-9]/g, '');
        const timestamp = Date.now();
        
        // Essayer avec un service d'email temporaire reconnu
        emailForSupabase = `${cleanUsername}${timestamp}@10minutemail.com`;
      }
      
      console.log('📧 [AUTH] Email utilisé pour Supabase:', emailForSupabase);
      
      const userData = {
        username: formData.username.trim(),
        height: parseInt(formData.height),
        weight: parseInt(formData.weight),
        age: formData.age ? parseInt(formData.age) : undefined,
        gender: formData.gender,
        hasRealEmail: hasRealEmail,
        actualEmail: hasRealEmail ? formData.email.trim() : null // Email réel ou NULL
      };

      const result = await supabaseService.signUp(emailForSupabase, formData.password, userData);
      
      Alert.alert(
        'Inscription réussie !',
        `Votre compte "${formData.username}" a été créé.\n\n` +
        (hasRealEmail ? 
          'Vous pouvez maintenant commencer à enregistrer vos trajets.' :
          '⚠️ N\'oubliez pas : sans email, vos données ne sont pas récupérables.\n💡 Vous pourrez ajouter un email plus tard dans les paramètres.'
        ),
        [{ text: 'OK', onPress: () => onAuthSuccess?.(result.user) }]
      );
    } catch (error) {
      console.error('❌ [AUTH] Erreur inscription:', error);
      
      let errorMessage = 'Erreur inconnue';
      
      if (error.message.includes('Configuration Supabase invalide')) {
        errorMessage = 'Service non configuré.\nVérifiez votre configuration Supabase.';
      } else if (error.message.includes('Service Supabase non initialisé')) {
        errorMessage = 'Service indisponible.\nVérifiez votre connexion internet et la configuration.';
      } else if (error.message.includes('already registered')) {
        errorMessage = 'Ce nom d\'utilisateur ou email est déjà utilisé';
      } else if (error.message.includes('Invalid input')) {
        errorMessage = 'Données invalides. Vérifiez vos informations.';
      } else if (error.message.includes('Email address') && error.message.includes('invalid')) {
        errorMessage = 'Problème de configuration email temporaire.\nEssayez avec un vrai email ou contactez le support.';
      } else {
        errorMessage = error.message;
      }
      
      Alert.alert('Erreur d\'inscription', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const renderSignInForm = () => (
    <View style={styles.formContainer}>
      <Text style={styles.title}>Connexion</Text>
      <Text style={styles.subtitle}>Connectez-vous avec votre nom d'utilisateur</Text>

      <View style={styles.inputContainer}>
        <Ionicons name="person" size={20} color="#888888" style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="Nom d'utilisateur"
          placeholderTextColor="#888888"
          value={formData.username}
          onChangeText={(text) => updateFormData('username', text)}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.inputContainer}>
        <Ionicons name="mail" size={20} color="#888888" style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="Email (optionnel pour connexion)"
          placeholderTextColor="#888888"
          value={formData.email}
          onChangeText={(text) => updateFormData('email', text)}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.inputContainer}>
        <Ionicons name="lock-closed" size={20} color="#888888" style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="Mot de passe"
          placeholderTextColor="#888888"
          value={formData.password}
          onChangeText={(text) => updateFormData('password', text)}
          secureTextEntry
        />
      </View>

      <TouchableOpacity 
        style={[styles.primaryButton, isLoading && styles.buttonDisabled]} 
        onPress={handleSignIn}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#000000" />
        ) : (
          <>
            <Ionicons name="log-in" size={20} color="#000000" />
            <Text style={styles.primaryButtonText}>Se connecter</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.secondaryButton} 
        onPress={() => setMode('signup')}
      >
        <Text style={styles.secondaryButtonText}>
          Pas de compte ? <Text style={styles.linkText}>S'inscrire</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderSignUpForm = () => (
    <View style={styles.formContainer}>
      <Text style={styles.title}>Inscription</Text>
      <Text style={styles.subtitle}>Créez votre compte pour commencer</Text>

      <View style={styles.inputContainer}>
        <Ionicons name="person" size={20} color="#888888" style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="Nom d'utilisateur (obligatoire)"
          placeholderTextColor="#888888"
          value={formData.username}
          onChangeText={(text) => updateFormData('username', text)}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.inputContainer}>
        <Ionicons name="mail" size={20} color="#ffaa00" style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="Email (OPTIONNEL - recommandé)"
          placeholderTextColor="#ffaa00"
          value={formData.email}
          onChangeText={(text) => updateFormData('email', text)}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <Text style={styles.emailWarning}>
        ⚠️ Sans email, vos données ne sont PAS récupérables en cas de perte de mot de passe
      </Text>

      <View style={styles.inputContainer}>
        <Ionicons name="lock-closed" size={20} color="#888888" style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="Mot de passe (min. 6 caractères)"
          placeholderTextColor="#888888"
          value={formData.password}
          onChangeText={(text) => updateFormData('password', text)}
          secureTextEntry
        />
      </View>

      <View style={styles.inputContainer}>
        <Ionicons name="lock-closed" size={20} color="#888888" style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="Confirmer le mot de passe"
          placeholderTextColor="#888888"
          value={formData.confirmPassword}
          onChangeText={(text) => updateFormData('confirmPassword', text)}
          secureTextEntry
        />
      </View>

      <Text style={styles.sectionTitle}>Informations personnelles</Text>
      <Text style={styles.sectionSubtitle}>
        Nécessaires pour calculer précisément votre longueur de pas
      </Text>

      <View style={styles.rowContainer}>
        <View style={[styles.inputContainer, styles.halfWidth]}>
          <Ionicons name="resize" size={20} color="#888888" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Taille (cm)"
            placeholderTextColor="#888888"
            value={formData.height}
            onChangeText={(text) => updateFormData('height', text)}
            keyboardType="numeric"
          />
        </View>

        <View style={[styles.inputContainer, styles.halfWidth]}>
          <Ionicons name="fitness" size={20} color="#888888" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Poids (kg)"
            placeholderTextColor="#888888"
            value={formData.weight}
            onChangeText={(text) => updateFormData('weight', text)}
            keyboardType="numeric"
          />
        </View>
      </View>

      <View style={styles.rowContainer}>
        <View style={[styles.inputContainer, styles.halfWidth]}>
          <Ionicons name="calendar" size={20} color="#888888" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Âge (optionnel)"
            placeholderTextColor="#888888"
            value={formData.age}
            onChangeText={(text) => updateFormData('age', text)}
            keyboardType="numeric"
          />
        </View>

        <View style={[styles.inputContainer, styles.halfWidth]}>
          <Ionicons name="person" size={20} color="#888888" style={styles.inputIcon} />
          <TouchableOpacity style={styles.pickerButton}>
            <Text style={styles.pickerText}>
              {formData.gender === 'male' ? 'Homme' :
               formData.gender === 'female' ? 'Femme' : 'Non spécifié'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity 
        style={[styles.primaryButton, isLoading && styles.buttonDisabled]} 
        onPress={handleSignUp}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#000000" />
        ) : (
          <>
            <Ionicons name="person-add" size={20} color="#000000" />
            <Text style={styles.primaryButtonText}>S'inscrire</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.secondaryButton} 
        onPress={() => setMode('signin')}
      >
        <Text style={styles.secondaryButtonText}>
          Déjà un compte ? <Text style={styles.linkText}>Se connecter</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Ionicons name="walk" size={48} color="#00ff88" />
            <Text style={styles.appTitle}>PDR Navigation</Text>
            <Text style={styles.appSubtitle}>Navigation piétonne de précision</Text>
          </View>

          {mode === 'signin' ? renderSignInForm() : renderSignUpForm()}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  appTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginTop: 10,
  },
  appSubtitle: {
    fontSize: 16,
    color: '#888888',
    marginTop: 5,
  },
  formContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#333333',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888888',
    textAlign: 'center',
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginTop: 20,
    marginBottom: 5,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#888888',
    marginBottom: 15,
  },
  emailWarning: {
    fontSize: 12,
    color: '#ffaa00',
    marginBottom: 15,
    marginTop: -10,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    marginBottom: 15,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: '#333333',
  },
  halfWidth: {
    flex: 1,
    marginHorizontal: 5,
  },
  rowContainer: {
    flexDirection: 'row',
    marginHorizontal: -5,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: 50,
    color: '#ffffff',
    fontSize: 16,
  },
  pickerButton: {
    flex: 1,
    height: 50,
    justifyContent: 'center',
  },
  pickerText: {
    color: '#ffffff',
    fontSize: 16,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00ff88',
    borderRadius: 8,
    padding: 15,
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  secondaryButton: {
    padding: 15,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#888888',
    fontSize: 14,
  },
  linkText: {
    color: '#00ff88',
    fontWeight: 'bold',
  },
}); 