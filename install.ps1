# Installs the office mod and links the team skill on Windows.
# .\install.ps1 -StatusLine          also configure Claude Code's status line
# .\install.ps1 -Sidebar             also add an "辦公室" toggle to the right sidebar (clones main layout and tabs mod)
# .\install.ps1 -DryRun -StatusLine  preview only; no files are changed
param([switch]$DryRun, [switch]$StatusLine, [switch]$Sidebar, [switch]$Force)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$nodeCommand = Get-Command node -CommandType Application -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw 'Node.js 20 or newer is required. Install Node.js LTS and reopen PowerShell.' }
$nodeVersionText = & $nodeCommand.Source --version
if ($LASTEXITCODE -ne 0 -or $nodeVersionText -notmatch '^v(\d+)\.') { throw "Could not read the Node.js version: $nodeVersionText" }
if ([int]$Matches[1] -lt 20) { throw "Node.js 20 or newer is required (found $nodeVersionText). Upgrade Node.js and reopen PowerShell." }
$herdrCommand = Get-Command herdr-app -CommandType Application -ErrorAction SilentlyContinue
if (-not $herdrCommand) { throw 'herdr-app was not found on PATH. Install Herdr Desktop, add its folder to PATH, and reopen PowerShell.' }
Write-Host "[check] Node.js $nodeVersionText; Herdr: $($herdrCommand.Source)"
. (Join-Path $root 'scripts\statusline.ps1')
if ($StatusLine) { Set-OfficeStatusLine -UserDirectory $HOME -DryRun -Force:$Force }
Write-Host '[mod] mirror mods/office into the Herdr app'
if (-not $DryRun) {
    & $nodeCommand.Source (Join-Path $root 'scripts\sync.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Mod synchronization failed; installation stopped.' }
}
$skill = Join-Path $root 'skills\herdr-team'
$targets = [ordered]@{
    'claude'      = Join-Path $HOME '.claude\skills'
    'codex'       = Join-Path $HOME '.codex\skills'
    'antigravity' = Join-Path $HOME '.gemini\config\skills'
}
foreach ($tool in $targets.Keys) {
    $dir = $targets[$tool]
    $link = Join-Path $dir 'herdr-team'
    if (Test-Path -LiteralPath $link) {
        $item = Get-Item -LiteralPath $link -Force
        $current = if ($item.LinkType) { [string]($item.Target | Select-Object -First 1) } else { $null }
        if ($current -and ((Resolve-Path -LiteralPath $current -ErrorAction SilentlyContinue).Path -eq (Resolve-Path -LiteralPath $skill).Path)) {
            Write-Host "[$tool] ok      herdr-team" -ForegroundColor DarkGray
            continue
        }
        if (-not $item.LinkType) { throw "$link is a real folder; move it away first" }
        Write-Host "[$tool] relink  herdr-team (was -> $current)" -ForegroundColor Yellow
        if (-not $DryRun) { $item.Delete() }
    } else { Write-Host "[$tool] link    herdr-team" -ForegroundColor Green }
    if (-not $DryRun) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        New-Item -ItemType Junction -Path $link -Target $skill | Out-Null
    }
}
if ($StatusLine -and -not $DryRun) { Set-OfficeStatusLine -UserDirectory $HOME -Force:$Force }
if ($Sidebar) {
    $sidebarArgs = @((Join-Path $root 'scripts\sidebar.mjs'))
    if ($DryRun) { $sidebarArgs += '--dry-run' }
    & $nodeCommand.Source @sidebarArgs
    if ($LASTEXITCODE -ne 0) { throw 'Sidebar setup failed.' }
}
if ($DryRun) { Write-Host ''; Write-Host 'Dry run only, nothing changed.' }
