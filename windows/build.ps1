param(
    [ValidateSet("win-x64", "win-arm64")]
    [string] $Runtime = "win-x64",
    [switch] $VerifyUI
)
$ErrorActionPreference = "Stop"
$env:DOTNET_CLI_TELEMETRY_OPTOUT = "1"
$env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE = "1"
$Root = $PSScriptRoot
$Artifacts = Join-Path $Root "artifacts"
$Publish = Join-Path $Artifacts $Runtime
$Project = Join-Path $Root "PokerCalculator.Windows/PokerCalculator.Windows.csproj"

dotnet run --project (Join-Path $Root "PokerCalculator.Checks") --configuration Release
if ($LASTEXITCODE -ne 0) { throw "Calculation parity checks failed." }
dotnet publish $Project --configuration Release --runtime $Runtime --self-contained true `
    -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true `
    -p:DebugType=None -p:DebugSymbols=false --output $Publish
if ($LASTEXITCODE -ne 0) { throw "Windows release publish failed." }

if ($VerifyUI) {
    if (-not $IsWindows) { throw "Native WPF verification must run on Windows." }
    $Verification = Join-Path $Artifacts "verification-$Runtime"
    New-Item -ItemType Directory -Force -Path $Verification | Out-Null
    $Executable = Join-Path $Publish "PokerCalculator.exe"
    $Process = Start-Process -FilePath $Executable -ArgumentList @("--verify-ui", "`"$Verification`"") -PassThru
    if (-not $Process.WaitForExit(120000)) {
        $Process.Kill()
        throw "Windows UI verification exceeded two minutes."
    }
    if ($Process.ExitCode -ne 0) {
        $Failure = Join-Path $Verification "failure.txt"
        if (Test-Path $Failure) { Get-Content $Failure }
        throw "Native Windows UI verification failed: exit $($Process.ExitCode)."
    }
    if (-not (Test-Path (Join-Path $Verification "ui-verification.json"))) {
        throw "The executable did not produce its verification report."
    }
}

Copy-Item (Join-Path $Root "START-HERE.txt") (Join-Path $Publish "START-HERE.txt")
$Zip = Join-Path $Artifacts "PokerCalculator-Windows-$($Runtime.Substring(4)).zip"
Compress-Archive -Path $Publish -DestinationPath $Zip -Force
$Hash = Get-FileHash -Algorithm SHA256 -Path $Zip
"$($Hash.Hash.ToLowerInvariant())  $([IO.Path]::GetFileName($Zip))" |
    Set-Content -Path "$Zip.sha256" -Encoding ascii
Write-Output "Portable Windows app: $Zip"
Write-Output "SHA256: $($Hash.Hash)"
