param(
  [Parameter(Mandatory = $true)]
  [string]$PidFile,

  [Parameter(Mandatory = $true)]
  [string]$LogFile,

  [Parameter(Mandatory = $true)]
  [string]$DeviceName,

  [Parameter(Mandatory = $true)]
  [string]$WakePhrase,

  [Parameter(Mandatory = $true)]
  [string]$AvatarPath
)

$ErrorActionPreference = "Stop"

function Write-Log {
  param([string]$Message)
  $timestamp = Get-Date -Format o
  Add-Content -Path $LogFile -Value "[$timestamp] $Message"
}

function Test-TargetDeviceConnected {
  param([string]$Name)

  $needle = $Name.ToLowerInvariant()
  $devices = Get-CimInstance Win32_PnPEntity | Where-Object {
    $_.Status -eq "OK" -and $_.Name -and $_.Name.ToLowerInvariant().Contains($needle)
  }

  return ($devices | Measure-Object).Count -gt 0
}

function Start-Avatar {
  param([string]$PathToLaunch)

  if (-not (Test-Path $PathToLaunch)) {
    Write-Log "Avatar path not found: $PathToLaunch"
    return
  }

  $normalized = $PathToLaunch.ToLowerInvariant()
  $alreadyRunning = Get-CimInstance Win32_Process | Where-Object {
    ($_.ExecutablePath -and $_.ExecutablePath.ToLowerInvariant() -eq $normalized) -or
    ($_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($normalized))
  }

  if ($alreadyRunning) {
    Write-Log "Avatar already running; skipping launch."
    return
  }

  Start-Process -FilePath $PathToLaunch | Out-Null
  Write-Log "Avatar launched."
}

function Start-WakeLoop {
  Add-Type -AssemblyName System.Speech

  $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine
  $engine.SetInputToDefaultAudioDevice()

  $grammarBuilder = New-Object System.Speech.Recognition.GrammarBuilder
  $grammarBuilder.Append($WakePhrase)
  $grammar = New-Object System.Speech.Recognition.Grammar($grammarBuilder)
  $engine.LoadGrammar($grammar)

  $script:lastLaunchAt = [datetime]::MinValue
  $cooldown = [TimeSpan]::FromSeconds(12)

  Register-ObjectEvent -InputObject $engine -EventName SpeechRecognized -Action {
    if (-not (Test-TargetDeviceConnected -Name $using:DeviceName)) {
      Write-Log "Wake phrase heard, but target Bluetooth device is not connected."
      return
    }

    if ((Get-Date) - $script:lastLaunchAt -lt $cooldown) {
      return
    }

    $script:lastLaunchAt = Get-Date
    Write-Log "Wake phrase recognized."
    Start-Avatar -PathToLaunch $using:AvatarPath
  } | Out-Null

  $engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
  Write-Log "Wake helper listening for phrase."

  while ($true) {
    Start-Sleep -Seconds 2
  }
}

New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($PidFile)) | Out-Null
New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($LogFile)) | Out-Null
Set-Content -Path $PidFile -Value $PID -Encoding ascii
Write-Log "Wake helper started."

try {
  Start-WakeLoop
} finally {
  Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue
  Write-Log "Wake helper stopped."
}
