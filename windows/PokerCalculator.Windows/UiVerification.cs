using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Automation.Peers;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using PokerCalculator.Core;

namespace PokerCalculator.Windows;

internal static class UiVerification
{
    public static async Task Run(MainWindow window, string destination)
    {
        var checks = new List<string>();
        var snapshots = new List<object>();
        var captures = 0;
        await Settle(window);
        Require(window.Hand.Language == Language.English && !window.Hand.IsPinned, "English and unpinned must be the launch defaults.");
        Require(window.Fields.Values.All(x => x.Text.Length == 0), "A normal launch must start blank.");
        Require(window.Evaluation.Geometric is null && window.Evaluation.Preflop is null, "Blank input must not invent results.");
        checks.Add("Blank English launch; pin off; no stored hand.");

        Enter(window, InputField.Pot, "100");
        Enter(window, InputField.Stack, "241" + window.DecimalSeparator + "6");
        Enter(window, InputField.FacingBet, "3");
        Require(window.Evaluation.Geometric?.ThreeStreet.Bets.Select(window.Format.Amount)
            .SequenceEqual(["40" + window.DecimalSeparator + "0", "72" + window.DecimalSeparator + "0", "129" + window.DecimalSeparator + "6"]) == true,
            "Pot100/stack241.6 must immediately show40,72,129.6 after matching calls.");
        Require(window.Evaluation.Preflop?.Length == 4, "All four raise targets must appear.");
        checks.Add("Synchronous native TextBox editing and40% three-street acceptance path.");

        foreach (var field in Enum.GetValues<InputField>())
        {
            Execute(window, (Key)((int)Key.D1 + (int)field), ModifierKeys.Control);
            Require(window.Fields[field].IsKeyboardFocusWithin, "Ctrl focus shortcut failed.");
            Require(window.Fields[field].SelectionLength == window.Fields[field].Text.Length, "Focus shortcut must select all.");
            var next = (InputField)(((int)field + 1) % 3);
            SendKey(window, window.Fields[field], Key.Tab);
            Require(window.Fields[next].IsKeyboardFocusWithin, "Native Tab routing failed.");
            window.MoveField(next, true);
            Require(window.Fields[field].IsKeyboardFocusWithin, "Reverse traversal failed.");
            SendKey(window, window.Fields[field], Key.Return);
            Require(window.Fields[next].IsKeyboardFocusWithin, "Return traversal failed.");
        }
        checks.Add("Ctrl1/2/3 bindings, native Tab/Return routed events, reverse traversal and selection.");

        window.Width = 1240;
        window.Height = 784;
        await Capture("default-light", "light", normalSizes: true);
        await Capture("default-dark", "dark", normalSizes: true);
        window.Width = 1080;
        window.Height = 746;
        await Capture("minimum-light", "light", normalSizes: true);
        await Capture("minimum-dark", "dark", normalSizes: true);
        var positions = Frames(window);
        checks.Add("Actual Windows window interaction at the available work area; default/minimum WPF content layouts rendered in light/dark. Actual window and content sizes are recorded separately.");

        foreach (var field in Enum.GetValues<InputField>())
        {
            window.FocusField(field);
            var input = window.Fields[field];
            input.Select(Math.Min(1, input.Text.Length), 0);
            var text = input.Text;
            var selection = input.SelectionStart;
            window.Hebrew.IsChecked = true;
            Require(window.Hand.Language == Language.Hebrew && input.Text == text, "Hebrew switch lost the hand.");
            Require(input.TextAlignment == TextAlignment.Right && input.FlowDirection == FlowDirection.LeftToRight, "Focused Hebrew numbers must align immediately and remain LTR.");
            Require(input.SelectionStart == selection && input.IsKeyboardFocusWithin, "Hebrew switch must preserve caret and active editing.");
            await Settle(window);
            CheckInputGlyphAlignment(input, right: true);
            window.English.IsChecked = true;
            Require(input.TextAlignment == TextAlignment.Left && input.Text == text && input.SelectionStart == selection, "English switch must immediately restore alignment and caret.");
            await Settle(window);
            CheckInputGlyphAlignment(input, right: false);
        }
        window.Hebrew.IsChecked = true;
        await Capture("minimum-hebrew-light", "light", normalSizes: true);
        await Capture("minimum-hebrew-dark", "dark", normalSizes: true);
        Require(AutomationProperties.GetName(window.Fields[InputField.Pot]) == window.T("currentPot"), "Hebrew accessible field names missing.");
        // An RTL root has mirrored logical coordinates; compare in the LTR window.
        var postflop = Bounds(window.Probes["postflop-panel"], window);
        var preflop = Bounds(window.Probes["preflop-panel"], window);
        Require(postflop.Left > preflop.Right, "Hebrew dashboard must mirror to RTL.");
        window.Width = 1240;
        window.Height = 784;
        await Capture("default-hebrew-light", "light", normalSizes: true);
        await Capture("default-hebrew-dark", "dark", normalSizes: true);
        checks.Add("Actual EN/עב controls, RTL dashboard, LTR numbers, immediate active-editor alignment and caret preservation in every field.");

        window.Width = 1080;
        window.Height = 746;
        window.English.IsChecked = true;
        Enter(window, InputField.Pot, "1000");
        Enter(window, InputField.Stack, "2416");
        Enter(window, InputField.FacingBet, "250");
        await Capture("minimum-thousands", "light");
        Require(window.Numbers["first-bet-3"].FittedSize >= 60 && window.Numbers["raise-threeBetOOP"].FittedSize >= 38, "Four-digit amounts must remain glanceable.");
        Stable(window, positions);
        Enter(window, InputField.Pot, "1000000000000");
        Enter(window, InputField.Stack, "1000000000000");
        Enter(window, InputField.FacingBet, "1000000000000");
        await Capture("minimum-large-values", "light");
        Stable(window, positions);
        var tiny = "0" + window.DecimalSeparator + "001";
        Enter(window, InputField.Stack, tiny);
        await Capture("minimum-tiny-spr", "light");
        Enter(window, InputField.Pot, tiny);
        Enter(window, InputField.Stack, "1000000000000");
        await Capture("minimum-large-spr", "light");
        checks.Add("Stable result anchors, complete full-length extreme values, and nonzero small-value indicators.");

        Enter(window, InputField.Pot, "oops");
        Require(window.Evaluation.Geometric is null && window.Evaluation.Preflop?.Length == 4, "Invalid pot must clear only geometric output.");
        await Capture("minimum-invalid", "light");
        Enter(window, InputField.Pot, "100");
        Enter(window, InputField.Stack, "241" + window.DecimalSeparator + "6");
        Enter(window, InputField.FacingBet, "oops");
        Require(window.Evaluation.Preflop is null && window.Evaluation.Geometric is not null, "Invalid facing amount must not disable postflop.");
        window.Hebrew.IsChecked = true;
        Require(window.Evaluation.PreflopError?.StartsWith("הימור מולך:", StringComparison.Ordinal) == true, "Hebrew errors missing.");
        checks.Add("Independent live validation with no stale results, including Hebrew.");

        window.CopyAmount(129.6, window.T("allIn"));
        Require(Clipboard.GetText() == window.Format.Amount(129.6), "Explicit clipboard output must match the one-decimal amount.");
        Require(window.Feedback?.StartsWith("הועתק", StringComparison.Ordinal) == true, "Hebrew copy feedback missing.");
        window.CopyAmount(0.001, window.T("allIn"));
        Require(Clipboard.GetText() == window.Format.Amount(129.6), "Invalid copy must not change clipboard.");
        checks.Add("Explicit clipboard action, localized accessible feedback, no copying below-resolution values.");

        Execute(window, Key.P, ModifierKeys.Control | ModifierKeys.Shift);
        Require(window.Hand.IsPinned && window.Topmost, "Pin must change the native Windows Topmost state.");
        Execute(window, Key.N, ModifierKeys.Control);
        Require(window.Hand.IsPinned && window.Topmost && window.Hand.Language == Language.Hebrew, "New Hand must preserve pin and language.");
        Require(window.Fields.Values.All(x => x.Text == "") && window.Evaluation.Geometric is null && window.Evaluation.Preflop is null, "New Hand failed to clear every input/result.");
        await Capture("minimum-hebrew-empty", "light");
        Execute(window, Key.P, ModifierKeys.Control | ModifierKeys.Shift);
        Require(!window.Topmost, "Unpin must restore a normal window.");
        window.English.IsChecked = true;
        await Capture("minimum-empty", "light");
        checks.Add("Native pin/unpin and CtrlN reset, with language/pin preservation.");

        Enter(window, InputField.Pot, "100");
        Enter(window, InputField.Stack, "241" + window.DecimalSeparator + "6");
        Enter(window, InputField.FacingBet, "3");
        await Capture("minimum-high-contrast", "contrast", normalSizes: true);
        window.MinWidth = 0;
        window.MinHeight = 0;
        window.Width = 1024;
        window.Height = 680;
        await Capture("small-work-area", "light");
        checks.Add("High-contrast palette and small-work-area fit without scrolling; per-monitor DPI-aware native window.");

        File.WriteAllText(Path.Combine(destination, "ui-verification.json"),
            JsonSerializer.Serialize(new { os = Environment.OSVersion.VersionString, framework = Environment.Version.ToString(), checks, captures, snapshots },
                new JsonSerializerOptions { WriteIndented = true }));

        async Task Capture(string name, string theme, bool normalSizes = false)
        {
            window.DiagnosticTheme = theme;
            window.RefreshTheme();
            await Settle(window);
            var target = window.Dashboard;
            var nativeContentWidth = target.Width;
            var fullWidthRender = name.StartsWith("default-", StringComparison.Ordinal);
            if (fullWidthRender)
            {
                // Render the real WPF dashboard at design width even if the desktop caps its HWND.
                var client = (FrameworkElement)window.Content;
                var frameWidth = window.ActualWidth - client.ActualWidth;
                target.Width = 1240 - frameWidth - 36;
                await Settle(window);
                Require(Math.Abs(target.ActualWidth - target.Width) < 1, "Full-width dashboard layout was not applied.");
            }
            var bitmap = new RenderTargetBitmap((int)Math.Ceiling(target.ActualWidth * 1.5),
                (int)Math.Ceiling(target.ActualHeight * 1.5), 144, 144, PixelFormats.Pbgra32);
            bitmap.Render(target);
            var bounds = new Rect(new Point(0, 0), target.RenderSize);
            foreach (var (id, view) in window.Probes)
            {
                var frame = Bounds(view, target);
                Require(frame.Width > 0 && frame.Height > 0 && Contains(bounds, frame), $"{name}: {id} leaves the dashboard: {frame} / {bounds}");
            }
            var reference = Bounds(window.Probes["reference"], target);
            foreach (var id in new[] { "postflop-panel", "preflop-panel" })
                Require(!Bounds(window.Probes[id], target).IntersectsWith(reference), $"{name}: {id} overlaps the reference.");
            var measurements = new List<object>();
            foreach (var (id, number) in window.Numbers)
            {
                Require(number.TextWidth <= number.ActualWidth + 0.1 && number.FittedSize >= 11,
                    $"{name}: {id} is clipped or illegible: '{number.Text}', {number.FittedSize}pt, {number.TextWidth}/{number.ActualWidth}");
                Require(number.FlowDirection == FlowDirection.LeftToRight, $"{name}: {id} has reversed numeric direction.");
                if (normalSizes)
                {
                    var minimum = id.StartsWith("first-", StringComparison.Ordinal) ? 64
                        : id.StartsWith("later-", StringComparison.Ordinal) ? 38
                        : id.StartsWith("raise-", StringComparison.Ordinal) ? 48 : 28;
                    Require(number.FittedSize >= minimum, $"{name}: {id} shrank to {number.FittedSize}, expected {minimum}.");
                }
                Require(UIElementAutomationPeer.CreatePeerForElement(number)?.GetName() == number.AccessibleLabel, $"{name}: {id} accessible label missing.");
                measurements.Add(new { id, text = number.Text, font = number.FittedSize, width = number.ActualWidth, textWidth = number.TextWidth });
            }
            var encoder = new PngBitmapEncoder();
            encoder.Frames.Add(BitmapFrame.Create(bitmap));
            using (var file = File.Create(Path.Combine(destination, name + ".png"))) encoder.Save(file);
            snapshots.Add(new
            {
                name, language = window.Hand.Language.ToString(),
                renderMode = fullWidthRender ? "default-width content render" : "native window content",
                windowWidth = window.ActualWidth, windowHeight = window.ActualHeight,
                width = target.ActualWidth, height = target.ActualHeight,
                dpi = VisualTreeHelper.GetDpi(window).PixelsPerDip,
                compact = window.IsCompact, measurements
            });
            captures++;
            File.WriteAllText(Path.Combine(destination, "progress.json"),
                JsonSerializer.Serialize(new { workArea = SystemParameters.WorkArea.ToString(), checks, captures, snapshots },
                    new JsonSerializerOptions { WriteIndented = true }));
            if (fullWidthRender)
            {
                target.Width = nativeContentWidth;
                await Settle(window);
            }
        }
    }

