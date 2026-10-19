import Cocoa
import ApplicationServices

// Read-only discovery. Never calls AXPerformAction or changes another application.
func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success ? value : nil
}
func text(_ element: AXUIElement, _ name: String) -> String { attribute(element, name) as? String ?? "" }
func children(_ element: AXUIElement) -> [AXUIElement] { attribute(element, kAXChildrenAttribute) as? [AXUIElement] ?? [] }
func rect(_ element: AXUIElement) -> CGRect? {
    guard let p = attribute(element, kAXPositionAttribute), let s = attribute(element, kAXSizeAttribute),
          CFGetTypeID(p) == AXValueGetTypeID(), CFGetTypeID(s) == AXValueGetTypeID() else { return nil }
    var point = CGPoint.zero, size = CGSize.zero
    guard AXValueGetValue(p as! AXValue, .cgPoint, &point), AXValueGetValue(s as! AXValue, .cgSize, &size),
          size.width >= 16, size.height >= 16, size.width < 240, size.height < 200 else { return nil }
    return CGRect(origin: point, size: size)
}
var targets: [[String: Any]] = []
var visited = 0
let started = Date()
let permission = AXIsProcessTrusted()
if permission {
    let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
    let covers: [CGRect] = windows.compactMap { entry in
        guard entry[kCGWindowLayer as String] as? Int == 0,
              (entry[kCGWindowAlpha as String] as? Double ?? 1) > 0,
              let bounds = entry[kCGWindowBounds as String] as? NSDictionary,
              let r = CGRect(dictionaryRepresentation: bounds), r.width > 40, r.height > 40 else { return nil }
        return r
    }
    func walk(_ node: AXUIElement, _ kind: String, _ desktop: Bool, _ depth: Int) {
        visited += 1
        guard visited < 1600, depth < 10, Date().timeIntervalSince(started) < 1.2 else { return }
        let role = text(node, kAXRoleAttribute), subrole = text(node, kAXSubroleAttribute)
        let title = text(node, kAXTitleAttribute), description = text(node, kAXDescriptionAttribute)
        let isDesktop = desktop || subrole == "AXDesktop" || title == "Desktop" || title == "桌面" || description == "Desktop" || description == "桌面"
        let candidate = kind == "dock" ? subrole == "AXApplicationDockItem" : (role == "AXImage" || role == "AXButton")
        if candidate, let r = rect(node), !(kind == "desktop" && (r.width < 28 || r.height < 28 || r.midY < 30 || covers.contains { $0.contains(CGPoint(x: r.midX, y: r.midY)) })) {
            targets.append(["id": "\(kind):\(title.isEmpty ? description : title)", "kind": kind, "name": title.isEmpty ? description : title,
                            "bounds": ["x": r.minX, "y": r.minY, "width": r.width, "height": r.height]])
        }
        // Finder icons inside ordinary windows are filtered by the window-cover rectangles.
        for child in children(node) { walk(child, kind, isDesktop, depth + 1) }
    }
    for (bundle, kind) in [("com.apple.dock", "dock"), ("com.apple.finder", "desktop")] {
        if let application = NSRunningApplication.runningApplications(withBundleIdentifier: bundle).first {
            let root = AXUIElementCreateApplication(application.processIdentifier)
            AXUIElementSetMessagingTimeout(root, 0.15)
            walk(root, kind, false, 0)
        }
    }
}
let result: [String: Any] = ["status": permission ? "ready" : "permission-required", "targets": targets, "readOnly": true]
let data = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
FileHandle.standardOutput.write(data)
