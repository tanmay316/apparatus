import UIKit
import Capacitor

/// Capacitor 6+ only auto-registers plugins that ship as npm packages. Plugins that live in
/// the app target (the native workout GPS engine) must be registered here, otherwise
/// `Capacitor.isPluginAvailable('WorkoutLocation')` is false and every call rejects.
/// `patch-ios.cjs` points Main.storyboard at this class.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WorkoutLocationPlugin())
    }
}
