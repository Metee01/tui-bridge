# tui-bridge installer for Windows (PowerShell)
# Usage:
#   irm https://tui-bridge.vercel.app/install.ps1 | iex
#   irm https://tui-bridge.vercel.app/install.ps1 | iex -Args '--version','0.1.0'
#
# Pass a version by downloading and invoking locally:
#   curl -fsSL https://tui-bridge.vercel.app/install.ps1 -o install.ps1
#   .\install.ps1 -Version 0.1.0

[CmdletBinding()]
param(
    [string]$Version = "",
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$App = "tui-bridge"
$NpmName = "tui-bridge"
$RequiredNodeMajor = 22

if ($Help) {
    Write-Host "tui-bridge Installer (Windows)"
    Write-Host ""
    Write-Host "Usage: irm https://tui-bridge.vercel.app/install.ps1 | iex"
    Write-Host "       .\install.ps1 [-Version 0.1.0]"
    exit 0
}

function Write-Info($m) { Write-Host $m -ForegroundColor Gray }
function Write-Ok($m)   { Write-Host $m -ForegroundColor Green }
function Write-Err($m)  { Write-Host $m -ForegroundColor Red }

# 1. Node.js >= 22 check
$nodeMajor = 0
if (Get-Command node -ErrorAction SilentlyContinue) {
    try {
        $nodeVer = (node -e "process.stdout.write(process.versions.node)" 2>$null)
        if ($nodeVer) { $nodeMajor = [int]($nodeVer.Split(".")[0]) }
    } catch { }
}

if ($nodeMajor -lt $RequiredNodeMajor) {
    Write-Err "Node.js >= $RequiredNodeMajor is required."
    Write-Host ""
    Write-Info "Install Node.js LTS and re-run:"
    Write-Host "  winget install OpenJS.NodeJS.LTS"
    Write-Host "  or: https://nodejs.org/en/download"
    exit 1
}

# 2. npm check
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Err "npm was not found. It ships with Node.js -- reinstall Node.js $RequiredNodeMajor+."
    exit 1
}

# 3. Install
$spec = "$NpmName@latest"
if ($Version) { $spec = "$NpmName@$($Version.TrimStart('v'))" }

Write-Info "Installing $App via npm: $spec"

try {
    npm install -g $spec
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
} catch {
    Write-Err "npm install failed."
    Write-Host ""
    Write-Info "If this was a native build failure for node-pty, install build tools:"
    Write-Host "  winget install Microsoft.VisualStudio.2022.BuildTools"
    Write-Host '  (enable the "Desktop development with C++" workload)'
    exit 1
}

# 4. Verify
$installedVersion = ""
if (Get-Command $App -ErrorAction SilentlyContinue) {
    try {
        $line = (& $App --version 2>$null)
        if ($line) { $installedVersion = ($line -replace "^tui-bridge\s+", "").Trim() }
    } catch { }
}

if (-not $installedVersion) {
    Write-Host "$App installed but not on PATH." -ForegroundColor Yellow
    Write-Info "Restart your terminal, or add npm's global bin to PATH:"
    Write-Host "  npm config get prefix"
    $installedVersion = "(installed; restart your shell)"
}

# 5. Banner
Write-Host ""
Write-Ok "Installed $App $installedVersion"
Write-Host ""
Write-Info "Get started:"
Write-Host "  cd <project>      # the folder you want to work in"
Write-Host "  tui-bridge <tui>  # e.g. tui-bridge opencode"
Write-Host ""
Write-Info "Docs: https://tui-bridge.vercel.app/getting-started/"
Write-Host ""
