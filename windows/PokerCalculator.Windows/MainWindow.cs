using System.Globalization;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Automation.Peers;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Win32;
using PokerCalculator.Core;
using AppLanguage = PokerCalculator.Core.Language;
using WpfPath = System.Windows.Shapes.Path;

namespace PokerCalculator.Windows;

internal enum InputField { Pot, Stack, FacingBet }

internal sealed class MainWindow : Window
{
    public HandState Hand { get; } = new();
    public string DecimalSeparator { get; } = CultureInfo.CurrentCulture.NumberFormat.NumberDecimalSeparator;
    public HandEvaluation Evaluation { get; private set; }
    public PokerFormat Format => new(DecimalSeparator, Hand.Language);
    public Dictionary<InputField, TextBox> Fields { get; } = [];
    public Dictionary<string, NumberReadout> Numbers { get; } = [];
    public Dictionary<string, FrameworkElement> Probes { get; } = [];
    public RadioButton English { get; } = new() { Content = "EN", GroupName = "Language" };
    public RadioButton Hebrew { get; } = new() { Content = "עב", GroupName = "Language" };
    public Button NewHandButton { get; } = new();
    public CheckBox PinButton { get; } = new();
    public string? Feedback => feedback.Text.Length == 0 ? null : feedback.Text;
    public Grid Dashboard { get; } = new();
    public string? DiagnosticTheme { get; set; }
    private readonly Grid clientArea = new();
    private readonly Viewbox viewport = new() { Stretch = Stretch.Uniform, StretchDirection = StretchDirection.DownOnly };
    private readonly List<Action> localizers = [];
    private readonly List<Action> refreshers = [];
    private readonly List<Action> painters = [];
    private readonly Dictionary<InputField, TextBlock> fieldMessages = [];
    private readonly TextBlock feedback = new();
    private readonly TextBlock geometricStatus = new();
    private readonly TextBlock raiseStatus = new();
    private readonly DispatcherTimer feedbackTimer = new() { Interval = TimeSpan.FromSeconds(2.4) };
    private readonly ColumnDefinition preflopWidth = new();
    private bool updating;
    private bool dark;
    private bool highContrast;
    private bool compact;
    private Brush Canvas => highContrast ? SystemColors.WindowBrush : Brush(dark ? "#303030" : "#ECECEC");
    private Brush Surface => highContrast ? SystemColors.WindowBrush : Brush(dark ? "#202020" : "#FFFFFF");
    private Brush Ink => highContrast ? SystemColors.WindowTextBrush : Brush(dark ? "#F7F7F7" : "#111111");
    private Brush Secondary => highContrast ? SystemColors.WindowTextBrush : Brush(dark ? "#B5B5B5" : "#666666");
    private Brush Teal => highContrast ? SystemColors.WindowTextBrush : Brush(dark ? "#4ACFBD" : "#056464");
    private Brush Blue => highContrast ? SystemColors.WindowTextBrush : Brush(dark ? "#73A8FF" : "#1F4FA6");
    private Brush Line => highContrast ? SystemColors.WindowTextBrush : Brush(dark ? "#505050" : "#D7D7D7");
    private Brush ErrorInk => highContrast ? SystemColors.WindowTextBrush : Brush(dark ? "#FFADA6" : "#B42318");
    public bool IsDark => dark;
    public bool IsHighContrast => highContrast;
    public bool IsCompact => compact;
    public string T(string key, params (string Key, string Value)[] values) => Copy.Text(Hand.Language, key, values);
    private static SolidColorBrush Brush(string color) => new((Color)ColorConverter.ConvertFromString(color));

