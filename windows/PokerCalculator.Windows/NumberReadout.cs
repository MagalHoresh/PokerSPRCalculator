using System.Globalization;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Automation.Peers;
using System.Windows.Automation.Provider;
using System.Windows.Media;

namespace PokerCalculator.Windows;

internal sealed class NumberReadout : FrameworkElement
{
    private static readonly Typeface Typeface = new(new FontFamily("Segoe UI"), FontStyles.Normal, FontWeights.Bold, FontStretches.Normal);
    private string text = "—";
    public string Text
    {
        get => text;
        set
        {
            if (text == value) return;
            var previous = text;
            text = value;
            InvalidateVisual();
            if (UIElementAutomationPeer.FromElement(this) is NumberPeer peer)
                peer.RaisePropertyChangedEvent(ValuePatternIdentifiers.ValueProperty, previous, value);
        }
    }
    public double RequestedSize { get; private set; } = 64;
    public double FittedSize { get; private set; }
    public double TextWidth { get; private set; }
    public Brush Ink { get; set; } = Brushes.Black;
    public Brush PlaceholderInk { get; set; } = Brushes.Gray;
    public bool AlignRight { get; set; } = true;
    public string AccessibleLabel { get; set; } = "";
    public string WaitingText { get; set; } = "";

    public NumberReadout()
    {
        FlowDirection = FlowDirection.LeftToRight;
        Focusable = false;
        SnapsToDevicePixels = true;
        TextOptions.SetTextFormattingMode(this, TextFormattingMode.Display);
    }

    public void SetSize(double size)
    {
        if (RequestedSize == size && !double.IsNaN(Height)) return;
        RequestedSize = size;
        Height = Math.Ceiling(size * 1.23) + 4;
        InvalidateMeasure();
        InvalidateVisual();
    }

    private FormattedText Format(double size) => new(Text, CultureInfo.InvariantCulture,
        FlowDirection.LeftToRight, Typeface, size, Text == "—" ? PlaceholderInk : Ink,
        VisualTreeHelper.GetDpi(this).PixelsPerDip);

    protected override Size MeasureOverride(Size availableSize) =>
        new(double.IsInfinity(availableSize.Width) ? 100 : availableSize.Width,
            double.IsNaN(Height) ? RequestedSize * 1.23 + 4 : Height);

    protected override void OnRender(DrawingContext context)
    {
        base.OnRender(context);
        var available = Math.Max(1, ActualWidth - 4);
        var size = RequestedSize;
        if (Format(size).WidthIncludingTrailingWhitespace > available)
        {
            double lower = 1, upper = size;
            while (upper - lower > 0.125)
            {
                var middle = (lower + upper) / 2;
                if (Format(middle).WidthIncludingTrailingWhitespace <= available) lower = middle;
                else upper = middle;
            }
            size = Math.Floor(lower * 4) / 4;
        }
        FittedSize = Math.Max(1, size);
        var formatted = Format(FittedSize);
        TextWidth = formatted.WidthIncludingTrailingWhitespace;
        var x = AlignRight ? Math.Max(2, ActualWidth - TextWidth - 2) : 2;
        context.DrawText(formatted, new Point(x, Math.Max(0, (ActualHeight - formatted.Height) / 2)));
    }

    protected override AutomationPeer OnCreateAutomationPeer() => new NumberPeer(this);

    private sealed class NumberPeer(NumberReadout owner) : FrameworkElementAutomationPeer(owner), IValueProvider
    {
        protected override string GetClassNameCore() => "PokerAmount";
        protected override AutomationControlType GetAutomationControlTypeCore() => AutomationControlType.Text;
        protected override string GetNameCore() => owner.AccessibleLabel;
        public override object? GetPattern(PatternInterface patternInterface) =>
            patternInterface == PatternInterface.Value ? this : base.GetPattern(patternInterface);
        public bool IsReadOnly => true;
        public string Value => owner.Text == "—" ? owner.WaitingText : owner.Text;
        public void SetValue(string value) => throw new InvalidOperationException("Calculated amounts are read-only.");
    }
}
