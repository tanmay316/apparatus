import Foundation
import CoreLocation

/// Production-grade iOS background location tracker.
///
/// Single Authoritative Source of Truth for GPS tracking, metric calculation,
/// durable journaling and state sync — the iOS counterpart of Android's
/// `WorkoutLocationService`. All distance/speed/elevation accumulation happens
/// here in native code (not in JavaScript), so metrics keep accruing correctly
/// while the app is backgrounded, the cardio screen is popped, or the screen is
/// locked. The WebView is only a renderer of state this class owns.
final class WorkoutLocationManager: NSObject, CLLocationManagerDelegate {

    static let shared = WorkoutLocationManager()

    // MARK: - Quality constants (mirrored 1:1 from the Android service)

    private let maxAcceptedAccuracyM: Double = 55.0
    private let gpsSettlingDurationMs: Double = 6000
    private let speedEmaAlpha: Double = 0.25
    private let speedEmaAlphaCautious: Double = 0.12
    private let movingStartSpeedKmh: Double = 2.5
    private let movingStopSpeedKmh: Double = 0.8
    private let consecutiveMovingSamplesNeeded = 3
    private let consecutiveStillSamplesNeeded = 5
    private let autoPauseTimeoutMs: Double = 8000
    private let minDistanceGateM: Double = 3.0

    // MARK: - Engine state

    private let locationManager = CLLocationManager()
    private let store = WorkoutLocationStore.shared
    private let kalman = GpsKalmanFilter()

    private var sessionSettleUntil: Double = 0
    private var emaSpeedKmh: Double = 0
    private var lastAcceptedLocation: CLLocation?
    private var lastRawLocation: CLLocation?
    private var isCurrentlyMoving = false
    private var consecutiveMovingSamples = 0
    private var consecutiveStillSamples = 0
    private var altBuffer: [Double] = []
    private var lastElevationAnchor: Double?
    private var lastMovementTimeMs: Double = 0

    /// Set by the Capacitor plugin so engine events can be forwarded to JS.
    var onLocation: (([String: Any]) -> Void)?
    var onStateChange: ((String) -> Void)?