    public MainWindow()
    {
        Evaluation = new(Hand, DecimalSeparator);
        Title = "PokerCalculator";
        FontFamily = new FontFamily("Segoe UI");
        FontSize = 13;
        UseLayoutRounding = true;
        SnapsToDevicePixels = true;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        var work = SystemParameters.WorkArea;
        Width = Math.Min(1240, work.Width - 32);
        Height = Math.Min(784, work.Height - 32);
        MinWidth = Math.Min(1060, work.Width - 32);
        MinHeight = Math.Min(746, work.Height - 32);
        Content = clientArea;
        clientArea.Children.Add(viewport);
        viewport.Child = Dashboard;
        Dashboard.Margin = new Thickness(0);
        Dashboard.RowDefinitions.Add(new() { Height = new GridLength(34) });
        Dashboard.RowDefinitions.Add(new() { Height = new GridLength(10) });
        Dashboard.RowDefinitions.Add(new() { Height = new GridLength(1, GridUnitType.Star) });
        Dashboard.RowDefinitions.Add(new() { Height = new GridLength(10) });
        Dashboard.RowDefinitions.Add(new() { Height = new GridLength(64) });
        Dashboard.RowDefinitions.Add(new() { Height = new GridLength(8) });
        Dashboard.RowDefinitions.Add(new() { Height = new GridLength(32) });
        Put(Dashboard, Header(), 0);
        var panels = new Grid();
        panels.ColumnDefinitions.Add(new() { Width = new GridLength(1, GridUnitType.Star) });
        panels.ColumnDefinitions.Add(new() { Width = new GridLength(14) });
        panels.ColumnDefinitions.Add(preflopWidth);
        Put(panels, Postflop(), 0, 0);
        Put(panels, Preflop(), 0, 2);
        Put(Dashboard, panels, 2);
        Put(Dashboard, Reference(), 4);
        Put(Dashboard, Footer(), 6);
        KeyCommand(Key.N, ModifierKeys.Control, NewHand);
        KeyCommand(Key.D1, ModifierKeys.Control, () => FocusField(InputField.Pot));
        KeyCommand(Key.D2, ModifierKeys.Control, () => FocusField(InputField.Stack));
        KeyCommand(Key.D3, ModifierKeys.Control, () => FocusField(InputField.FacingBet));
        KeyCommand(Key.P, ModifierKeys.Control | ModifierKeys.Shift, TogglePin);
        KeyCommand(Key.F1, ModifierKeys.None, ShowAssumptions);
        feedbackTimer.Tick += (_, _) => { feedback.Text = ""; feedbackTimer.Stop(); };
        Loaded += (_, _) => { ResizeDashboard(); RefreshLanguage(); FocusField(InputField.Pot); };
        clientArea.SizeChanged += (_, _) => ResizeDashboard();
        SourceInitialized += (_, _) => RefreshTheme();
        SystemEvents.UserPreferenceChanged += PreferencesChanged;
        Closed += (_, _) => { SystemEvents.UserPreferenceChanged -= PreferencesChanged; feedbackTimer.Stop(); };
        RefreshTheme();
        RefreshLanguage();
    }

    private void PreferencesChanged(object sender, UserPreferenceChangedEventArgs args) =>
        Dispatcher.BeginInvoke(RefreshTheme);

    public void RefreshTheme()
    {
        highContrast = DiagnosticTheme == "contrast" || (DiagnosticTheme is null && SystemParameters.HighContrast);
        using var personalization = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
        dark = DiagnosticTheme == "dark" || (DiagnosticTheme is null && personalization?.GetValue("AppsUseLightTheme") is int value && value == 0);
        Background = Canvas;
        Foreground = Ink;
        Dashboard.Background = Canvas;
        foreach (var paint in painters) paint();
        RefreshResults();
        var handle = new WindowInteropHelper(this).Handle;
        if (handle != IntPtr.Zero)
        {
            int mode = dark && !highContrast ? 1 : 0;
            _ = DwmSetWindowAttribute(handle, 20, ref mode, sizeof(int));
        }
    }

    private void ResizeDashboard()
    {
        var client = clientArea.RenderSize;
        if (client.Width <= 0 || client.Height <= 0) return;
        var padding = client.Height < 720 ? 14d : 18d;
        viewport.Margin = new Thickness(padding);
        Dashboard.Width = Math.Max(1032, client.Width - 2 * padding);
        Dashboard.Height = Math.Max(682, client.Height - 2 * padding);
        compact = client.Height < 720;
        preflopWidth.Width = new GridLength(client.Width < 1160 ? 340 : 360);
        foreach (var (id, number) in Numbers)
        {
            number.SetSize(id.StartsWith("first-", StringComparison.Ordinal) ? compact ? 64 : 72
                : id.StartsWith("later-", StringComparison.Ordinal) ? compact ? 38 : 44
                : id.StartsWith("raise-", StringComparison.Ordinal) ? compact ? 48 : 56
                : id.StartsWith("percent-", StringComparison.Ordinal) ? compact ? 32 : 36
                : compact ? 30 : 34);
        }
    }

