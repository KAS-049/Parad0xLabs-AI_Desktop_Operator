param(
  [Parameter(Mandatory = $true)]
  [string]$WakePhrase,

  [int]$CommandTimeoutSeconds = 6,

  [int]$CooldownSeconds = 8
)

$ErrorActionPreference = "Stop"

function Write-WakeEvent {
  param(
    [Parameter(Mandatory = $true)]
    [string]$State,

    [Parameter(Mandatory = $true)]
    [string]$Message,

    [string]$Transcript = ""
  )

  $payload = [ordered]@{
    state = $State
    message = $Message
  }

  if ($Transcript) {
    $payload.transcript = $Transcript
  }

  $payload | ConvertTo-Json -Compress
}

Add-Type -AssemblyName System.Speech

function New-WakeEngine {
  param(
    [int]$Attempts = 6,
    [int]$DelayMilliseconds = 1500
  )

  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    try {
      $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine
      $engine.SetInputToDefaultAudioDevice()
      return $engine
    } catch {
      if ($attempt -eq $Attempts) {
        throw
      }
      Start-Sleep -Milliseconds $DelayMilliseconds
    }
  }
}

try {
  $engine = New-WakeEngine
} catch {
  Write-WakeEvent -State "error" -Message "Wake listener could not access the default microphone."
  exit 1
}

$wakeBuilder = New-Object System.Speech.Recognition.GrammarBuilder
$wakeBuilder.Append($WakePhrase)
$wakeGrammar = New-Object System.Speech.Recognition.Grammar($wakeBuilder)
Write-WakeEvent -State "running" -Message "Wake listener started."

while ($true) {
  $engine.UnloadAllGrammars()
  $engine.LoadGrammar($wakeGrammar)

  $wakeResult = $engine.Recognize()
  if (-not $wakeResult -or -not $wakeResult.Text) {
    continue
  }

  if ($wakeResult.Text.Trim().ToLowerInvariant() -ne $WakePhrase.Trim().ToLowerInvariant()) {
    continue
  }

  Write-WakeEvent -State "heard" -Message "Wake phrase heard."
  Write-WakeEvent -State "command-listening" -Message "Listening for your command."
  Start-Sleep -Seconds $CommandTimeoutSeconds
  Write-WakeEvent -State "running" -Message "Wake listener resumed."
}
