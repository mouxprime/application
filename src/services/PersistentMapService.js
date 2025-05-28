import * as FileSystem from 'expo-file-system';

/**
 * Service de gestion de la carte persistante
 * ==========================================
 * 
 * Ce service gère un fichier SVG global qui accumule tous les trajets
 * de l'utilisateur pour construire progressivement une carte complète.
 */

export class PersistentMapService {
  constructor() {
    // Dimensions de la carte globale
    this.MAP_WIDTH = 14629;
    this.MAP_HEIGHT = 13764;
    this.SCALE = 3.72; // pixels par mètre
    
    // Chemin du fichier SVG persistant
    this.mapFilePath = `${FileSystem.documentDirectory}persistent_map.svg`;
    
    // Cache des trajets chargés
    this.loadedTrajectories = [];
    this.isInitialized = false;
  }

  /**
   * Initialiser la carte persistante
   */
  async initialize() {
    try {
      console.log('🗺️ [PERSISTENT-MAP] Initialisation de la carte persistante...');
      
      // Vérifier si le fichier existe
      const fileExists = await FileSystem.getInfoAsync(this.mapFilePath);
      
      if (!fileExists.exists) {
        console.log('🗺️ [PERSISTENT-MAP] Création d\'une nouvelle carte vierge');
        await this.createEmptyMap();
      } else {
        console.log('🗺️ [PERSISTENT-MAP] Chargement de la carte existante');
        await this.loadExistingMap();
      }
      
      this.isInitialized = true;
      console.log('✅ [PERSISTENT-MAP] Carte persistante initialisée');
      
    } catch (error) {
      console.error('❌ [PERSISTENT-MAP] Erreur initialisation:', error);
      throw error;
    }
  }

  /**
   * Créer une carte SVG vierge
   */
  async createEmptyMap() {
    const emptySvg = this.generateBaseSVG();
    await FileSystem.writeAsStringAsync(this.mapFilePath, emptySvg);
    this.loadedTrajectories = [];
  }

  /**
   * Charger la carte existante
   */
  async loadExistingMap() {
    try {
      const svgContent = await FileSystem.readAsStringAsync(this.mapFilePath);
      
      // Parser les trajets existants depuis le SVG
      this.loadedTrajectories = this.parseTrajectories(svgContent);
      
      console.log(`🗺️ [PERSISTENT-MAP] ${this.loadedTrajectories.length} trajets chargés`);
      
    } catch (error) {
      console.warn('⚠️ [PERSISTENT-MAP] Erreur lecture carte, création nouvelle:', error);
      await this.createEmptyMap();
    }
  }

