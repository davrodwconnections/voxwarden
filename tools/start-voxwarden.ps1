# David's local development launcher. Public installers are a separate release task.
$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runningCore = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
  $_.CommandLine -and $_.CommandLine.Contains((Join-Path $sourceRoot 'bridge\nqa.mjs')) -and $_.CommandLine -match '\bstart\b'
}
if ($runningCore) { exit 0 }
$runner = Join-Path $sourceRoot 'tools\voice\run-from-source.ps1'
$runnerArgs = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $runner + '" -Ai proxy -Model claude-code:sonnet -Persona orc-shaman -Companion'
Start-Process -FilePath 'powershell.exe' -ArgumentList $runnerArgs -WorkingDirectory $sourceRoot -WindowStyle Hidden
