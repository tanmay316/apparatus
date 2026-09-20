import Foundation
import Capacitor

/// Capacitor bridge exposing the native iOS workout location engine to JavaScript.
///
/// Mirrors the JS surface of the Android `WorkoutLocationPlugin` exactly (same
/// plugin name, method names and payload shapes), so `src/utils/native-workout-location.ts`
/// works unchanged on both platforms.
@objc(WorkoutLocationPlugin)
public class WorkoutLocationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WorkoutLocationPlugin"
    public let jsName = "WorkoutLocation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSessionSummary", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDownsampledPoints", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLocationsAfter", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestBatteryOptimizationExemption", returnType: CAPPluginReturnPromise)
    ]

    private let manager = WorkoutLocationManager.shared
    private let store = WorkoutLocationStore.shared

    override public func load() {
        manager.onLocation = { [weak self] point in
            self?.notifyListeners("location", data: point)
        }
        manager.onStateChange = { [weak self] state in
            self?.notifyListeners("stateChange", data: ["state": state])
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        let reset = call.getBool("reset") ?? false
        let activityType = call.getString("activityType") ?? "walk"

        manager.requestPermissions { granted in
            guard granted else {
                call.reject("Location permission denied")
                return
            }
            DispatchQueue.main.async {
                self.manager.start(activityType: activityType, reset: reset)
                call.resolve()
            }
        }
    }

    @objc func pause(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.manager.pause()
            call.resolve()
        }
    }

    @objc func resume(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.manager.resume()
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.manager.stop()
            call.resolve()
        }
    }

    @objc func getSessionSummary(_ call: CAPPluginCall) {
        call.resolve(manager.sessionSummary())
    }

    @objc func getDownsampledPoints(_ call: CAPPluginCall) {
        let maxPoints = call.getInt("maxPoints") ?? 500
        call.resolve(["points": store.downsampledPoints(maxPoints: maxPoints)])
    }

    @objc func getLocationsAfter(_ call: CAPPluginCall) {
        let timestamp = call.getDouble("timestamp") ?? 0
        call.resolve(["points": store.pointsAfter(timestamp: timestamp)])
    }

    /// iOS has no user-facing battery optimization allowlist like Android's.
    /// Background location is governed purely by the Always authorization grant,
    /// so report exemption based on that to keep the JS flow identical.
    @objc func requestBatteryOptimizationExemption(_ call: CAPPluginCall) {
        call.resolve(["isExempt": manager.hasAlwaysAuthorization])
    }
}
