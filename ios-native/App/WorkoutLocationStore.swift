import Foundation

/// Durable session state + route point journal.
///
/// iOS equivalent of Android's `SharedPreferences` session record plus the
/// `WorkoutLocationDatabase` SQLite points table. Session scalars live in
/// `UserDefaults`; route points are appended to a JSON-Lines file so a long
/// workout never has to be held entirely in memory and survives process death.
final class WorkoutLocationStore {

    enum State: String {
        case idle = "IDLE"
        case tracking = "TRACKING"
        case paused = "PAUSED"
        case stopped = "STOPPED"
    }

    struct Session {
        var state: State = .idle
        var activityType: String = "walk"
        var startedAt: Double = 0
        var pausedAt: Double = 0
        var totalPausedMs: Double = 0
        var movingDurationSec: Double = 0
        var distanceMeters: Double = 0
        var currentSpeedKmh: Double = 0
        var maxSpeedKmh: Double = 0
        var elevationGainM: Double = 0
        var lastLat: Double? = nil
        var lastLng: Double? = nil
        var lastAlt: Double? = nil
        var lastBearing: Double? = nil
        var lastAccuracy: Double = 0
        var lastTimestamp: Double = 0
    }

    static let shared = WorkoutLocationStore()

    private let defaults = UserDefaults.standard
    private let prefix = "workout_location_session."
    private let queue = DispatchQueue(label: "com.tms.apparatus.workoutlocation.store")

    private lazy var pointsURL: URL = {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("workout_locations.jsonl")
    }()

    // In-memory mirror of the on-disk journal. Kept in sync on every append so
    // reads (summary/downsample) never hit the filesystem mid-workout.
    private var points: [[String: Any]] = []

    private init() {
        loadPointsFromDisk()
    }

    // MARK: - Session state

    func loadSession() -> Session {
        var s = Session()
        s.state = State(rawValue: defaults.string(forKey: prefix + "state") ?? "IDLE") ?? .idle
        s.activityType = defaults.string(forKey: prefix + "activity_type") ?? "walk"
        s.startedAt = defaults.double(forKey: prefix + "started_at")
        s.pausedAt = defaults.double(forKey: prefix + "paused_at")
        s.totalPausedMs = defaults.double(forKey: prefix + "total_paused_ms")
        s.movingDurationSec = defaults.double(forKey: prefix + "moving_duration_sec")
        s.distanceMeters = defaults.double(forKey: prefix + "distance_meters")
        s.currentSpeedKmh = defaults.double(forKey: prefix + "current_speed_kmh")
        s.maxSpeedKmh = defaults.double(forKey: prefix + "max_speed_kmh")
        s.elevationGainM = defaults.double(forKey: prefix + "elevation_gain_m")
        s.lastLat = defaults.object(forKey: prefix + "last_lat") as? Double
        s.lastLng = defaults.object(forKey: prefix + "last_lng") as? Double
        s.lastAlt = defaults.object(forKey: prefix + "last_alt") as? Double
        s.lastBearing = defaults.object(forKey: prefix + "last_bearing") as? Double
        s.lastAccuracy = defaults.double(forKey: prefix + "last_accuracy")
        s.lastTimestamp = defaults.double(forKey: prefix + "last_timestamp")
        return s
    }

    func saveSession(_ s: Session) {
        defaults.set(s.state.rawValue, forKey: prefix + "state")
        defaults.set(s.activityType, forKey: prefix + "activity_type")
        defaults.set(s.startedAt, forKey: prefix + "started_at")
        defaults.set(s.pausedAt, forKey: prefix + "paused_at")
        defaults.set(s.totalPausedMs, forKey: prefix + "total_paused_ms")
        defaults.set(s.movingDurationSec, forKey: prefix + "moving_duration_sec")
        defaults.set(s.distanceMeters, forKey: prefix + "distance_meters")
        defaults.set(s.currentSpeedKmh, forKey: prefix + "current_speed_kmh")
        defaults.set(s.maxSpeedKmh, forKey: prefix + "max_speed_kmh")
        defaults.set(s.elevationGainM, forKey: prefix + "elevation_gain_m")
        if let v = s.lastLat { defaults.set(v, forKey: prefix + "last_lat") }
        if let v = s.lastLng { defaults.set(v, forKey: prefix + "last_lng") }
        if let v = s.lastAlt { defaults.set(v, forKey: prefix + "last_alt") }
        if let v = s.lastBearing { defaults.set(v, forKey: prefix + "last_bearing") }
        defaults.set(s.lastAccuracy, forKey: prefix + "last_accuracy")
        defaults.set(s.lastTimestamp, forKey: prefix + "last_timestamp")
    }

    // MARK: - Route points

    func beginNewSession() {
        queue.sync {
            points.removeAll()
            try? FileManager.default.removeItem(at: pointsURL)
            FileManager.default.createFile(atPath: pointsURL.path, contents: nil)
        }
    }

    func append(_ point: [String: Any]) {
        queue.sync {
            points.append(point)
            guard
                let data = try? JSONSerialization.data(withJSONObject: point),
                var line = String(data: data, encoding: .utf8)
            else { return }
            line += "\n"
            guard let lineData = line.data(using: .utf8) else { return }

            if let handle = try? FileHandle(forWritingTo: pointsURL) {
                defer { try? handle.close() }
                _ = try? handle.seekToEnd()
                try? handle.write(contentsOf: lineData)
            } else {
                try? lineData.write(to: pointsURL)
            }
        }
    }

    func allPoints() -> [[String: Any]] {
        queue.sync { points }
    }

    func pointCount() -> Int {
        queue.sync { points.count }
    }

    func pointsAfter(timestamp: Double) -> [[String: Any]] {
        queue.sync {
            points.filter { ($0["timestamp"] as? Double ?? 0) > timestamp }
        }
    }

    /// Evenly sampled subset that always retains the first and last fix, so the
    /// rendered route keeps its true start/end even when heavily downsampled.
    func downsampledPoints(maxPoints: Int) -> [[String: Any]] {
        queue.sync {
            let total = points.count
            guard maxPoints > 0, total > maxPoints else { return points }
            if maxPoints == 1 { return [points[total - 1]] }

            var result: [[String: Any]] = []
            let step = Double(total - 1) / Double(maxPoints - 1)
            for i in 0..<maxPoints {
                let idx = Int((Double(i) * step).rounded())
                result.append(points[min(idx, total - 1)])
            }
            return result
        }
    }

    private func loadPointsFromDisk() {
        guard
            let content = try? String(contentsOf: pointsURL, encoding: .utf8)
        else { return }

        points = content
            .split(separator: "\n")
            .compactMap { line in
                guard
                    let data = line.data(using: .utf8),
                    let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                else { return nil }
                return obj
            }
    }
}
