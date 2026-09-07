$ErrorActionPreference = 'Stop'
$repoPath = Split-Path $PSScriptRoot -Parent
Set-Location $repoPath

function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments=$true)][string[]]$GitArgs)
    & git @GitArgs
    if ($LASTEXITCODE -ne 0) { throw "Git failed: $($GitArgs[0]). No force push attempted." }
}

$branch = Invoke-Git branch --show-current
if ($branch -ne 'main') { throw 'Marketing sync requires the main branch.' }
$staged = Invoke-Git diff --cached --name-only
if ($staged) { throw 'Existing staged work found. Finish it before automatic marketing sync.' }
$allowedFiles = @('content/reviews.json','content/campaigns.json','content/creative-batches.json')
$tracked = Invoke-Git diff --name-only
foreach ($path in $tracked) {
    if ($path -notin $allowedFiles -and -not $path.StartsWith('images/creative/')) {
        throw "Unrelated tracked change in $path; leaving it untouched."
    }
}
Invoke-Git fetch origin main
$behind = Invoke-Git rev-list --count HEAD..origin/main
if ([int]$behind -gt 0) {
    $remoteChanged = Invoke-Git diff --name-only HEAD origin/main
    foreach ($path in $tracked) {
        if ($path -in $remoteChanged) { throw "Remote also changed $path; manual merge required." }
    }
    Invoke-Git merge --ff-only origin/main
}
foreach ($path in $allowedFiles) { if (Test-Path -LiteralPath $path) { Invoke-Git add -- $path } }
Invoke-Git add -- images/creative
$newStaged = Invoke-Git diff --cached --name-only
if ($newStaged) { Invoke-Git commit -m 'Refresh sourced reviews and campaign artwork [skip ci]' }
$ahead = Invoke-Git rev-list --count origin/main..HEAD
if ([int]$ahead -gt 0) { Invoke-Git push origin HEAD:main }
Write-Output 'Marketing inputs synced. Social publication still requires owner approval.'