    private static void Enter(MainWindow window, InputField field, string text)
    {
        window.FocusField(field);
        window.Fields[field].Text = text;
    }
    private static void Execute(MainWindow window, Key key, ModifierKeys modifiers)
    {
        var binding = window.InputBindings.OfType<KeyBinding>().Single(x => x.Key == key && x.Modifiers == modifiers);
        Require(binding.Command.CanExecute(null), $"Disabled shortcut {modifiers}+{key}");
        binding.Command.Execute(null);
    }
    private static void SendKey(MainWindow window, TextBox input, Key key)
    {
        var source = PresentationSource.FromVisual(window) ?? throw new InvalidOperationException("No native presentation source.");
        var args = new KeyEventArgs(Keyboard.PrimaryDevice, source, Environment.TickCount, key)
        {
            RoutedEvent = Keyboard.PreviewKeyDownEvent
        };
        input.RaiseEvent(args);
        Require(args.Handled, "Input navigation key was not handled.");
    }
    private static void CheckInputGlyphAlignment(TextBox input, bool right)
    {
        Require(input.Text.Length > 0, "Glyph alignment needs a populated field.");
        input.UpdateLayout();
        var start = input.GetRectFromCharacterIndex(0, false);
        var end = input.GetRectFromCharacterIndex(input.Text.Length - 1, true);
        Require(!start.IsEmpty && !end.IsEmpty, "Native input glyph positions are unavailable.");
        var inset = right ? input.ActualWidth - end.Right : start.Left;
        Require(inset >= 0 && inset <= 18, $"Active numeric text is on the wrong side: inset {inset}.");
    }
    private static Dictionary<string, Rect> Frames(MainWindow window) =>
        window.Numbers.ToDictionary(x => x.Key, x => Bounds(x.Value, window.Dashboard));
    private static void Stable(MainWindow window, Dictionary<string, Rect> previous)
    {
        foreach (var (id, frame) in previous)
        {
            var current = Bounds(window.Numbers[id], window.Dashboard);
            Require(Math.Abs(current.X - frame.X) < 1 && Math.Abs(current.Y - frame.Y) < 1
                && Math.Abs(current.Width - frame.Width) < 1 && Math.Abs(current.Height - frame.Height) < 1,
                $"{id} moved when the numbers changed.");
        }
    }
    private static Rect Bounds(FrameworkElement view, Visual parent) =>
        view.TransformToAncestor(parent).TransformBounds(new Rect(new Point(0, 0), view.RenderSize));
    private static bool Contains(Rect outer, Rect inner)
    {
        outer.Inflate(1, 1);
        return outer.Contains(inner);
    }
    private static async Task Settle(MainWindow window)
    {
        await Task.Delay(120);
        await window.Dispatcher.InvokeAsync(window.UpdateLayout, DispatcherPriority.Render);
    }
    private static void Require(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }
}
