# Preserves other settings and backs up existing settings before writing.
function Set-OfficeStatusLine {
    param([Parameter(Mandatory = $true)][string]$UserDirectory, [switch]$DryRun, [switch]$Force)
    $settingsPath = Join-Path $UserDirectory '.claude\settings.json'
    $scriptPath = ($UserDirectory.TrimEnd('\', '/') + '/.config/herdr-app/mods/office/statusline.mjs').Replace('\', '/')
    $command = if ($scriptPath -match '\s') { 'node "' + $scriptPath + '"' } else { 'node ' + $scriptPath }
    $settings = [pscustomobject]@{}
    $exists = Test-Path -LiteralPath $settingsPath
    if ($exists) {
        $settings = Get-Content -LiteralPath $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($null -eq $settings -or $settings -isnot [pscustomobject]) { throw "$settingsPath must contain a JSON object. Settings were not changed." }
    }
    $previous = $settings.PSObject.Properties['statusLine']
    if ($previous -and $previous.Value.type -eq 'command' -and $previous.Value.command -eq $command) {
        Write-Host '[statusLine] already configured' -ForegroundColor DarkGray
        return
    }
    if ($previous -and -not $Force) {
        Write-Warning "A different statusLine exists in $settingsPath. Kept it unchanged; use -StatusLine -Force to replace it."
        return
    }
    $backup = $settingsPath + '.bak-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fffffff')
    if ($DryRun) {
        if ($exists) { Write-Host "[statusLine] would back up $settingsPath -> $backup" }
        else { Write-Host "[statusLine] would create $settingsPath" }
        Write-Host "[statusLine] would set type=command; command=$command"
        return
    }
    if ($exists) { Copy-Item -LiteralPath $settingsPath -Destination $backup }
    else { New-Item -ItemType Directory -Force -Path (Split-Path -Parent $settingsPath) | Out-Null }
    $settings | Add-Member -MemberType NoteProperty -Name statusLine -Value ([pscustomobject]@{ type = 'command'; command = $command }) -Force
    $json = $settings | ConvertTo-Json -Depth 100
    [IO.File]::WriteAllText($settingsPath, $json + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
    Write-Host "[statusLine] configured $settingsPath"
}