    private FrameworkElement Header()
    {
        var grid = new Grid { FlowDirection = FlowDirection.LeftToRight };
        grid.ColumnDefinitions.Add(new() { Width = GridLength.Auto });
        grid.ColumnDefinitions.Add(new() { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new() { Width = GridLength.Auto });
        var brand = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
        var spade = Literal("♠", 25, FontWeights.Bold);
        spade.Margin = new Thickness(0, 0, 12, 0);
        brand.Children.Add(spade);
        brand.Children.Add(Literal("PokerCalculator", 18, FontWeights.SemiBold));
        var menu = new Menu { Margin = new Thickness(12, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center };
        var commands = new MenuItem();
        localizers.Add(() => commands.Header = T("calculatorMenu"));
        AddMenu(commands, "newHandMenu", "Ctrl+N", NewHand);
        commands.Items.Add(new Separator());
        AddMenu(commands, "focusPot", "Ctrl+1", () => FocusField(InputField.Pot));
        AddMenu(commands, "focusStack", "Ctrl+2", () => FocusField(InputField.Stack));
        AddMenu(commands, "focusFacingBet", "Ctrl+3", () => FocusField(InputField.FacingBet));
        AddMenu(commands, "keepOnTop", "Ctrl+Shift+P", TogglePin);
        commands.Items.Add(new Separator());
        AddMenu(commands, "assumptionsMenu", "F1", ShowAssumptions);
        menu.Items.Add(commands);
        painters.Add(() => { menu.Background = Canvas; menu.Foreground = Ink; });
        brand.Children.Add(menu);
        Put(grid, brand, 0, 0);
        feedback.FontSize = 11;
        feedback.TextWrapping = TextWrapping.Wrap;
        feedback.VerticalAlignment = VerticalAlignment.Center;
        feedback.TextAlignment = TextAlignment.Right;
        feedback.Margin = new Thickness(8, 0, 12, 0);
        AutomationProperties.SetLiveSetting(feedback, AutomationLiveSetting.Polite);
        painters.Add(() => feedback.Foreground = Secondary);
        Put(grid, feedback, 0, 1);
        var actions = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
        var languages = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 10, 0) };
        foreach (var radio in new[] { English, Hebrew })
        {
            radio.Focusable = false;
            radio.IsTabStop = false;
            radio.Width = 42;
            radio.Height = 28;
            radio.FontWeight = FontWeights.SemiBold;
            radio.Template = LanguageSegmentTemplate();
            radio.VerticalContentAlignment = VerticalAlignment.Center;
            languages.Children.Add(radio);
        }
        painters.Add(PaintLanguageSegments);
        English.Checked += (_, _) => { if (!updating) SetLanguage(AppLanguage.English); };
        Hebrew.Checked += (_, _) => { if (!updating) SetLanguage(AppLanguage.Hebrew); };
        AutomationProperties.SetName(English, "English");
        AutomationProperties.SetName(Hebrew, "עברית");
        Probes["language-toggle"] = languages;
        actions.Children.Add(languages);
        PinButton.Margin = new Thickness(0, 0, 12, 0);
        PinButton.VerticalAlignment = VerticalAlignment.Center;
        PinButton.Focusable = false;
        PinButton.Checked += (_, _) => { if (!updating) SetPin(true); };
        PinButton.Unchecked += (_, _) => { if (!updating) SetPin(false); };
        localizers.Add(() => { PinButton.Content = T(Hand.IsPinned ? "pinned" : "keepOnTop"); PinButton.ToolTip = T("pinHelp"); });
        painters.Add(() => PinButton.Foreground = Ink);
        actions.Children.Add(PinButton);
        StyleButton(NewHandButton);
        NewHandButton.Click += (_, _) => NewHand();
        localizers.Add(() => { NewHandButton.Content = T("newHand"); NewHandButton.ToolTip = T("newHandHelp"); });
        actions.Children.Add(NewHandButton);
        Put(grid, actions, 0, 2);
        Probes["header"] = grid;
        return grid;
    }

    private FrameworkElement Postflop()
    {
        var grid = Rows(GridLength.Auto, GridLength.Auto, new GridLength(1, GridUnitType.Star), new GridLength(32));
        Put(grid, Heading("postflop", "pathToAllIn"), 0);
        var inputs = new Grid { Margin = new Thickness(0, 10, 0, 10) };
        foreach (var size in new[] { new GridLength(1, GridUnitType.Star), new GridLength(12), new GridLength(1, GridUnitType.Star), new GridLength(12), new GridLength(140) })
            inputs.ColumnDefinitions.Add(new() { Width = size });
        Put(inputs, AmountField(InputField.Pot, "currentPot", "potHint", "1"), 0, 0);
        Put(inputs, AmountField(InputField.Stack, "effectiveStack", "stackHint", "2"), 0, 2);
        var spr = new StackPanel();
        spr.Children.Add(Literal("SPR", 13, FontWeights.SemiBold, secondary: true));
        spr.Children.Add(Number("spr-number", () => Evaluation.Geometric is { } sizing ? Format.Spr(sizing.Spr) : "—", () => T("sprName"), right: false));
        spr.Children.Add(Label("sprFormula", 11, secondary: true));
        Probes["spr"] = spr;
        Put(inputs, spr, 0, 4);
        Put(grid, inputs, 1);
        var plans = new Grid();
        plans.ColumnDefinitions.Add(new() { Width = new GridLength(1, GridUnitType.Star) });
        plans.ColumnDefinitions.Add(new() { Width = new GridLength(12) });
        plans.ColumnDefinitions.Add(new() { Width = new GridLength(1, GridUnitType.Star) });
        Put(plans, StreetCard(2), 0, 0);
        Put(plans, StreetCard(3), 0, 2);
        Put(grid, plans, 2);
        geometricStatus.FontSize = 11;
        geometricStatus.Margin = new Thickness(0, 5, 0, 0);
        geometricStatus.TextWrapping = TextWrapping.Wrap;
        Put(grid, geometricStatus, 3);
        return Panel(grid, "postflop-panel");
    }

