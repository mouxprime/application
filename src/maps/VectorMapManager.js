import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Gestionnaire de cartes vectorielles pour la localisation intérieure
 * Optimisé pour les environnements confinés comme les catacombes de Paris
 */
export class VectorMapManager {
  constructor() {
    this.currentMap = null;
    this.landmarks = [];
    this.walls = [];
    this.tunnels = [];
    this.scale = 100; // pixels par mètre
    this.bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }

  /**
   * Chargement d'une carte vectorielle
   */
  async loadMap(mapData) {
    try {
      if (typeof mapData === 'string') {
        // Si c'est un nom de carte prédéfinie
        this.currentMap = await this.loadPredefinedMap(mapData);
      } else {
        // Si c'est des données de carte directes
        this.currentMap = mapData;
      }

      if (this.currentMap) {
        this.processMapData();
        await this.saveMapToStorage();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Erreur lors du chargement de la carte:', error);
      return false;
    }
  }

  /**
   * Chargement d'une carte prédéfinie (exemple: catacombes de Paris)
   */
  async loadPredefinedMap(mapName) {
    const predefinedMaps = {
      'catacombes_paris': this.generateCatacombsMap(),
      'metro_tunnel': this.generateMetroTunnelMap(),
      'underground_cave': this.generateCaveMap()
    };

    return predefinedMaps[mapName] || null;
  }

  /**
   * Génération d'une carte des catacombes de Paris (exemple)
   */
  generateCatacombsMap() {
    return {
      name: 'Catacombes de Paris - Section XIV',
      description: 'Réseau de tunnels souterrains du XIVe arrondissement',
      scale: 100, // pixels par mètre
      bounds: { minX: -50, maxX: 50, minY: -50, maxY: 50 },
      
      // Murs et structure
      walls: [
        // Tunnel principal nord-sud
        { type: 'wall', points: [[-20, -40], [-20, 40]] },
        { type: 'wall', points: [[20, -40], [20, 40]] },
        { type: 'wall', points: [[-20, -40], [20, -40]] },
        { type: 'wall', points: [[-20, 40], [20, 40]] },
        
        // Tunnels transversaux
        { type: 'wall', points: [[-40, -10], [40, -10]] },
        { type: 'wall', points: [[-40, 10], [40, 10]] },
        { type: 'wall', points: [[-40, -12], [40, -12]] },
        { type: 'wall', points: [[-40, 12], [40, 12]] },
        
        // Chambres latérales
        { type: 'wall', points: [[-40, -10], [-40, 10]] },
        { type: 'wall', points: [[40, -10], [40, 10]] },
        
        // Piliers structurels
        { type: 'pillar', center: [0, 0], radius: 2 },
        { type: 'pillar', center: [-15, -20], radius: 1.5 },
        { type: 'pillar', center: [15, 20], radius: 1.5 },
      ],

      // Passages et tunnels navigables
      tunnels: [
        { 
          id: 'main_ns', 
          type: 'tunnel',
          points: [[-18, -38], [-18, 38], [18, 38], [18, -38]],
          width: 3.6,
          name: 'Galerie principale'
        },
        {
          id: 'cross_tunnel',
          type: 'tunnel', 
          points: [[-38, -8], [38, -8], [38, 8], [-38, 8]],
          width: 2.4,
          name: 'Galerie transversale'
        }
      ],

      // Points de repère
      landmarks: [
        {
          id: 'entrance',
          type: 'entrance',
          position: [0, -38],
          name: 'Entrée principale',
          description: 'Point d\'accès principal aux catacombes'
        },
        {
          id: 'intersection_1',
          type: 'intersection',
          position: [0, 0],
          name: 'Carrefour central',
          description: 'Intersection principale des galeries'
        },
        {
          id: 'chamber_west',
          type: 'chamber',
          position: [-30, 0],
          name: 'Chambre ouest',
          description: 'Salle d\'ossements'
        },
        {
          id: 'chamber_east',
          type: 'chamber',
          position: [30, 0],
          name: 'Chambre est',
          description: 'Salle de stockage'
        },
        {
          id: 'marker_1',
          type: 'marker',
          position: [0, -20],
          name: 'Repère 1',
          description: 'Plaque commémorative'
        },
        {
          id: 'marker_2',
          type: 'marker',
          position: [0, 20],
          name: 'Repère 2',
          description: 'Inscription historique'
        }
      ],

      // Zones dangereuses ou interdites
      hazards: [
        {
          type: 'restricted',
          area: [[-45, -45], [45, -45], [45, -35], [-45, -35]],
          name: 'Zone effondrée'
        }
      ],

      // Métadonnées pour la localisation
      localization: {
        magneticDeclination: 1.2, // déclinaison magnétique locale
        gridAlignment: 0,         // alignement de la grille
        referencePoints: [
          { position: [0, 0], realWorld: { lat: 48.8341, lon: 2.3324 } }
        ]
      }
    };
  }

  /**
   * Génération d'une carte de tunnel de métro
   */
  generateMetroTunnelMap() {
    return {
      name: 'Tunnel Métro Ligne 4',
      description: 'Section entre Châtelet et Saint-Germain',
      scale: 150,
      bounds: { minX: -100, maxX: 100, minY: -5, maxY: 5 },
      
      walls: [
        { type: 'wall', points: [[-100, -4], [100, -4]] },
        { type: 'wall', points: [[-100, 4], [100, 4]] }
      ],
      
      tunnels: [
        {
          id: 'main_tunnel',
          type: 'tunnel',
          points: [[-98, -2], [98, -2], [98, 2], [-98, 2]],
          width: 4,
          name: 'Tunnel principal'
        }
      ],
      
      landmarks: [
        { id: 'station_a', type: 'station', position: [-50, 0], name: 'Station A' },
        { id: 'station_b', type: 'station', position: [50, 0], name: 'Station B' },
        { id: 'service_tunnel', type: 'access', position: [0, 0], name: 'Accès technique' }
      ]
    };
  }

  /**
   * Génération d'une carte de grotte
   */
  generateCaveMap() {
    return {
      name: 'Grotte souterraine',
      description: 'Réseau de cavernes naturelles',
      scale: 80,
      bounds: { minX: -60, maxX: 60, minY: -40, maxY: 40 },
      
      walls: [
        // Forme organique de grotte
        { type: 'wall', points: this.generateOrganicWall(30, 8) }
      ],
      
      landmarks: [
        { id: 'entrance', type: 'entrance', position: [0, -35], name: 'Entrée' },
        { id: 'lake', type: 'water', position: [-20, 10], name: 'Lac souterrain' },
        { id: 'stalactites', type: 'formation', position: [25, -15], name: 'Formation calcaire' }
      ]
    };
  }

  /**
   * Génération de murs organiques pour les grottes
   */
  generateOrganicWall(radius, points) {
    const wall = [];
    for (let i = 0; i < points; i++) {
      const angle = (i / points) * 2 * Math.PI;
      const variation = 0.3 + Math.random() * 0.4; // Variation aléatoire
      const x = Math.cos(angle) * radius * variation;
      const y = Math.sin(angle) * radius * variation;
      wall.push([x, y]);
    }
    wall.push(wall[0]); // Fermer la forme
    return wall;
  }

  /**
   * Traitement des données de carte chargées
   */
  processMapData() {
    if (!this.currentMap) return;

    // Extraction des éléments
    this.walls = this.currentMap.walls || [];
    this.tunnels = this.currentMap.tunnels || [];
    this.landmarks = this.currentMap.landmarks || [];
    this.scale = this.currentMap.scale || 100;
    this.bounds = this.currentMap.bounds || { minX: -50, maxX: 50, minY: -50, maxY: 50 };

    // Calcul des limites automatiques si non définies
    if (!this.currentMap.bounds) {
      this.calculateBounds();
    }

    // Indexation spatiale pour la recherche rapide
    this.buildSpatialIndex();
  }

  /**
   * Calcul automatique des limites de la carte
   */
  calculateBounds() {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    [...this.walls, ...this.tunnels].forEach(element => {
      if (element.points) {
        element.points.forEach(point => {
          minX = Math.min(minX, point[0]);
          maxX = Math.max(maxX, point[0]);
          minY = Math.min(minY, point[1]);
          maxY = Math.max(maxY, point[1]);
        });
      }
    });

    this.landmarks.forEach(landmark => {
      if (landmark.position) {
        minX = Math.min(minX, landmark.position[0]);
        maxX = Math.max(maxX, landmark.position[0]);
        minY = Math.min(minY, landmark.position[1]);
        maxY = Math.max(maxY, landmark.position[1]);
      }
    });

    // Ajouter une marge
    const margin = 5;
    this.bounds = {
      minX: minX - margin,
      maxX: maxX + margin,
      minY: minY - margin,
      maxY: maxY + margin
    };
  }

  /**
   * Construction d'un index spatial pour la recherche rapide
   */
  buildSpatialIndex() {
    // Implémentation simplifiée d'un grid spatial
    this.spatialGrid = {};
    const gridSize = 10; // Taille de cellule de 10m

    this.landmarks.forEach(landmark => {
      const gridX = Math.floor(landmark.position[0] / gridSize);
      const gridY = Math.floor(landmark.position[1] / gridSize);
      const key = `${gridX},${gridY}`;
      
      if (!this.spatialGrid[key]) {
        this.spatialGrid[key] = [];
      }
      this.spatialGrid[key].push(landmark);
    });
  }

  /**
   * Recherche de landmarks proches d'une position
   */
  findNearbyLandmarks(position, radius = 5) {
    if (!position || !this.landmarks) return [];

    return this.landmarks.filter(landmark => {
      const distance = Math.sqrt(
        Math.pow(landmark.position[0] - position.x, 2) +
        Math.pow(landmark.position[1] - position.y, 2)
      );
      return distance <= radius;
    });
  }

  /**
   * Vérification de collision avec les murs
   */
  checkWallCollision(position, radius = 0.5) {
    // Implémentation simplifiée - à améliorer avec des algorithmes géométriques
    return this.walls.some(wall => {
      if (wall.type === 'pillar') {
        const distance = Math.sqrt(
          Math.pow(wall.center[0] - position.x, 2) +
          Math.pow(wall.center[1] - position.y, 2)
        );
        return distance <= (wall.radius + radius);
      }
      return false;
    });
  }

  /**
   * Conversion de coordonnées monde vers écran
   */
  worldToScreen(worldPos, screenDimensions) {
    const { width, height } = screenDimensions;
    const mapWidth = this.bounds.maxX - this.bounds.minX;
    const mapHeight = this.bounds.maxY - this.bounds.minY;
    
    const scaleX = width / mapWidth;
    const scaleY = height / mapHeight;
    const scale = Math.min(scaleX, scaleY);

    return {
      x: (worldPos.x - this.bounds.minX) * scale,
      y: height - (worldPos.y - this.bounds.minY) * scale // Inverser Y
    };
  }

  /**
   * Conversion de coordonnées écran vers monde
   */
  screenToWorld(screenPos, screenDimensions) {
    const { width, height } = screenDimensions;
    const mapWidth = this.bounds.maxX - this.bounds.minX;
    const mapHeight = this.bounds.maxY - this.bounds.minY;
    
    const scaleX = width / mapWidth;
    const scaleY = height / mapHeight;
    const scale = Math.min(scaleX, scaleY);

    return {
      x: this.bounds.minX + screenPos.x / scale,
      y: this.bounds.minY + (height - screenPos.y) / scale
    };
  }

  /**
   * Sauvegarde de la carte en local
   */
  async saveMapToStorage() {
    try {
      await AsyncStorage.setItem(
        'current_vector_map',
        JSON.stringify(this.currentMap)
      );
    } catch (error) {
      console.error('Erreur sauvegarde carte:', error);
    }
  }

  /**
   * Chargement de la carte depuis le stockage local
   */
  async loadMapFromStorage() {
    try {
      const mapData = await AsyncStorage.getItem('current_vector_map');
      if (mapData) {
        return this.loadMap(JSON.parse(mapData));
      }
    } catch (error) {
      console.error('Erreur chargement carte:', error);
    }
    return false;
  }

  /**
   * Obtenir les informations de la carte actuelle
   */
  getMapInfo() {
    return this.currentMap ? {
      name: this.currentMap.name,
      description: this.currentMap.description,
      bounds: this.bounds,
      scale: this.scale,
      landmarkCount: this.landmarks.length,
      wallCount: this.walls.length
    } : null;
  }
} 