    private override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        locationManager.distanceFilter = kCLDistanceFilterNone
        // Without this iOS silently suspends updates when it thinks you've stopped,
        // which would freeze distance mid-workout.
        locationManager.pausesLocationUpdatesAutomatically = false
        locationManager.activityType = .fitness
    }

    // MARK: - Permissions

    func requestPermissions(completion: @escaping (Bool) -> Void) {
        let status = locationManager.authorizationStatus
        switch status {
        case .notDetermined:
            // Ask for Always so tracking survives backgrounding; iOS shows the
            // provisional "keep only while using" prompt first either way.
            locationManager.requestAlwaysAuthorization()
            permissionCompletion = completion
        case .authorizedAlways, .authorizedWhenInUse:
            completion(true)
        default:
            completion(false)
        }
    }

    private var permissionCompletion: ((Bool) -> Void)?

    /// True when background location is actually usable (Always authorization).
    var hasAlwaysAuthorization: Bool {
        locationManager.authorizationStatus == .authorizedAlways
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        guard status != .notDetermined else { return }
        let granted = status == .authorizedAlways || status == .authorizedWhenInUse
        permissionCompletion?(granted)
        permissionCompletion = nil
        if granted { applyBackgroundCapability() }
    }

    /// `allowsBackgroundLocationUpdates` throws unless the app both has the
    /// `location` UIBackgroundMode and Always/WhenInUse authorization.
    private func applyBackgroundCapability() {
        let status = locationManager.authorizationStatus
        guard status == .authorizedAlways || status == .authorizedWhenInUse else { return }
        locationManager.allowsBackgroundLocationUpdates = true
        locationManager.showsBackgroundLocationIndicator = true
    }

    // MARK: - Session control

    func start(activityType: String, reset: Bool) {
        var session = store.loadSession()
        let nowMs = Date().timeIntervalSince1970 * 1000

        if reset || session.startedAt <= 0 {
            store.beginNewSession()
            session = WorkoutLocationStore.Session()
            session.startedAt = nowMs
            resetEngineState()
            sessionSettleUntil = nowMs + gpsSettlingDurationMs
        } else if session.state == .paused {
            // Resuming: fold the paused window into totalPausedMs so elapsed
            // time excludes it, exactly like Android does.
            if session.pausedAt > 0 {
                session.totalPausedMs += nowMs - session.pausedAt
            }
            session.pausedAt = 0
            restoreEngineState(from: session)
        } else {
            restoreEngineState(from: session)
        }

        session.activityType = activityType
        session.state = .tracking
        store.saveSession(session)

        locationManager.activityType = (activityType == "cycle") ? .otherNavigation : .fitness
        applyBackgroundCapability()
        locationManager.startUpdatingLocation()
        // Significant-change updates act as a safety net: if iOS ever suspends
        // the app despite the location background mode, this relaunches it.
        locationManager.startMonitoringSignificantLocationChanges()

        onStateChange?(WorkoutLocationStore.State.tracking.rawValue)
    }

    func pause() {
        var session = store.loadSession()
        guard session.state == .tracking else { return }
        session.state = .paused
        session.pausedAt = Date().timeIntervalSince1970 * 1000
        session.currentSpeedKmh = 0
        store.saveSession(session)

        locationManager.stopUpdatingLocation()
        emaSpeedKmh = 0
        isCurrentlyMoving = false
        consecutiveMovingSamples = 0
        consecutiveStillSamples = 0
        onStateChange?(WorkoutLocationStore.State.paused.rawValue)
    }

    func resume() {
        var session = store.loadSession()
        guard session.state == .paused else { return }
        let nowMs = Date().timeIntervalSince1970 * 1000
        if session.pausedAt > 0 {
            session.totalPausedMs += nowMs - session.pausedAt
        }
        session.pausedAt = 0
        session.state = .tracking
        store.saveSession(session)

        // Re-settle briefly so the first post-resume fixes don't inject a jump.
        sessionSettleUntil = nowMs + gpsSettlingDurationMs
        lastAcceptedLocation = nil
        lastRawLocation = nil
        kalman.reset()

        applyBackgroundCapability()
        locationManager.startUpdatingLocation()
        onStateChange?(WorkoutLocationStore.State.tracking.rawValue)
    }

    func stop() {
        var session = store.loadSession()
        session.state = .stopped
        session.currentSpeedKmh = 0
        store.saveSession(session)

        locationManager.stopUpdatingLocation()
        locationManager.stopMonitoringSignificantLocationChanges()
        locationManager.showsBackgroundLocationIndicator = false
        locationManager.allowsBackgroundLocationUpdates = false
        onStateChange?(WorkoutLocationStore.State.stopped.rawValue)
    }

    func sessionSummary() -> [String: Any] {
        let s = store.loadSession()
        return [
            "state": s.state.rawValue,
            "activityType": s.activityType,
            "startedAt": s.startedAt,
            "pausedAt": s.pausedAt,
            "totalPausedMs": s.totalPausedMs,
            "movingDurationSec": s.movingDurationSec,
            "distanceMeters": s.distanceMeters,
            "currentSpeedKmh": s.currentSpeedKmh,
            "maxSpeedKmh": s.maxSpeedKmh,
            "elevationGainM": s.elevationGainM,
            "lastLat": s.lastLat as Any,
            "lastLng": s.lastLng as Any,
            "lastAlt": s.lastAlt as Any,
            "lastBearing": s.lastBearing as Any,
            "lastAccuracy": s.lastAccuracy,
            "lastTimestamp": s.lastTimestamp,
            "pointCount": store.pointCount()
        ]
    }

    // MARK: - CLLocationManagerDelegate

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for location in locations {
            handleNewLocation(location)
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Transient CoreLocation errors are expected (tunnels, indoors). Keep the
        // session alive; the next good fix resumes accumulation.
        NSLog("[WorkoutLocation] location error: \(error.localizedDescription)")
    }

    // MARK: - Metric engine

    private func handleNewLocation(_ location: CLLocation) {
        var session = store.loadSession()
        guard session.state == .tracking else { return }

        let lat = location.coordinate.latitude
        let lng = location.coordinate.longitude

        // 1. Quality gate: coordinate validity
        if lat.isNaN || lng.isNaN || (lat == 0 && lng == 0) || abs(lat) > 90 || abs(lng) > 180 {
            return
        }

        let timeMs = location.timestamp.timeIntervalSince1970 * 1000

        // 2. Quality gate: timestamp monotonicity
        if session.lastTimestamp > 0 && timeMs <= session.lastTimestamp {
            return
        }

        // 3. Quality gate: strict accuracy limit (negative = invalid fix on iOS)
        let accuracy = location.horizontalAccuracy
        if accuracy < 0 || accuracy > maxAcceptedAccuracyM {
            return
        }

        let isSettling = sessionSettleUntil > 0 && timeMs < sessionSettleUntil

        // ─── Kalman smoothing of raw coordinates ───
        let smoothed = kalman.process(
            measLat: lat,
            measLng: lng,
            accuracyM: accuracy,
            timeMs: timeMs,
            isStationary: !isCurrentlyMoving
        )
        let smoothedLoc = CLLocation(
            coordinate: CLLocationCoordinate2D(latitude: smoothed.lat, longitude: smoothed.lng),
            altitude: location.altitude,
            horizontalAccuracy: accuracy,
            verticalAccuracy: location.verticalAccuracy,
            course: location.course,
            speed: location.speed,
            timestamp: location.timestamp
        )

        // Hardware Doppler speed — independent of coordinate jitter.
        var nativeSpeedKmh: Double = -1
        var hasHighConfidenceSpeed = false
        var rawDopplerKmh: Double = -1
        if location.speed >= 0 {
            rawDopplerKmh = location.speed * 3.6
            if location.speedAccuracy >= 0 {
                hasHighConfidenceSpeed = location.speedAccuracy <= 1.5
            } else {
                hasHighConfidenceSpeed = accuracy <= 20.0
            }
            if hasHighConfidenceSpeed {
                nativeSpeedKmh = rawDopplerKmh < 2.0 ? 0 : rawDopplerKmh
            }
        }

        var distanceMeters = session.distanceMeters
        var movingDurationSec = session.movingDurationSec
        var maxSpeedKmh = session.maxSpeedKmh
        var elevationGainM = session.elevationGainM

        var isAccepted = false
        var currentSpeedKmh: Double = 0
        var isMoving = false

        var smoothedDeltaDistanceM: Double = 0
        var rawDtSec: Double = 1
        if let lastRaw = lastRawLocation {
            smoothedDeltaDistanceM = lastRaw.distance(from: smoothedLoc)
            rawDtSec = max(0.1, (timeMs - lastRaw.timestamp.timeIntervalSince1970 * 1000) / 1000)
        }

        if let lastAccepted = lastAcceptedLocation {
            let deltaDistanceM = lastAccepted.distance(from: smoothedLoc)
            let dtSec = max(0.1, (timeMs - lastAccepted.timestamp.timeIntervalSince1970 * 1000) / 1000)
            let derivedSpeedKmh = (smoothedDeltaDistanceM / rawDtSec) * 3.6

            // Spike detection: validate gradual acceleration/deceleration.
            let maxAllowedDeltaSpeedKmh = max(30.0, emaSpeedKmh * 0.8 + 25.0) * min(3.0, rawDtSec)
            let isSuddenSpike = abs(derivedSpeedKmh - emaSpeedKmh) > maxAllowedDeltaSpeedKmh && smoothedDeltaDistanceM > 20.0
            let isAbsurdTeleport = derivedSpeedKmh > 180.0

            if (isSuddenSpike && !hasHighConfidenceSpeed) || isAbsurdTeleport {
                persistAndBroadcast(
                    session: &session, loc: smoothedLoc, accuracy: accuracy,
                    distanceMeters: distanceMeters, movingDurationSec: movingDurationSec,
                    currentSpeedKmh: 0, maxSpeedKmh: maxSpeedKmh, elevationGainM: elevationGainM,
                    isMoving: false, isAccepted: false, isAutoPaused: true, timeMs: timeMs
                )
                return
            }

            // ─── Speed estimation with Doppler cross-check ───
            var candidateSpeedKmh: Double
            if nativeSpeedKmh >= 2.0 {
                candidateSpeedKmh = nativeSpeedKmh
            } else if rawDopplerKmh >= 0 && rawDopplerKmh < 2.0 && derivedSpeedKmh > 4.0 {
                // Doppler says nearly stopped but position says fast → coordinate jitter.
                candidateSpeedKmh = 0
            } else if consecutiveStillSamples > 0 || !isCurrentlyMoving {
                candidateSpeedKmh = min(derivedSpeedKmh, 1.5)
            } else {
                candidateSpeedKmh = derivedSpeedKmh
            }

            if isSettling { candidateSpeedKmh = 0 }

            let alpha = isCurrentlyMoving ? speedEmaAlpha : speedEmaAlphaCautious
            if candidateSpeedKmh < 0.8 && smoothedDeltaDistanceM < 1.5 {
                emaSpeedKmh = (1 - speedEmaAlpha) * emaSpeedKmh
                if emaSpeedKmh < 0.3 { emaSpeedKmh = 0 }
            } else if emaSpeedKmh == 0 {
                emaSpeedKmh = candidateSpeedKmh
            } else {
                emaSpeedKmh = (alpha * candidateSpeedKmh) + ((1 - alpha) * emaSpeedKmh)
            }

            var dynamicNoiseThreshold = max(5.0, accuracy * 0.40)
            if nativeSpeedKmh >= 2.5 { dynamicNoiseThreshold = 0 }

            // ─── Hysteresis-based movement detection ───
            var sampleLooksMoving = false
            if !isSettling {
                let hasSpeedEvidence = (emaSpeedKmh >= (isCurrentlyMoving ? movingStopSpeedKmh : movingStartSpeedKmh))
                    || (nativeSpeedKmh >= (isCurrentlyMoving ? 1.5 : 2.5))
                let dopplerContradictsMovement = rawDopplerKmh >= 0 && rawDopplerKmh < 1.5
                let hasSpatialEvidence = (deltaDistanceM >= dynamicNoiseThreshold)
                    && dynamicNoiseThreshold > 0
                    && !dopplerContradictsMovement
                sampleLooksMoving = hasSpeedEvidence || hasSpatialEvidence
            }

            if isCurrentlyMoving {
                if sampleLooksMoving {
                    consecutiveStillSamples = 0
                    currentSpeedKmh = emaSpeedKmh > 0.5 ? emaSpeedKmh : max(derivedSpeedKmh, 0.5)
                } else {
                    consecutiveStillSamples += 1
                    if consecutiveStillSamples >= consecutiveStillSamplesNeeded {
                        isCurrentlyMoving = false
                        consecutiveMovingSamples = 0
                        currentSpeedKmh = 0
                        emaSpeedKmh = 0
                    } else {
                        currentSpeedKmh = emaSpeedKmh > 0.3 ? emaSpeedKmh : 0
                    }
                }
            } else {
                if sampleLooksMoving {
                    consecutiveMovingSamples += 1
                    if consecutiveMovingSamples >= consecutiveMovingSamplesNeeded {
                        isCurrentlyMoving = true
                        consecutiveStillSamples = 0
                        currentSpeedKmh = emaSpeedKmh > 0.5 ? emaSpeedKmh : max(derivedSpeedKmh, 0.5)
                    } else {
                        currentSpeedKmh = 0
                    }
                } else {
                    consecutiveMovingSamples = 0
                    currentSpeedKmh = 0
                }
            }

            isMoving = isCurrentlyMoving

            let minDistGate = isMoving ? max(minDistanceGateM, accuracy * 0.25) : dynamicNoiseThreshold
            let movementConfirmed = !isSettling && isMoving && (deltaDistanceM >= minDistGate)

            if movementConfirmed {
                isAccepted = true
                distanceMeters += deltaDistanceM
                lastAcceptedLocation = smoothedLoc

                if dtSec < 60 {
                    movingDurationSec += dtSec.rounded()
                }

                if location.verticalAccuracy >= 0 {
                    let smoothedAlt = smoothAltitude(location.altitude)
                    if let anchor = lastElevationAnchor {
                        let altDiff = smoothedAlt - anchor
                        if altDiff >= 1.5 && altDiff < 80.0 {
                            elevationGainM += altDiff
                            lastElevationAnchor = smoothedAlt
                        } else if altDiff <= -1.5 && altDiff > -80.0 {
                            lastElevationAnchor = smoothedAlt
                        }
                    } else {
                        lastElevationAnchor = smoothedAlt
                    }
                }
            } else if isSettling {
                lastAcceptedLocation = smoothedLoc
                if location.verticalAccuracy >= 0 {
                    lastElevationAnchor = smoothAltitude(location.altitude)
                }
            }

            if currentSpeedKmh > 2.0 && currentSpeedKmh <= 180.0 {
                maxSpeedKmh = max(maxSpeedKmh, currentSpeedKmh)
            }
        } else {
            // First accepted location of the session
            isAccepted = true
            lastAcceptedLocation = smoothedLoc
            if nativeSpeedKmh >= 2.0 {
                emaSpeedKmh = nativeSpeedKmh
                currentSpeedKmh = emaSpeedKmh
                isCurrentlyMoving = true
            } else {
                emaSpeedKmh = 0
                currentSpeedKmh = 0
                isCurrentlyMoving = false
            }
            isMoving = isCurrentlyMoving
            if location.verticalAccuracy >= 0 {
                lastElevationAnchor = smoothAltitude(location.altitude)
            }
        }

        lastRawLocation = smoothedLoc

        if isMoving {
            lastMovementTimeMs = timeMs
            sessionSettleUntil = 0
        } else if lastMovementTimeMs == 0 {
            lastMovementTimeMs = timeMs
        }

        let isAutoPaused = !isMoving && (timeMs - lastMovementTimeMs >= autoPauseTimeoutMs)

        session.distanceMeters = distanceMeters
        session.movingDurationSec = movingDurationSec
        session.maxSpeedKmh = maxSpeedKmh
        session.elevationGainM = elevationGainM

        persistAndBroadcast(
            session: &session, loc: smoothedLoc, accuracy: accuracy,
            distanceMeters: distanceMeters, movingDurationSec: movingDurationSec,
            currentSpeedKmh: currentSpeedKmh, maxSpeedKmh: maxSpeedKmh,
            elevationGainM: elevationGainM, isMoving: isMoving,
            isAccepted: isAccepted, isAutoPaused: isAutoPaused, timeMs: timeMs
        )
    }

    private func persistAndBroadcast(
        session: inout WorkoutLocationStore.Session,
        loc: CLLocation,
        accuracy: Double,
        distanceMeters: Double,
        movingDurationSec: Double,
        currentSpeedKmh: Double,
        maxSpeedKmh: Double,
        elevationGainM: Double,
        isMoving: Bool,
        isAccepted: Bool,
        isAutoPaused: Bool,
        timeMs: Double
    ) {
        let point = pointPayload(
            loc: loc, accuracy: accuracy, distanceMeters: distanceMeters,
            movingDurationSec: movingDurationSec, currentSpeedKmh: currentSpeedKmh,
            maxSpeedKmh: maxSpeedKmh, elevationGainM: elevationGainM,
            isMoving: isMoving, isAccepted: isAccepted, isAutoPaused: isAutoPaused,
            timeMs: timeMs
        )

        // Only accepted route points go to the durable journal.
        if isAccepted { store.append(point) }

        session.lastLat = loc.coordinate.latitude
        session.lastLng = loc.coordinate.longitude
        session.lastAccuracy = accuracy
        session.lastTimestamp = timeMs
        session.currentSpeedKmh = currentSpeedKmh
        session.distanceMeters = distanceMeters
        session.movingDurationSec = movingDurationSec
        session.maxSpeedKmh = maxSpeedKmh
        session.elevationGainM = elevationGainM
        if loc.verticalAccuracy >= 0 { session.lastAlt = loc.altitude }
        if loc.course >= 0 { session.lastBearing = loc.course }
        store.saveSession(session)

        onLocation?(point)
    }

    private func pointPayload(
        loc: CLLocation,
        accuracy: Double,
        distanceMeters: Double,
        movingDurationSec: Double,
        currentSpeedKmh: Double,
        maxSpeedKmh: Double,
        elevationGainM: Double,
        isMoving: Bool,
        isAccepted: Bool,
        isAutoPaused: Bool,
        timeMs: Double
    ) -> [String: Any] {
        var point: [String: Any] = [
            "lat": loc.coordinate.latitude,
            "lng": loc.coordinate.longitude,
            "accuracy": accuracy,
            "timestamp": timeMs,
            "distanceMeters": distanceMeters,
            "movingDurationSec": movingDurationSec,
            "currentSpeedKmh": currentSpeedKmh,
            "maxSpeedKmh": maxSpeedKmh,
            "elevationGainM": elevationGainM,
            "isMoving": isMoving,
            "isAccepted": isAccepted,
            "isAutoPaused": isAutoPaused
        ]
        point["speed"] = loc.speed >= 0 ? loc.speed : NSNull()
        point["speedAccuracy"] = loc.speedAccuracy >= 0 ? loc.speedAccuracy : NSNull()
        point["altitude"] = loc.verticalAccuracy >= 0 ? loc.altitude : NSNull()
        point["verticalAccuracy"] = loc.verticalAccuracy >= 0 ? loc.verticalAccuracy : NSNull()
        point["bearing"] = loc.course >= 0 ? loc.course : NSNull()
        if #available(iOS 13.4, *) {
            point["bearingAccuracy"] = loc.courseAccuracy >= 0 ? loc.courseAccuracy : NSNull()
        } else {
            point["bearingAccuracy"] = NSNull()
        }
        return point
    }

    /// Median-of-5 filter, matching the Android altitude smoothing window.
    private func smoothAltitude(_ altitude: Double) -> Double {
        altBuffer.append(altitude)
        if altBuffer.count > 5 { altBuffer.removeFirst() }
        let sorted = altBuffer.sorted()
        return sorted[sorted.count / 2]
    }

    private func resetEngineState() {
        emaSpeedKmh = 0
        lastAcceptedLocation = nil
        lastRawLocation = nil
        isCurrentlyMoving = false
        consecutiveMovingSamples = 0
        consecutiveStillSamples = 0
        altBuffer.removeAll()
        lastElevationAnchor = nil
        lastMovementTimeMs = 0
        kalman.reset()
    }

    private func restoreEngineState(from session: WorkoutLocationStore.Session) {
        // Rebuild just enough in-memory context to continue accumulating without
        // injecting a phantom jump from the pre-restart position.
        resetEngineState()
        sessionSettleUntil = Date().timeIntervalSince1970 * 1000 + gpsSettlingDurationMs
    }
}
