import AppKit
import PokerCore
import SwiftUI

@main
struct PokerCalculatorApp: App {
    @NSApplicationDelegateAdaptor(ApplicationDelegate.self) private var delegate
    @State private var model = DashboardModel()

    var body: some Scene {
        Window("PokerCalculator", id: "calculator") {
            DashboardView(model: model)
                .background(WindowConnection(model: model))
                .frame(minWidth: DashboardLayout.minimumWidth, minHeight: DashboardLayout.minimumHeight)
        }
        .defaultSize(width: DashboardLayout.defaultWidth, height: DashboardLayout.defaultHeight)
        .windowResizability(.contentMinSize)
        .commands {
            CalculatorCommands(model: model)
        }
    }
}

private struct CalculatorCommands: Commands {
    @Bindable var model: DashboardModel

    var body: some Commands {
        let language = model.language
        CommandGroup(replacing: .newItem) {
            Button(language.text(.newHandMenu)) { model.newHand() }
                .keyboardShortcut("n", modifiers: .command)
        }
        CommandMenu(language.text(.calculatorMenu)) {
            Button(language.text(.focusPot)) { model.focus(.pot) }
                .keyboardShortcut("1", modifiers: .command)
            Button(language.text(.focusStack)) { model.focus(.stack) }
                .keyboardShortcut("2", modifiers: .command)
            Button(language.text(.focusFacingBet)) { model.focus(.facingBet) }
                .keyboardShortcut("3", modifiers: .command)
            Divider()
            Toggle(language.text(.keepOnTop), isOn: $model.hand.isPinned)
                .keyboardShortcut("p", modifiers: [.command, .shift])
            Divider()
            Picker(language.text(.language), selection: $model.language) {
                ForEach(AppLanguage.allCases, id: \.self) { choice in
                    Text(choice.nativeName).tag(choice)
                }
            }
        }
        CommandGroup(replacing: .help) {
            Button(language.text(.assumptionsMenu)) { model.showAssumptions = true }
        }
    }
}

@MainActor
final class ApplicationDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}

enum DashboardLayout {
    static let minimumWidth: CGFloat = 1060
    static let minimumHeight: CGFloat = 710
    static let defaultWidth: CGFloat = 1240
    static let defaultHeight: CGFloat = 784
}

struct WindowConnection: NSViewRepresentable {
    let model: DashboardModel

    func makeNSView(context: Context) -> WindowAttachment {
        let view = WindowAttachment()
        view.onAttach = { window in model.attach(window: window) }
        return view
    }

    func updateNSView(_ nsView: WindowAttachment, context: Context) {
        nsView.onAttach = { window in model.attach(window: window) }
        model.applyWindowLevel()
    }
}

final class WindowAttachment: NSView {
    var onAttach: ((NSWindow) -> Void)?

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if let window {
            onAttach?(window)
        }
    }
}