    private FrameworkElement StreetCard(int streets)
    {
        StreetSizing? Plan() => streets == 2 ? Evaluation.Geometric?.TwoStreet : Evaluation.Geometric?.ThreeStreet;
        var grid = Rows(GridLength.Auto, new GridLength(1), GridLength.Auto, new GridLength(1, GridUnitType.Star), GridLength.Auto);
        var header = new Grid { Margin = new Thickness(0, 0, 0, 8) };
        header.ColumnDefinitions.Add(new() { Width = GridLength.Auto });
        header.ColumnDefinitions.Add(new() { Width = new GridLength(1, GridUnitType.Star) });
        var name = new StackPanel { Margin = new Thickness(0, 0, 12, 0), VerticalAlignment = VerticalAlignment.Center };
        var code = Literal(streets + "e", 19, FontWeights.Bold);
        code.FlowDirection = FlowDirection.LeftToRight;
        painters.Add(() => code.Foreground = streets == 2 ? Teal : Blue);
        name.Children.Add(code);
        name.Children.Add(Label("streets" + streets, 12, secondary: true));
        Put(header, name, 0, 0);
        var percentage = new StackPanel();
        percentage.Children.Add(Number("percent-" + streets, () => Plan() is { } p ? Format.Percent(p.Fraction) : "—",
            () => T("streetPercentage" + streets), accent: streets));
        var percentLabel = Literal("", 11, FontWeights.Medium, secondary: true);
        percentLabel.TextAlignment = TextAlignment.Right;
        refreshers.Add(() => percentLabel.Text = T(Plan()?.Fraction > 1 + 1e-12 ? "overPot" : "potEachStreet"));
        percentage.Children.Add(percentLabel);
        Put(header, percentage, 0, 1);
        Put(grid, header, 0);
        Put(grid, Rule(), 1);
        var immediate = new StackPanel { Margin = new Thickness(0, 7, 0, 0) };
        var now = CopyHeading(() => T("betNow"), () => Plan()?.FirstBet, () => T($"betCopy{streets}-1"));
        immediate.Children.Add(now);
        immediate.Children.Add(Number("first-bet-" + streets, () => Plan() is { } p ? Format.Amount(p.FirstBet) : "—", () => T("firstBetLabel" + streets)));
        Put(grid, immediate, 2);
        var later = new StackPanel();
        for (var number = 2; number <= streets; number++)
        {
            var index = number;
            if (number > 2) { var divider = Rule(); divider.Margin = new Thickness(0, 6, 0, 6); later.Children.Add(divider); }
            var row = new Grid();
            row.ColumnDefinitions.Add(new() { Width = GridLength.Auto });
            row.ColumnDefinitions.Add(new() { Width = new GridLength(1, GridUnitType.Star) });
            var labels = new StackPanel { Margin = new Thickness(0, 0, 8, 0), VerticalAlignment = VerticalAlignment.Center };
            var caption = new StackPanel { Orientation = Orientation.Horizontal };
            caption.Children.Add(Label(index == streets ? "allIn" : "bet2", 13, FontWeights.SemiBold));
            caption.Children.Add(CopyButton(() => Plan()?.Bets[index - 1], () => T($"betCopy{streets}-{index}")));
            labels.Children.Add(caption);
            labels.Children.Add(Label("afterCalls" + (index - 1), 10, secondary: true));
            Put(row, labels, 0, 0);
            Put(row, Number($"later-bet-{streets}-{index}", () => Plan() is { } p ? Format.Amount(p.Bets[index - 1]) : "—",
                () => T($"futureBet{streets}-{index}")), 0, 1);
            later.Children.Add(row);
        }
        Put(grid, later, 4);
        var border = new Border { Child = grid, CornerRadius = new CornerRadius(12), BorderThickness = new Thickness(1), Padding = new Thickness(12) };
        painters.Add(() => { border.Background = Surface; border.BorderBrush = highContrast ? Ink : streets == 2 ? Teal : Blue; });
        Probes["plan-" + streets] = border;
        return border;
    }

    private FrameworkElement Preflop()
    {
        var grid = Rows(GridLength.Auto, GridLength.Auto, new GridLength(1, GridUnitType.Star), GridLength.Auto,
            new GridLength(1, GridUnitType.Star), new GridLength(32));
        Put(grid, Heading("preflop", "raiseTo"), 0);
        var field = AmountField(InputField.FacingBet, "facingBet", "facingBetHint", "3");
        field.Margin = new Thickness(0, 10, 0, 10);
        Put(grid, field, 1);
        Put(grid, RaiseGroup("3-BET", [RaiseKind.ThreeBetIP, RaiseKind.ThreeBetOOP]), 2);
        var divider = Rule();
        divider.Margin = new Thickness(0, 10, 0, 10);
        Put(grid, divider, 3);
        Put(grid, RaiseGroup("4-BET", [RaiseKind.FourBetIP, RaiseKind.FourBetOOP]), 4);
        raiseStatus.FontSize = 11;
        raiseStatus.TextWrapping = TextWrapping.Wrap;
        raiseStatus.Margin = new Thickness(0, 5, 0, 0);
        Put(grid, raiseStatus, 5);
        return Panel(grid, "preflop-panel");
    }

