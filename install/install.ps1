# PodGrip installer for Windows (per-user, no admin rights needed).
#   - copies the panel to %APPDATA%\Adobe\CEP\extensions\PodGrip
#     (from the release package's PodGrip folder, or, run from the source code, from CSXS, client, host, engine, lib)
#   - unblocks the bundled ffmpeg (downloaded zips are "blocked" by Windows)
#   - lets Premiere load unsigned CEP panels (PlayerDebugMode), which PodCutter's installer also does, where it isn't on
# Double-click "Install PodGrip.bat", or:  powershell -ExecutionPolicy Bypass -File install.ps1 [-Uninstall] [-Silent]
param([switch]$Uninstall, [switch]$Silent)  # -Silent: used by the in-panel updater

$ErrorActionPreference = "Stop"
$target = Join-Path $env:APPDATA "Adobe\CEP\extensions\PodGrip"

function Say($msg, $color = "Gray") { Write-Host $msg -ForegroundColor $color }

if (-not $Silent -and (Get-Process -Name "Adobe Premiere Pro" -ErrorAction SilentlyContinue)) {
  Say "Premiere Pro is running. Please save your work and close it, then press Enter to continue." Yellow
  [void](Read-Host)
}

if ($Uninstall) {
  if (Test-Path $target) { Remove-Item $target -Recurse -Force; Say "Removed $target" Green } else { Say "PodGrip is not installed." }
  exit 0
}

# The release package has the panel in a PodGrip folder next to this script; the source code has it one level up.
$package = Join-Path $PSScriptRoot "PodGrip"
if (Test-Path (Join-Path $package "CSXS\manifest.xml")) { $source = $package; $dirs = Get-ChildItem $package -Name }
elseif (Test-Path (Join-Path $PSScriptRoot "..\CSXS\manifest.xml")) { $source = Split-Path $PSScriptRoot -Parent; $dirs = "CSXS", "client", "host", "engine", "lib", "vendor" }
else { Say "Can't find the PodGrip panel next to this installer ($PSScriptRoot)." Red; exit 1 }

Say "Installing PodGrip to $target ..." Cyan
New-Item -ItemType Directory -Force -Path $target | Out-Null
foreach ($d in $dirs) {
  $from = Join-Path $source $d
  if (-not (Test-Path $from)) { continue }
  if (Test-Path $from -PathType Leaf) { Copy-Item $from (Join-Path $target $d) -Force; continue }
  robocopy $from (Join-Path $target $d) /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { Say "Copy of $d failed (robocopy code $LASTEXITCODE)." Red; exit 1 }
}
Get-ChildItem -Path $target -Recurse -File | Unblock-File -ErrorAction SilentlyContinue

foreach ($v in 9..13) {
  $key = "HKCU:\Software\Adobe\CSXS.$v"
  if ((Get-ItemProperty $key -ErrorAction SilentlyContinue).PlayerDebugMode -eq "1") { continue }
  if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
  New-ItemProperty -Path $key -Name "PlayerDebugMode" -Value "1" -PropertyType String -Force | Out-Null
}

$ff = (Join-Path $target "vendor\ffmpeg\win32-x64\ffmpeg.exe"), (Join-Path $env:APPDATA "Adobe\CEP\extensions\PodCutter\vendor\ffmpeg\win32-x64\ffmpeg.exe"),
  (Join-Path $env:APPDATA "Adobe\CEP\extensions\PodDirector\vendor\ffmpeg\win32-x64\ffmpeg.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($ff) { Say "  ffmpeg ........ OK" Green } else { Say "  ffmpeg ........ not found (install the release package, or PodCutter)" Yellow }

Say ""
Say "Done! Start (or restart) Premiere Pro, then open:  Window > Extensions > PodGrip" Green
