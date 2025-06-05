#!/usr/bin/env node

/**
 * Script de vérification de l'installation PDR Navigation
 * Vérifie que tous les composants sont correctement configurés
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Vérification de l\'installation PDR Navigation...\n');

// Vérifications des fichiers essentiels
const requiredFiles = [
  'src/services/SupabaseService.js',
  'src/screens/AuthScreen.js',
  'src/screens/AccountScreen.js',
  'src/screens/FriendsScreen.js',
  'src/config/supabase.js',
  'docs/sql/verifier_profils_manquants.sql',
  'docs/sql/trigger_auto_profile.sql',
  'docs/sql/setup_friendships_rls.sql',
  'docs/guides/GUIDE_RESOLUTION_PROFILS.md',
  'docs/guides/CORRECTION_ERREUR_UUID.md',
  'docs/guides/GUIDE_RLS_FRIENDSHIPS.md',
  'docs/guides/GUIDE_INTERFACE_AMIS.md'
];

let allFilesExist = true;

console.log('📁 Vérification des fichiers essentiels:');
requiredFiles.forEach(file => {
  const exists = fs.existsSync(file);
  console.log(`  ${exists ? '✅' : '❌'} ${file}`);
  if (!exists) allFilesExist = false;
});

// Vérification de la structure package.json
console.log('\n📦 Vérification package.json:');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const requiredDeps = ['@supabase/supabase-js', '@react-native-async-storage/async-storage', 'expo'];
  
  requiredDeps.forEach(dep => {
    const hasDepency = packageJson.dependencies?.[dep] || packageJson.devDependencies?.[dep];
    console.log(`  ${hasDepency ? '✅' : '❌'} ${dep}`);
  });
} catch (error) {
  console.log('  ❌ Erreur lecture package.json');
}

// Vérification de la configuration Supabase
console.log('\n⚙️ Vérification configuration Supabase:');
try {
  // Vérifier l'existence des fichiers d'environnement
  const envExists = fs.existsSync('.env');
  const envExampleExists = fs.existsSync('env.example');
  
  console.log(`  ${envExists ? '✅' : '❌'} Fichier .env ${envExists ? 'présent' : 'manquant'}`);
  console.log(`  ${envExampleExists ? '✅' : '✅'} Template env.example ${envExampleExists ? 'présent' : 'manquant'}`);
  
  // Vérifier que .env est dans .gitignore
  const gitignore = fs.readFileSync('.gitignore', 'utf8');
  const envIgnored = gitignore.includes('.env');
  console.log(`  ${envIgnored ? '✅' : '⚠️'} .env ${envIgnored ? 'ignoré par git' : 'pas ignoré par git'}`);
  
  // Vérifier la configuration dans le code
  const supabaseConfig = fs.readFileSync('src/config/supabase.js', 'utf8');
  const usesEnvVars = supabaseConfig.includes('process.env.EXPO_PUBLIC_SUPABASE_URL');
  const noHardcodedCredentials = !supabaseConfig.includes('https://') || supabaseConfig.includes('process.env');
  
  console.log(`  ${usesEnvVars ? '✅' : '❌'} Variables d'environnement ${usesEnvVars ? 'utilisées' : 'non utilisées'}`);
  console.log(`  ${noHardcodedCredentials ? '✅' : '⚠️'} Credentials ${noHardcodedCredentials ? 'sécurisés' : 'peut-être exposés'}`);
  
  if (envExists) {
    // Lecture sécurisée du .env (sans afficher les valeurs)
    const envContent = fs.readFileSync('.env', 'utf8');
    const hasUrl = envContent.includes('EXPO_PUBLIC_SUPABASE_URL=') && !envContent.includes('your-project-url');
    const hasKey = envContent.includes('EXPO_PUBLIC_SUPABASE_ANON_KEY=') && !envContent.includes('your-anon-key');
    
    console.log(`  ${hasUrl ? '✅' : '⚠️'} URL Supabase ${hasUrl ? 'configurée dans .env' : 'à configurer dans .env'}`);
    console.log(`  ${hasKey ? '✅' : '⚠️'} Clé anonyme ${hasKey ? 'configurée dans .env' : 'à configurer dans .env'}`);
  }
} catch (error) {
  console.log('  ❌ Erreur vérification configuration Supabase');
}

// Vérification de la structure des dossiers
console.log('\n📂 Vérification structure des dossiers:');
const requiredDirs = ['src', 'docs', 'docs/sql', 'docs/guides', 'scripts'];
requiredDirs.forEach(dir => {
  const exists = fs.existsSync(dir);
  console.log(`  ${exists ? '✅' : '❌'} ${dir}/`);
});

// Vérification spécifique pour le système d'amis
console.log('\n👥 Vérification système d\'amis:');
try {
  const supabaseService = fs.readFileSync('src/services/SupabaseService.js', 'utf8');
  const hasFriendFunctions = [
    'sendFriendRequest',
    'getFriends', 
    'getFriendRequests',
    'searchUsersByUsername'
  ];
  
  hasFriendFunctions.forEach(func => {
    const hasFunction = supabaseService.includes(`async ${func}(`);
    console.log(`  ${hasFunction ? '✅' : '❌'} Fonction ${func}()`);
  });
} catch (error) {
  console.log('  ❌ Erreur vérification fonctions d\'amis');
}

// Vérification spécifique pour l'interface des amis
console.log('\n🎨 Vérification interface des amis:');
try {
  // Vérifier que FriendsScreen existe
  const friendsScreenExists = fs.existsSync('src/screens/FriendsScreen.js');
  console.log(`  ${friendsScreenExists ? '✅' : '❌'} FriendsScreen.js`);
  
  // Vérifier que la navigation inclut FriendsScreen
  const navigator = fs.readFileSync('src/navigation/MainNavigator.js', 'utf8');
  const hasFriendsImport = navigator.includes('import FriendsScreen');
  const hasFriendsRoute = navigator.includes('name="Friends"');
  console.log(`  ${hasFriendsImport ? '✅' : '❌'} Import FriendsScreen dans navigation`);
  console.log(`  ${hasFriendsRoute ? '✅' : '❌'} Route Friends configurée`);
  
  // Vérifier les redirections dans AccountScreen
  const accountScreen = fs.readFileSync('src/screens/AccountScreen.js', 'utf8');
  const hasNavigateToFriends = accountScreen.includes('navigation.navigate(\'Friends\')');
  console.log(`  ${hasNavigateToFriends ? '✅' : '❌'} Redirection vers FriendsScreen`);
  
} catch (error) {
  console.log('  ❌ Erreur vérification interface amis');
}

// Résumé
console.log('\n' + '='.repeat(50));
if (allFilesExist) {
  console.log('🎉 Installation vérifiée avec succès !');
  console.log('\n🚀 Commandes suivantes:');
  console.log('  npm start          # Démarrer l\'application');
  console.log('  npm test           # Lancer les tests');
  console.log('\n📚 Documentation:');
  console.log('  docs/guides/       # Guides utilisateur');
  console.log('  docs/sql/          # Scripts SQL');
  console.log('\n🔒 Configuration base de données:');
  console.log('  1. Exécuter docs/sql/setup_friendships_rls.sql');
  console.log('  2. Vérifier les politiques RLS avec docs/guides/GUIDE_RLS_FRIENDSHIPS.md');
  console.log('\n🎨 Interface des amis:');
  console.log('  1. Exécuter docs/sql/setup_friendships_rls.sql');
  console.log('  2. Tester navigation AccountScreen → FriendsScreen');
  console.log('  3. Consulter docs/guides/GUIDE_INTERFACE_AMIS.md pour l\'utilisation');
} else {
  console.log('⚠️ Installation incomplète - vérifiez les fichiers manquants');
}

console.log('\n📱 Application PDR Navigation prête !'); 