    private FrameworkElement RaiseGroup(string title, RaiseKind[] kinds)
    {
        var grid = Rows(GridLength.Auto, new GridLength(1, GridUnitType.Star));
        var heading = Literal(title, 12, FontWeights.Bold, secondary: true);
        heading.FlowDirection = FlowDirection.LeftToRight;
        heading.Margin = new Thickness(0, 0, 0, 8);
        Put(grid, heading, 0);
        var columns = new Grid { VerticalAlignment = VerticalAlignment.Center };
        columns.ColumnDefinitions.Add(new() { Width = new GridLength(1, GridUnitType.Star) });
        columns.ColumnDefinitions.Add(new() { Width = new GridLength(12) });
        columns.ColumnDefinitions.Add(new() { Width = new GridLength(1, GridUnitType.Star) });
        for (var column = 0; column < kinds.Length; column++)
        {
            var kind = kinds[column];
            double? Amount() => Evaluation.Preflop?.First(x => x.Kind == kind).Amount;
            var stack = new StackPanel();
            stack.Children.Add(Label(kind.InPosition() ? "inPosition" : "outOfPosition", 13, FontWeights.SemiBold));
            stack.Children.Add(Number("raise-" + kind.Id(), () => Amount() is double amount ? Format.Amount(amount) : "—",
                () => T("raiseLabel-" + kind.Id()), right: false));
            stack.Children.Add(CopyHeading(() => kind.MultiplierLabel(), Amount, () => T("raiseCopy-" + kind.Id()), secondary: true));
            Put(columns, stack, 0, column * 2);
        }
        Put(grid, columns, 1);
        return grid;
    }

