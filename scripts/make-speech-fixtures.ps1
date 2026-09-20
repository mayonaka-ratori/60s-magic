$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$CasesFile = if ($args.Length -gt 0) { $args[0] } else { '' }
$speechRoot = Split-Path -Parent $PSScriptRoot
$speechOutput = Join-Path $speechRoot '.local-speech/test-audio'
New-Item -ItemType Directory -Path $speechOutput -Force | Out-Null
$speechSynth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $speechSynth.SelectVoice('Microsoft Haruka Desktop')
    $speechSynth.Rate = 0
    $speechFormat = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    $speechCases = @(
        @{ id='ice'; text='氷よ、壁となれ。'; expected='氷' },
        @{ id='seven'; text='雷よ、七つに分かれろ。'; expected='七つ' },
        @{ id='correction'; text='雷ではなく、氷よ、壁となれ。'; expected='氷' },
        @{ id='negation'; text='攻撃しないで、我を守れ。'; expected='守' }
    )
    if ($CasesFile) { $speechCases = Get-Content -LiteralPath $CasesFile -Raw -Encoding UTF8 | ConvertFrom-Json }
    foreach ($speechCase in $speechCases) {
        $speechSynth.SetOutputToWaveFile((Join-Path $speechOutput ($speechCase.id + '.wav')), $speechFormat)
        $speechSynth.Speak($speechCase.text)
        $speechSynth.SetOutputToNull()
    }
    $speechCases | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $speechOutput 'cases.json') -Encoding UTF8
    Write-Output '確認用の日本語音声をPC内で作りました。実際の人の声とは分けて記録します。'
} finally { $speechSynth.Dispose() }
