using System.IO;
using System.Windows;
using System.Windows.Threading;

namespace PokerCalculator.Windows;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        var diagnosticIndex = Array.IndexOf(args, "--verify-ui");
        string? destination = null;
        if (diagnosticIndex >= 0)
        {
            if (diagnosticIndex + 1 >= args.Length || !Path.IsPathFullyQualified(args[diagnosticIndex + 1]))
                return 2;
            destination = args[diagnosticIndex + 1];
            Directory.CreateDirectory(destination);
        }
        var app = new Application { ShutdownMode = ShutdownMode.OnMainWindowClose };
        app.DispatcherUnhandledException += (_, error) =>
        {
            if (destination is not null)
                File.WriteAllText(Path.Combine(destination, "failure.txt"), error.Exception.ToString());
            else
                MessageBox.Show("PokerCalculator could not continue.\n\n" + error.Exception.Message,
                    "PokerCalculator", MessageBoxButton.OK, MessageBoxImage.Error);
            error.Handled = true;
            app.Shutdown(1);
        };
        var window = new MainWindow();
        if (destination is not null)
        {
            var started = false;
            window.ContentRendered += async (_, _) =>
            {
                if (started) return;
                started = true;
                await app.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
                try
                {
                    await UiVerification.Run(window, destination);
                    app.Shutdown(0);
                }
                catch (Exception error)
                {
                    File.WriteAllText(Path.Combine(destination, "failure.txt"), error.ToString());
                    app.Shutdown(1);
                }
            };
        }
        return app.Run(window);
    }
}