    private FrameworkElement AmountField(InputField field, string labelKey, string hintKey, string shortcut)
    {
        var stack = new StackPanel();
        var heading = new Grid();
        heading.ColumnDefinitions.Add(new() { Width = new GridLength(1, GridUnitType.Star) });
        heading.ColumnDefinitions.Add(new() { Width = GridLength.Auto });
        Put(heading, Label(labelKey, 14, FontWeights.SemiBold), 0, 0);
        var key = Literal("Ctrl+" + shortcut, 10, FontWeights.Normal, secondary: true);
        key.FlowDirection = FlowDirection.LeftToRight;
        Put(heading, key, 0, 1);
        stack.Children.Add(heading);
        var input = new TextBox
        {
            FontSize = 26, FontWeight = FontWeights.Medium, Height = 44, Padding = new Thickness(9, 3, 9, 3),
            VerticalContentAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 4, 0, 4),
            FlowDirection = FlowDirection.LeftToRight, AcceptsReturn = false, AcceptsTab = false,
            BorderThickness = new Thickness(1), Language = System.Windows.Markup.XmlLanguage.GetLanguage("en-US")
        };
        Fields[field] = input;
        Probes["input-" + field] = stack;
        input.TextChanged += (_, _) =>
        {
            if (updating) return;
            switch (field)
            {
                case InputField.Pot: Hand.Pot = input.Text; break;
                case InputField.Stack: Hand.Stack = input.Text; break;
                case InputField.FacingBet: Hand.FacingBet = input.Text; break;
            }
            RefreshResults();
        };
        input.GotKeyboardFocus += (_, _) => { input.SelectAll(); RefreshResults(); };
        input.LostKeyboardFocus += (_, _) => RefreshResults();
        input.PreviewKeyDown += (_, args) => HandleFieldKey(field, args);
        localizers.Add(() =>
        {
            var start = input.SelectionStart;
            var length = input.SelectionLength;
            input.TextAlignment = Hand.Language == AppLanguage.Hebrew ? TextAlignment.Right : TextAlignment.Left;
            input.FlowDirection = FlowDirection.LeftToRight;
            input.Select(start, length);
            AutomationProperties.SetName(input, T(labelKey));
            AutomationProperties.SetHelpText(input, T("fieldHelp", ("hint", T(hintKey)), ("shortcut", shortcut)));
            input.ToolTip = T(hintKey);
        });
        painters.Add(() => { input.Foreground = Ink; input.Background = Surface; input.CaretBrush = Ink; input.BorderBrush = Line; });
        stack.Children.Add(input);
        var hint = Literal("", 11, FontWeights.Normal, secondary: true);
        hint.Height = 27;
        hint.TextWrapping = TextWrapping.Wrap;
        fieldMessages[field] = hint;
        stack.Children.Add(hint);
        return stack;
    }

    public void HandleFieldKey(InputField field, KeyEventArgs args)
    {
        if (args.Key is not (Key.Tab or Key.Return)) return;
        var backwards = args.Key == Key.Tab && (Keyboard.Modifiers & ModifierKeys.Shift) != 0;
        MoveField(field, backwards);
        args.Handled = true;
    }

    public void MoveField(InputField field, bool backwards)
    {
        var index = ((int)field + (backwards ? 2 : 1)) % 3;
        FocusField((InputField)index);
    }

    public void FocusField(InputField field)
    {
        Fields[field].Focus();
        Fields[field].SelectAll();
    }

    private FrameworkElement Reference()
    {
        var grid = new Grid { Margin = new Thickness(14, 3, 14, 3) };
        grid.ColumnDefinitions.Add(new() { Width = new GridLength(140) });
        grid.ColumnDefinitions.Add(new() { Width = new GridLength(1, GridUnitType.Star) });
        var name = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
        name.Children.Add(Label("sprReference", 12, FontWeights.SemiBold, secondary: true));
        name.Children.Add(Label("percentOfPot", 10, secondary: true));
        Put(grid, name, 0, 0);
        var table = new Grid();
        foreach (var _ in new[] { 0, 1, 2 }) table.RowDefinitions.Add(new() { Height = new GridLength(1, GridUnitType.Star) });
        table.ColumnDefinitions.Add(new() { Width = new GridLength(34) });
        for (var i = 0; i < 7; i++) table.ColumnDefinitions.Add(new() { Width = new GridLength(1, GridUnitType.Star) });
        for (var row = 0; row < 3; row++) Put(table, Literal(row == 0 ? "SPR" : (row + 1) + "e", 12, FontWeights.SemiBold, secondary: true), row);
        var refs = new[] { 2, 3, 4, 7, 10, 13, 30 };
        for (var i = 0; i < refs.Length; i++)
        {
            var spr = refs[i];
            var title = Literal(spr.ToString(CultureInfo.InvariantCulture), 12, FontWeights.SemiBold, secondary: true);
            title.TextAlignment = TextAlignment.Center;
            Put(table, title, 0, i + 1);
            foreach (var streets in new[] { 2, 3 })
            {
                var fraction = PokerMath.Fraction(spr, streets);
                var value = Literal("", 13, FontWeights.Normal, secondary: true);
                value.FlowDirection = FlowDirection.LeftToRight;
                value.TextAlignment = TextAlignment.Center;
                localizers.Add(() => value.Text = Format.Percent(fraction));
                Put(table, value, streets - 1, i + 1);
            }
        }
        Put(grid, table, 0, 1);
        Probes["reference"] = grid;
        return grid;
    }

    private FrameworkElement Footer()
    {
        var grid = new Grid();
        grid.ColumnDefinitions.Add(new() { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new() { Width = GridLength.Auto });
        var notes = new StackPanel();
        var units = Literal("", 10, FontWeights.Normal, secondary: true);
        localizers.Add(() => units.Text = T("unitsNote", ("separator", DecimalSeparator)));
        notes.Children.Add(units);
        notes.Children.Add(Label("assumptionsNote", 10, secondary: true));
        Put(grid, notes, 0);
        var actions = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
        var button = new Button();
        StyleButton(button);
        button.Click += (_, _) => ShowAssumptions();
        localizers.Add(() => { button.Content = T("assumptions"); button.ToolTip = T("assumptionsHelp"); });
        actions.Children.Add(button);
        var offline = Label("offline", 10, FontWeights.SemiBold, secondary: true);
        offline.Margin = new Thickness(10, 0, 0, 0);
        offline.VerticalAlignment = VerticalAlignment.Center;
        localizers.Add(() => AutomationProperties.SetName(offline, T("offlineHelp")));
        actions.Children.Add(offline);
        Put(grid, actions, 0, 1);
        Probes["footer"] = grid;
        return grid;
    }

    private NumberReadout Number(string id, Func<string> value, Func<string> label, bool right = true, int accent = 0)
    {
        var number = new NumberReadout { AlignRight = right };
        Numbers[id] = number;
        Probes[id] = number;
        AutomationProperties.SetAutomationId(number, id);
        refreshers.Add(() =>
        {
            number.Text = value();
            number.AccessibleLabel = label();
            number.WaitingText = T("waitingForInput");
            number.ToolTip = label() + ": " + Copy.Token(Hand.Language, number.Text);
            number.AlignRight = Hand.Language == AppLanguage.Hebrew || right;
            number.Ink = accent == 2 ? Teal : accent == 3 ? Blue : Ink;
            number.PlaceholderInk = Secondary;
            number.InvalidateVisual();
        });
        return number;
    }

    private FrameworkElement CopyHeading(Func<string> label, Func<double?> value, Func<string> copyLabel, bool secondary = false)
    {
        var grid = new Grid { Height = 28 };
        grid.ColumnDefinitions.Add(new() { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new() { Width = GridLength.Auto });
        var text = Literal("", secondary ? 11 : 12, secondary ? FontWeights.Normal : FontWeights.Bold, secondary);
        localizers.Add(() => text.Text = label());
        Put(grid, text, 0, 0);
        Put(grid, CopyButton(value, copyLabel), 0, 1);
        return grid;
    }

    private Button CopyButton(Func<double?> value, Func<string> label)
    {
        var path = new WpfPath
        {
            Data = Geometry.Parse("M 7,2 L 17,2 L 17,15 L 7,15 Z M 4,5 L 2,5 L 2,19 L 13,19 L 13,17"),
            StrokeThickness = 1.6, Width = 17, Height = 19, Stretch = Stretch.Uniform
        };
        var button = new Button
        {
            Content = path, Width = 28, Height = 26, Padding = new Thickness(4), BorderThickness = new Thickness(0),
            Background = Brushes.Transparent, Focusable = false, VerticalAlignment = VerticalAlignment.Center
        };
        button.Click += (_, _) => CopyAmount(value(), label());
        painters.Add(() => path.Stroke = Teal);
        refreshers.Add(() =>
        {
            button.IsEnabled = value() is double amount && Format.CopyAmount(amount) is not null;
            path.Opacity = button.IsEnabled ? 1 : 0.4;
            button.ToolTip = T("copyHelp", ("label", label()));
            AutomationProperties.SetName(button, T("copyLabel", ("label", label())));
        });
        return button;
    }

    public void CopyAmount(double? value, string label)
    {
        if (value is not double amount || Format.CopyAmount(amount) is not string text)
        {
            Notify(T("noValidAmount"), true);
            return;
        }
        try { Clipboard.SetText(text); }
        catch (ExternalException) { Notify(T("copyFailed"), true); return; }
        Notify(T("copied", ("label", label), ("amount", text)));
    }

    private void Notify(string message, bool error = false)
    {
        feedback.Text = message;
        feedback.Foreground = error ? ErrorInk : Secondary;
        AutomationProperties.SetName(feedback, message);
        if (UIElementAutomationPeer.CreatePeerForElement(feedback) is { } peer)
            peer.RaiseAutomationEvent(AutomationEvents.LiveRegionChanged);
        feedbackTimer.Stop();
        feedbackTimer.Start();
    }

    public void NewHand()
    {
        Hand.Reset();
        updating = true;
        foreach (var field in Fields.Values) field.Clear();
        updating = false;
        RefreshResults();
        Notify(T("handCleared"));
        FocusField(InputField.Pot);
    }

    public void SetLanguage(AppLanguage language)
    {
        Hand.Language = language;
        feedback.Text = "";
        feedbackTimer.Stop();
        RefreshLanguage();
    }

    private void RefreshLanguage()
    {
        updating = true;
        Dashboard.FlowDirection = Hand.Language == AppLanguage.Hebrew ? FlowDirection.RightToLeft : FlowDirection.LeftToRight;
        English.IsChecked = Hand.Language == AppLanguage.English;
        Hebrew.IsChecked = Hand.Language == AppLanguage.Hebrew;
        PinButton.IsChecked = Hand.IsPinned;
        foreach (var update in localizers) update();
        PaintLanguageSegments();
        updating = false;
        RefreshResults();
    }

    public void SetPin(bool pin)
    {
        Hand.IsPinned = pin;
        Topmost = pin;
        updating = true;
        PinButton.IsChecked = pin;
        PinButton.Content = T(pin ? "pinned" : "keepOnTop");
        updating = false;
    }
    public void TogglePin() => SetPin(!Hand.IsPinned);

    public void RefreshResults()
    {
        Evaluation = new(Hand, DecimalSeparator);
        var inputs = new[] { Evaluation.Pot, Evaluation.Stack, Evaluation.FacingBet };
        var hints = new[] { "potHint", "stackHint", "facingBetHint" };
        foreach (var field in Enum.GetValues<InputField>())
        {
            if (!Fields.TryGetValue(field, out var input)) continue;
            var state = inputs[(int)field];
            string? message = state.Status == InputStatus.Incomplete && !input.IsKeyboardFocusWithin ? T("finishAmount") : state.Message;
            if (input.IsKeyboardFocusWithin && (input.Text.Trim() == "0" || input.Text.Trim() == "0" + DecimalSeparator)) message = null;
            fieldMessages[field].Text = message ?? T(hints[(int)field]);
            fieldMessages[field].Foreground = message is null ? Secondary : ErrorInk;
            input.BorderBrush = message is not null ? ErrorInk : input.IsKeyboardFocusWithin ? Teal : Line;
        }
        foreach (var update in refreshers) update();
        geometricStatus.Foreground = Evaluation.GeometricError is null ? Secondary : ErrorInk;
        geometricStatus.Text = Evaluation.GeometricError ?? (Evaluation.Geometric is { } plan
            ? T(plan.TwoStreet.Fraction > 1 + 1e-12 ? "overPotNote" : "matchingCallNote") + "\n" + T("roundingNote")
            : T("waitingForAmounts"));
        raiseStatus.Foreground = Evaluation.PreflopError is null ? Secondary : ErrorInk;
        raiseStatus.Text = Evaluation.PreflopError ?? T("totalTargets");
    }

    private void ShowAssumptions()
    {
        var content = new StackPanel { Margin = new Thickness(22) };
        var title = new TextBlock { Text = T("assumptionsTitle"), FontSize = 21, FontWeight = FontWeights.Bold, Foreground = Ink, Margin = new Thickness(0, 0, 0, 12) };
        content.Children.Add(title);
        foreach (var key in new[] { "effectiveStackExplanation", "geometricExplanation", "planExplanation", "roundingExplanation", "inputRules" })
            content.Children.Add(new TextBlock { Text = T(key), TextWrapping = TextWrapping.Wrap, FontSize = 13, Foreground = Ink, Margin = new Thickness(0, 0, 0, 12) });
        var dialog = new Window
        {
            Title = T("assumptions"), Owner = this, Width = 500, SizeToContent = SizeToContent.Height,
            MaxHeight = SystemParameters.WorkArea.Height - 40, WindowStartupLocation = WindowStartupLocation.CenterOwner,
            ResizeMode = ResizeMode.NoResize, ShowInTaskbar = false, Background = Surface,
            FlowDirection = Hand.Language == AppLanguage.Hebrew ? FlowDirection.RightToLeft : FlowDirection.LeftToRight
        };
        var close = new Button { Content = T("done"), IsCancel = true, IsDefault = true, Padding = new Thickness(18, 5, 18, 5), HorizontalAlignment = HorizontalAlignment.Right };
        close.Click += (_, _) => dialog.Close();
        content.Children.Add(close);
        dialog.Content = new ScrollViewer { Content = content, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        dialog.ShowDialog();
    }

    private FrameworkElement Heading(string titleKey, string subtitleKey)
    {
        var grid = new Grid();
        grid.ColumnDefinitions.Add(new() { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new() { Width = GridLength.Auto });
        Put(grid, Label(titleKey, 16, FontWeights.SemiBold), 0, 0);
        Put(grid, Label(subtitleKey, 12, secondary: true), 0, 1);
        return grid;
    }
    private TextBlock Label(string key, double size, FontWeight? weight = null, bool secondary = false)
    {
        var block = Literal("", size, weight, secondary);
        localizers.Add(() => block.Text = T(key));
        return block;
    }
    private TextBlock Literal(string text, double size, FontWeight? weight = null, bool secondary = false)
    {
        var block = new TextBlock { Text = text, FontSize = size, FontWeight = weight ?? FontWeights.Normal, VerticalAlignment = VerticalAlignment.Center };
        painters.Add(() => block.Foreground = secondary ? Secondary : Ink);
        return block;
    }
    private Border Rule()
    {
        var line = new Border { Height = 1 };
        painters.Add(() => line.Background = Line);
        return line;
    }
    private Border Panel(FrameworkElement content, string id)
    {
        var panel = new Border { Child = content, Padding = new Thickness(14), CornerRadius = new CornerRadius(15), BorderThickness = new Thickness(1) };
        painters.Add(() => { panel.Background = Surface; panel.BorderBrush = highContrast ? Ink : Line; });
        Probes[id] = panel;
        return panel;
    }
    private void StyleButton(Button button)
    {
        button.Padding = new Thickness(10, 4, 10, 4);
        button.Focusable = false;
        button.VerticalAlignment = VerticalAlignment.Center;
        painters.Add(() => { button.Foreground = Ink; button.Background = Surface; button.BorderBrush = Line; });
    }
    private void PaintLanguageSegments()
    {
        foreach (var control in new[] { English, Hebrew })
        {
            var selected = control.IsChecked == true;
            control.Background = selected ? (highContrast ? SystemColors.HighlightBrush : Teal) : Surface;
            control.Foreground = selected
                ? highContrast ? SystemColors.HighlightTextBrush : dark ? Brushes.Black : Brushes.White
                : Ink;
            control.BorderBrush = highContrast ? Ink : Line;
        }
    }
    private static ControlTemplate LanguageSegmentTemplate()
    {
        var frame = new FrameworkElementFactory(typeof(Border));
        frame.SetValue(Border.BorderThicknessProperty, new Thickness(1));
        frame.SetBinding(Border.BackgroundProperty, new Binding(nameof(Background)) { RelativeSource = RelativeSource.TemplatedParent });
        frame.SetBinding(Border.BorderBrushProperty, new Binding(nameof(BorderBrush)) { RelativeSource = RelativeSource.TemplatedParent });
        var content = new FrameworkElementFactory(typeof(ContentPresenter));
        content.SetValue(HorizontalAlignmentProperty, HorizontalAlignment.Center);
        content.SetValue(VerticalAlignmentProperty, VerticalAlignment.Center);
        frame.AppendChild(content);
        return new ControlTemplate(typeof(RadioButton)) { VisualTree = frame };
    }
    private void AddMenu(MenuItem parent, string key, string shortcut, Action action)
    {
        var item = new MenuItem { InputGestureText = shortcut };
        localizers.Add(() => item.Header = T(key));
        item.Click += (_, _) => action();
        parent.Items.Add(item);
    }
    private void KeyCommand(Key key, ModifierKeys modifiers, Action action) =>
        InputBindings.Add(new KeyBinding(new LocalCommand(action), key, modifiers));
    private static Grid Rows(params GridLength[] heights)
    {
        var grid = new Grid();
        foreach (var height in heights) grid.RowDefinitions.Add(new() { Height = height });
        return grid;
    }
    private static void Put(Grid parent, UIElement child, int row, int column = 0)
    {
        Grid.SetRow(child, row);
        Grid.SetColumn(child, column);
        parent.Children.Add(child);
    }
    private sealed class LocalCommand(Action action) : ICommand
    {
        public bool CanExecute(object? parameter) => true;
        public void Execute(object? parameter) => action();
        public event EventHandler? CanExecuteChanged { add { } remove { } }
    }
    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr window, int attribute, ref int value, int size);
}