  /**
   * Générer le SVG de base avec grille
   */
  generateBaseSVG() {
    const gridSpacing = 10; // mètres
    const gridSpacingPx = gridSpacing * this.SCALE; // pixels
    
    // Calculer les lignes de grille
    const numVerticalLines = Math.ceil(this.MAP_WIDTH / gridSpacingPx);
    const numHorizontalLines = Math.ceil(this.MAP_HEIGHT / gridSpacingPx);
    
    let gridLines = '';
    
    // Lignes verticales
    for (let i = 0; i <= numVerticalLines; i++) {
      const x = i * gridSpacingPx;
      gridLines += `<line x1="${x}" y1="0" x2="${x}" y2="${this.MAP_HEIGHT}" stroke="#333333" stroke-width="1" opacity="0.3" />\\n`;
    }
    
    // Lignes horizontales
    for (let i = 0; i <= numHorizontalLines; i++) {
      const y = i * gridSpacingPx;
      gridLines += `<line x1="0" y1="${y}" x2="${this.MAP_WIDTH}" y2="${y}" stroke="#333333" stroke-width="1" opacity="0.3" />\\n`;
    }
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${this.MAP_WIDTH}" height="${this.MAP_HEIGHT}" viewBox="0 0 ${this.MAP_WIDTH} ${this.MAP_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <!-- Fond noir -->
  <rect width="100%" height="100%" fill="#000000"/>
  
  <!-- Grille de référence -->
  <g id="grid" opacity="0.3">
    ${gridLines}
  </g>
  
  <!-- Bordure de la carte -->
  <rect x="0" y="0" width="${this.MAP_WIDTH}" height="${this.MAP_HEIGHT}" fill="none" stroke="#666666" stroke-width="2" opacity="0.8"/>
  
  <!-- Zone des trajets persistants -->
  <g id="persistent-trajectories">
    <!-- Les trajets seront ajoutés ici -->
  </g>
  
  <!-- Métadonnées -->
  <metadata>
    <created>${new Date().toISOString()}</created>
    <scale>${this.SCALE}</scale>
    <dimensions>${this.MAP_WIDTH}x${this.MAP_HEIGHT}</dimensions>
  </metadata>
</svg>`;
  }

  /**
   * Ajouter un nouveau trajet à la carte persistante
   */
  async addTrajectory(trajectory, metadata = {}) {
    try {
      console.log(`🗺️ [PERSISTENT-MAP] Ajout d'un nouveau trajet (${trajectory.length} points)`);
      
      if (!this.isInitialized) {
        await this.initialize();
      }
      
      // Générer l'ID unique du trajet
      const trajectoryId = `trajectory_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Convertir la trajectoire en coordonnées SVG
      const svgPath = this.trajectoryToSVGPath(trajectory);
      
      // Créer l'élément SVG du trajet
      const trajectoryElement = {
        id: trajectoryId,
        path: svgPath,
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString(),
          pointCount: trajectory.length,
          distance: this.calculateTrajectoryDistance(trajectory)
        }
      };
      
      // Ajouter au cache
      this.loadedTrajectories.push(trajectoryElement);
      
      // Sauvegarder dans le fichier
      await this.saveMapToFile();
      
      console.log(`✅ [PERSISTENT-MAP] Trajet ${trajectoryId} ajouté à la carte persistante`);
      
      return trajectoryId;
      
    } catch (error) {
      console.error('❌ [PERSISTENT-MAP] Erreur ajout trajet:', error);
      throw error;
    }
  }

  /**
   * Convertir une trajectoire en chemin SVG
   */
  trajectoryToSVGPath(trajectory) {
    if (!trajectory || trajectory.length === 0) return '';
    
    return trajectory.map((point, index) => {
      const svgPos = this.worldToSVG(point.x, point.y);
      return `${index === 0 ? 'M' : 'L'} ${svgPos.x.toFixed(2)} ${svgPos.y.toFixed(2)}`;
    }).join(' ');
  }

  /**
   * Convertir coordonnées monde vers SVG
   */
  worldToSVG(worldX, worldY) {
    const pixelX = worldX * this.SCALE;
    const pixelY = -worldY * this.SCALE; // Inversion Y pour SVG
    
    // Centre de la carte comme origine
    const centerX = this.MAP_WIDTH / 2;
    const centerY = this.MAP_HEIGHT / 2;
    
    return {
      x: centerX + pixelX,
      y: centerY + pixelY
    };
  }

  /**
   * Calculer la distance totale d'une trajectoire
   */
  calculateTrajectoryDistance(trajectory) {
    if (!trajectory || trajectory.length < 2) return 0;
    
    let totalDistance = 0;
    for (let i = 1; i < trajectory.length; i++) {
      const prev = trajectory[i - 1];
      const curr = trajectory[i];
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      totalDistance += Math.sqrt(dx * dx + dy * dy);
    }
    
    return totalDistance;
  }

  /**
   * Sauvegarder la carte dans le fichier
   */
  async saveMapToFile() {
    const svgContent = this.generateCompleteSVG();
    await FileSystem.writeAsStringAsync(this.mapFilePath, svgContent);
  }

  /**
   * Générer le SVG complet avec tous les trajets
   */
  generateCompleteSVG() {
    const baseSvg = this.generateBaseSVG();
    
    // Générer les trajets
    let trajectoriesContent = '';
    this.loadedTrajectories.forEach((traj, index) => {
      const color = this.getTrajectoryColor(index);
      trajectoriesContent += `
    <path id="${traj.id}" 
          d="${traj.path}" 
          stroke="${color}" 
          stroke-width="2" 
          fill="none" 
          opacity="0.8"
          data-timestamp="${traj.metadata.timestamp}"
          data-distance="${traj.metadata.distance.toFixed(2)}" />`;
    });
    
    // Insérer les trajets dans le SVG de base
    return baseSvg.replace(
      '<!-- Les trajets seront ajoutés ici -->',
      trajectoriesContent
    );
  }

  /**
   * Obtenir une couleur pour un trajet
   */
  getTrajectoryColor(index) {
    const colors = [
      '#00ff00', '#00ffff', '#ff00ff', '#ffff00', 
      '#ff8800', '#8800ff', '#00ff88', '#ff0088'
    ];
    return colors[index % colors.length];
  }

  /**
   * Parser les trajets depuis un SVG existant
   */
  parseTrajectories(svgContent) {
    // Implémentation simplifiée - dans un vrai projet, utiliser un parser XML
    const trajectories = [];
    const pathRegex = /<path[^>]*id="(trajectory_[^"]*)"[^>]*d="([^"]*)"[^>]*data-timestamp="([^"]*)"[^>]*data-distance="([^"]*)"[^>]*\/>/g;
    
    let match;
    while ((match = pathRegex.exec(svgContent)) !== null) {
      trajectories.push({
        id: match[1],
        path: match[2],
        metadata: {
          timestamp: match[3],
          distance: parseFloat(match[4])
        }
      });
    }
    
    return trajectories;
  }

  /**
   * Obtenir les statistiques de la carte
   */
  getMapStats() {
    const totalDistance = this.loadedTrajectories.reduce(
      (sum, traj) => sum + (traj.metadata.distance || 0), 0
    );
    
    return {
      trajectoryCount: this.loadedTrajectories.length,
      totalDistance: totalDistance,
      mapDimensions: {
        width: this.MAP_WIDTH,
        height: this.MAP_HEIGHT,
        worldWidth: this.MAP_WIDTH / this.SCALE,
        worldHeight: this.MAP_HEIGHT / this.SCALE
      },
      lastUpdate: this.loadedTrajectories.length > 0 
        ? this.loadedTrajectories[this.loadedTrajectories.length - 1].metadata.timestamp
        : null
    };
  }

  /**
   * Obtenir le contenu SVG pour affichage
   */
  async getSVGContent() {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    return this.generateCompleteSVG();
  }

  /**
   * Réinitialiser la carte (effacer tous les trajets)
   */
  async resetMap() {
    console.log('🗑️ [PERSISTENT-MAP] Réinitialisation de la carte');
    await this.createEmptyMap();
    console.log('✅ [PERSISTENT-MAP] Carte réinitialisée');
  }
} 