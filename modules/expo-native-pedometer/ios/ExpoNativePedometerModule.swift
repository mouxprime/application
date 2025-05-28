import ExpoModulesCore
import CoreMotion
import Foundation

public class ExpoNativePedometerModule: Module {
  // Gestionnaire CMPedometer
  private let pedometer = CMPedometer()
  
  // Variables de suivi
  private var isTracking = false
  private var lastStepCount: Int = 0
  private var lastTotalDistance: Double = 0.0
  private var startDate: Date?
  
  // Queue pour les opérations CMPedometer
  private let pedometerQueue = DispatchQueue(label: "com.ktapp.pedometer", qos: .userInitiated)
  
  public func definition() -> ModuleDefinition {
    Name("ExpoNativePedometerModule")
    
    // Événements émis vers JavaScript
    Events("onStepLengthUpdate")
    
    // Fonction pour vérifier la disponibilité de CMPedometer
    AsyncFunction("isAvailable") { () -> Bool in
      return CMPedometer.isStepCountingAvailable() && CMPedometer.isDistanceAvailable()
    }
    
    // Fonction pour démarrer le suivi des pas
    AsyncFunction("startStepLengthTracking") { [weak self] () -> Void in
      guard let self = self else { return }
      
      return try await withCheckedThrowingContinuation { continuation in
        self.pedometerQueue.async {
          do {
            try self.startTracking()
            DispatchQueue.main.async {
              continuation.resume()
            }
          } catch {
            DispatchQueue.main.async {
              continuation.resume(throwing: error)
            }
          }
        }
      }
    }
    
    // Fonction pour arrêter le suivi
    AsyncFunction("stopStepLengthTracking") { [weak self] () -> Void in
      guard let self = self else { return }
      self.stopTracking()
    }
    
    // Fonction pour obtenir le statut
    AsyncFunction("getStatus") { [weak self] () -> [String: Any] in
      guard let self = self else {
        return [
          "isAvailable": false,
          "isRunning": false,
          "hasPermissions": false
        ]
      }
      
      return [
        "isAvailable": CMPedometer.isStepCountingAvailable() && CMPedometer.isDistanceAvailable(),
        "isRunning": self.isTracking,
        "hasPermissions": CMPedometer.authorizationStatus() == .authorized
      ]
    }
    
    // Fonction pour remettre à zéro
    AsyncFunction("reset") { [weak self] () -> Void in
      guard let self = self else { return }
      self.resetCounters()
    }
  }
  
  // MARK: - Méthodes privées
  
  private func startTracking() throws {
    guard CMPedometer.isStepCountingAvailable() && CMPedometer.isDistanceAvailable() else {
      throw NSError(domain: "ExpoNativePedometer", code: 1, userInfo: [
        NSLocalizedDescriptionKey: "CMPedometer n'est pas disponible sur cet appareil"
      ])
    }
    
    guard !isTracking else {
      print("🍎 [NATIVE-PEDOMETER] Suivi déjà en cours")
      return
    }
    
    // Réinitialisation des compteurs
    resetCounters()
    
    // Date de début
    startDate = Date()
    isTracking = true
    
    print("🍎 [NATIVE-PEDOMETER] Démarrage CMPedometer.startUpdates...")
    
    // Démarrage du suivi CMPedometer
    pedometer.startUpdates(from: startDate!) { [weak self] (data, error) in
      guard let self = self else { return }
      
      if let error = error {
        print("❌ [NATIVE-PEDOMETER] Erreur CMPedometer: \(error.localizedDescription)")
        return
      }
      
      guard let data = data else {
        print("⚠️ [NATIVE-PEDOMETER] Données CMPedometer nulles")
        return
      }
      
      self.processPedometerData(data)
    }
    
    print("✅ [NATIVE-PEDOMETER] CMPedometer démarré avec succès")
  }
  
  private func stopTracking() {
    guard isTracking else { return }
    
    print("🛑 [NATIVE-PEDOMETER] Arrêt CMPedometer...")
    
    pedometer.stopUpdates()
    isTracking = false
    startDate = nil
    
    print("✅ [NATIVE-PEDOMETER] CMPedometer arrêté")
  }
  
  private func resetCounters() {
    lastStepCount = 0
    lastTotalDistance = 0.0
    print("🔄 [NATIVE-PEDOMETER] Compteurs remis à zéro")
  }
  
  private func processPedometerData(_ data: CMPedometerData) {
    let currentStepCount = data.numberOfSteps.intValue
    let currentTotalDistance = data.distance?.doubleValue ?? lastTotalDistance
    
    // Calcul des deltas
    let deltaSteps = currentStepCount - lastStepCount
    let deltaDistance = currentTotalDistance - lastTotalDistance
    
    print("🍎 [NATIVE-PEDOMETER] Données reçues:")
    print("  - Steps totaux: \(currentStepCount)")
    print("  - Distance totale: \(String(format: "%.3f", currentTotalDistance))m")
    print("  - Delta steps: \(deltaSteps)")
    print("  - Delta distance: \(String(format: "%.3f", deltaDistance))m")
    
    // Calcul de la longueur de pas instantanée
    var liveStride: Double = 0.0
    
    if deltaSteps > 0 {
      liveStride = deltaDistance / Double(max(deltaSteps, 1))
      print("  - Longueur de pas calculée: \(String(format: "%.3f", liveStride))m")
      
      // Validation de la longueur de pas (entre 0.3m et 1.5m)
      if liveStride < 0.3 || liveStride > 1.5 {
        print("⚠️ [NATIVE-PEDOMETER] Longueur de pas anormale: \(String(format: "%.3f", liveStride))m - ignorée")
        return
      }
      
      // Mise à jour des compteurs
      lastStepCount = currentStepCount
      lastTotalDistance = currentTotalDistance
      
      // Émission de l'événement vers JavaScript
      let eventData: [String: Any] = [
        "stepLength": liveStride,
        "totalSteps": currentStepCount,
        "totalDistance": currentTotalDistance,
        "timestamp": Date().timeIntervalSince1970 * 1000 // en millisecondes
      ]
      
      DispatchQueue.main.async { [weak self] in
        self?.sendEvent("onStepLengthUpdate", eventData)
      }
      
      print("📡 [NATIVE-PEDOMETER] Événement émis: stepLength=\(String(format: "%.3f", liveStride))m")
    } else {
      print("  - Aucun nouveau pas détecté")
    }
  }
} 