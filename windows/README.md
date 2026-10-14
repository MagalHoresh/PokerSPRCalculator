# PokerCalculator for Windows

An offline, native WPF counterpart to the SwiftUI Mac app. It keeps the same
single-screen dashboard, large stable numbers, both complete paths to all-in,
four preflop targets, derived reference, one-decimal output, English/Hebrew
switching, and strict input rules. The Windows implementation is separate; it
does not replace or change the Mac app.

## Run and share

Download `PokerCalculator-Windows-x64.zip`, choose **Extract All** in File
Explorer, then open `PokerCalculator.exe` inside the extracted folder.
No installer, administrator privileges, Python, .NET installation, account, or
network connection is needed. The package contains its .NET runtime.

The x64 build targets **Windows 11 or Windows 10 22H2**, on Intel/AMD PCs.
Windows 11 is recommended. Windows on ARM can use x64 emulation; the build
script also accepts `win-arm64`, but that architecture needs separate device
verification.

This portable/local build is **unsigned**. SmartScreen may display an
unknown-publisher warning. Run only a trusted copy; do not disable Windows
security protections. Managed computers may prohibit unsigned applications.
There is no public release or automatic updater.

## Same workflow, native Windows controls

| Action | Windows control |
| --- | --- |
| Focus/select current pot, effective stack, facing size | Ctrl+1 / Ctrl+2 / Ctrl+3 |
| Move through input fields | Tab / Shift+Tab / Enter |
| Clear the hand | Ctrl+N / New hand |
| Keep on top | Ctrl+Shift+P / Keep on top |
| Read assumptions | F1 / Assumptions |
| Change language | EN / עב in the header |
| Copy an amount | Its copy button, never automatic |

English is the launch default. Switching language preserves the hand and pin
choice; New hand preserves language and pin. Hebrew text is right-to-left,
while numeric editing, percentages and clipboard strings remain left-to-right.
The decimal separator follows Windows number-format preferences, independently
of the language toggle. The app follows Windows light/dark and high-contrast
preferences. Native window chrome, Segoe UI typography and Ctrl shortcuts are
Windows-specific; the calculation semantics and content match the Mac app.

## Build and verify

Install the **.NET 10 SDK** for development, then run in PowerShell 7 on Windows:

```powershell
./windows/build.ps1 -Runtime win-x64 -VerifyUI
```

This runs the Swift-parity checks, publishes a self-contained release executable,
launches the real WPF app's diagnostic mode, and creates the shareable ZIP and
SHA-256 file under `windows/artifacts/`. The app-content PNGs and verification
report are saved separately; no desktop/poker/account windows are captured.
The diagnostic mode uses test input and the clipboard on its build runner, then
exits. Ordinary launches start empty and never copy anything automatically.

The core can be verified on macOS/Linux too:

```sh
dotnet run --project windows/PokerCalculator.Checks --configuration Release
```

`Strings.json` and `SwiftParity.json` are generated from the current 1.2.1 Swift
core, not independently translated or hand-entered approximations. The Windows
build uses these checked-in fixtures; it does not require Swift. To regenerate
them in a Mac checkout containing that core and its `AppLanguage.swift`:

```sh
xcrun swiftc Sources/PokerCore/*.swift scripts/export-windows-parity.swift \
  -o build/export-windows-parity
build/export-windows-parity
```

The checks compare 196 hands, every street's amount, 104 parsing cases, and
formatting edges directly against Swift results. They also cover stable
small-SPR arithmetic, huge/subnormal values, exact stack exhaustion, reset and
independent invalidation, localized errors, and all legacy multipliers.

The native WPF checks exercise real controls, command bindings, routed input
events, active-field language alignment, selection, copy, pin/reset, RTL and
light/dark layouts, complete numeric rendering and measured font sizes. They
render only the app itself at default/minimum and smaller work-area sizes.
Programmatic UI checks do not replace manual testing on every Windows/DPI
configuration or a full screen-reader audit.
On small hosted desktops, Windows can cap the native window's width. The report
therefore records the actual window size separately from the full-width WPF
dashboard render. Keyboard, language, clipboard, and pin checks still exercise
the real native window; full-width images are app-content renders, not evidence
of a larger physical screen.

## Windows Actions build

`.github/workflows/windows-build.yml` runs on Windows-related changes to `main`
or when manually dispatched, with read-only repository permissions. This
public repository's new runs and artifacts are public; they contain app-only
sample-input verification, not personal hand data. Portable artifacts expire
after 30 days; diagnostic images expire after 14 days. Download the package to
keep and share it beyond that expiry. The workflow does not create a release
or publish the web site.

The arithmetic assumptions are unchanged: effective stack is the smaller
remaining stack, one matching caller per street, no intervening raises/folds/rake,
and preflop values are total raise-to targets. Pot100 / effective stack241.6
produces3e40.0% and your bets40.0,72.0,129.6 all-in. Values are rounded only for
display; tiny positives use `<0.1` instead of a misleading zero. This is an
arithmetic tool, not poker advice or game automation.
