# PodGrip installer for Windows (per-user, no admin rights needed), from the source folder.
#   - copies the panel (CSXS, client, host, engine, lib) to %APPDATA%\Adobe\CEP\extensions\PodGrip
#   - checks that unsigned CEP panels are allowed (PlayerDebugMode), which PodCutter's installer turns on,
#     and turns it on only where it's missing
# ffmpeg comes from PodCutter's (or the older PodDirector's) installed panel; PodGrip doesn't bundle its own yet.
#   powershell -ExecutionPolicy Bypass -File install\install.ps1 [-Uninstall]
param([switch]$Uninstall)

$ErrorActionPreference = "Stop"
$target = Join-Path $env:APPDATA "Adobe\CEP\extensions\PodGrip"
$source = Split-Path $PSScriptRoot -Parent

function Say($msg, $color = "Gray") { Write-Host $msg -ForegroundColor $color }

if ($Uninstall) {
  if (Test-Path $target) { Remove-Item $target -Recurse -Force; Say "Removed $target" Green } else { Say "PodGrip is not installed." }
  exit 0
}

if (-not (Test-Path (Join-Path $source "CSXS\manifest.xml"))) { Say "Can't find PodGrip's CSXS\manifest.xml in $source" Red; exit 1 }

Say "Installing PodGrip to $target ..." Cyan
New-Item -ItemType Directory -Force -Path $target | Out-Null
foreach ($dir in "CSXS", "client", "host", "engine", "lib") {
  robocopy (Join-Path $source $dir) (Join-Path $target $dir) /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { Say "Copy of $dir failed (robocopy code $LASTEXITCODE)." Red; exit 1 }
}
Get-ChildItem -Path $target -Recurse -File | Unblock-File -ErrorAction SilentlyContinue

foreach ($v in 9..13) {
  $key = "HKCU:\Software\Adobe\CSXS.$v"
  $now = (Get-ItemProperty $key -ErrorAction SilentlyContinue).PlayerDebugMode
  if ($now -ne "1") {
    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
    New-ItemProperty -Path $key -Name "PlayerDebugMode" -Value "1" -PropertyType String -Force | Out-Null
    Say "  allowed unsigned panels for CSXS.$v" Yellow
  }
}

$ffs = "PodCutter", "PodDirector" | ForEach-Object { Join-Path $env:APPDATA "Adobe\CEP\extensions\$_\vendor\ffmpeg\win32-x64\ffmpeg.exe" } | Where-Object { Test-Path $_ }
if ($ffs) { Say "  ffmpeg ........ OK ($($ffs[0]))" Green } else { Say "  ffmpeg ........ not found: install PodCutter, or put ffmpeg on PATH" Yellow }

Say ""
Say "Done! Restart Premiere Pro, then open:  Window > Extensions > PodGrip" Green
