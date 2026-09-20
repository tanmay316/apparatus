import Foundation

/// GPS Kalman Filter: constant-velocity model on lat/lng axes.
///
/// Direct port of `GpsKalmanFilter` from the Android `WorkoutLocationService`,
/// so iOS produces identical smoothing behaviour to Android. Smooths raw GPS
/// coordinates to eliminate jitter-derived phantom distance and speed. Process
/// noise is adaptive: near-zero when stationary (absorbs jitter), higher when
/// moving (tracks the real trajectory).
final class GpsKalmanFilter {
    private var initialized = false

    // Latitude axis state
    private var posLat: Double = 0, velLat: Double = 0
    private var ppLat: Double = 0, pvLat: Double = 0, vpLat: Double = 0, vvLat: Double = 0

    // Longitude axis state
    private var posLng: Double = 0, velLng: Double = 0
    private var ppLng: Double = 0, pvLng: Double = 0, vpLng: Double = 0, vvLng: Double = 0

    private var lastTimeMs: Double = 0

    func reset() {
        initialized = false
    }

    /// Process a raw GPS measurement and return Kalman-smoothed (lat, lng).
    /// - Parameter isStationary: true when the hysteresis engine considers the user still.
    func process(
        measLat: Double,
        measLng: Double,
        accuracyM: Double,
        timeMs: Double,
        isStationary: Bool
    ) -> (lat: Double, lng: Double) {
        // Convert horizontal accuracy (meters) → approximate variance (degrees²).
        // 1° latitude ≈ 111_320 m
        let accDeg = accuracyM / 111_320.0
        let R = accDeg * accDeg

        if !initialized {
            seed(measLat: measLat, measLng: measLng, R: R, timeMs: timeMs)
            initialized = true
            return (posLat, posLng)
        }

        let dt = max(0.1, (timeMs - lastTimeMs) / 1000.0)
        if dt > 30.0 {
            // Large gap (background wake) — reinitialize to avoid wild prediction.
            seed(measLat: measLat, measLng: measLng, R: R, timeMs: timeMs)
            return (posLat, posLng)
        }
        lastTimeMs = timeMs

        let qPos = isStationary ? 1e-14 : 5e-10
        let qVel = isStationary ? 1e-14 : 5e-9

        // ── Latitude axis ────────────────────────────────
        let predLat = posLat + velLat * dt
        let predPPLat = ppLat + dt * (pvLat + vpLat) + dt * dt * vvLat + qPos
        let predPVLat = pvLat + dt * vvLat
        let predVPLat = vpLat + dt * vvLat
        let predVVLat = vvLat + qVel

        let innovLat = measLat - predLat
        let sLat = predPPLat + R
        let k0Lat = predPPLat / sLat
        let k1Lat = predVPLat / sLat

        posLat = predLat + k0Lat * innovLat
        velLat = velLat + k1Lat * innovLat
        ppLat = (1 - k0Lat) * predPPLat
        pvLat = (1 - k0Lat) * predPVLat
        vpLat = predVPLat - k1Lat * predPPLat
        vvLat = predVVLat - k1Lat * predPVLat

        // ── Longitude axis ───────────────────────────────
        let predLng = posLng + velLng * dt
        let predPPLng = ppLng + dt * (pvLng + vpLng) + dt * dt * vvLng + qPos
        let predPVLng = pvLng + dt * vvLng
        let predVPLng = vpLng + dt * vvLng
        let predVVLng = vvLng + qVel

        let innovLng = measLng - predLng
        let sLng = predPPLng + R
        let k0Lng = predPPLng / sLng
        let k1Lng = predVPLng / sLng

        posLng = predLng + k0Lng * innovLng
        velLng = velLng + k1Lng * innovLng
        ppLng = (1 - k0Lng) * predPPLng
        pvLng = (1 - k0Lng) * predPVLng
        vpLng = predVPLng - k1Lng * predPPLng
        vvLng = predVVLng - k1Lng * predPVLng

        return (posLat, posLng)
    }

    private func seed(measLat: Double, measLng: Double, R: Double, timeMs: Double) {
        posLat = measLat; velLat = 0
        posLng = measLng; velLng = 0
        ppLat = R; ppLng = R
        pvLat = 0; pvLng = 0; vpLat = 0; vpLng = 0
        vvLat = R * 0.01; vvLng = R * 0.01
        lastTimeMs = timeMs
    }
}
