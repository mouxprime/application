const { withInfoPlist } = require('@expo/config-plugins');

/**
 * Plugin Expo pour configurer les permissions iOS nécessaires à CMPedometer
 */
function withExpoNativePedometer(config) {
  return withInfoPlist(config, (config) => {
    // Ajout des permissions pour CMPedometer
    config.modResults.NSMotionUsageDescription = 
      config.modResults.NSMotionUsageDescription || 
      'Cette application utilise les données de mouvement pour calculer la longueur de vos pas et améliorer la précision du suivi de distance.';
    
    return config;
  });
}

module.exports = withExpoNativePedometer; 