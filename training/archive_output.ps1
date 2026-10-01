<#
.SYNOPSIS
    File one training session's outputs into .output/<timestamp>/.

.DESCRIPTION
    .output/ holds one folder per training session, named for the minute the
    session was filed. This script creates .output/<yyyy-MM-dd_HHmm>/ and MOVES
    training/logs, training/models and training/review into it, skipping any that
    are missing or empty, so the next run starts from a clean tree.

    Ordering matters: deploy_to_fastapi.ps1 / .sh reads training/models/model_config.json
    and, when it has to regenerate it, training/logs/<protocol>/. So archive AFTER
    deploying, or re-run the training that regenerates both.

.PARAMETER Name
    Optional label appended to the folder name, e.g. -Name v2-anchor-cv.

.PARAMETER DryRun
    Show what would move without moving anything.

.EXAMPLE
    .\archive_output.ps1
    .\archive_output.ps1 -Name v2-paraphrase-holdout
    .\archive_output.ps1 -DryRun
#>
[CmdletBinding()]
param(
    [string]$Name = '',
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$TrainingDir = $PSScriptRoot
$OutputRoot = Join-Path $TrainingDir '.output'
$Sources = @('logs', 'models', 'review')

function Say { param([string]$Message) Write-Host $Message }

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$leaf = $stamp
if ($Name) { $leaf = "$stamp-$Name" }

if (-not (Test-Path -LiteralPath $OutputRoot)) {
    Say "creating $OutputRoot"
    if (-not $DryRun) { New-Item -ItemType Directory -Path $OutputRoot | Out-Null }
}

# Two sessions can be filed in the same minute; never merge them.
$target = Join-Path $OutputRoot $leaf
$suffix = 1
while (Test-Path -LiteralPath $target) {
    $suffix++
    $target = Join-Path $OutputRoot "$leaf-$suffix"
}

Say 'Sentinel training session archive'
Say "  from : $TrainingDir"
Say "  to   : $target"
if ($DryRun) { Say '  mode : DRY RUN' }
Say ''

if (-not $DryRun) { New-Item -ItemType Directory -Path $target -Force | Out-Null }

$moved = @()
foreach ($source in $Sources) {
    $path = Join-Path $TrainingDir $source
    if (-not (Test-Path -LiteralPath $path)) {
        Say "  skip $source/ (does not exist)"
        continue
    }
    $entries = @(Get-ChildItem -LiteralPath $path -Force -ErrorAction SilentlyContinue)
    if ($entries.Count -eq 0) {
        Say "  skip $source/ (empty)"
        continue
    }
    $size = [math]::Round((Get-ChildItem -LiteralPath $path -Recurse -Force -File -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum).Sum / 1MB)
    Say "  move $source/  ($($entries.Count) entries, $size MB)"
    if (-not $DryRun) {
        Move-Item -LiteralPath $path -Destination (Join-Path $target $source)
    }
    $moved += $source
}

if ($moved.Count -eq 0) {
    Say ''
    Say '  nothing to archive - logs/, models/ and review/ are all missing or empty.'
    if (-not $DryRun) { Remove-Item -LiteralPath $target -Recurse -Force }
    exit 0
}

if ($DryRun) {
    Say ''
    Say '  dry run: nothing was moved.'
    exit 0
}

# A small manifest so a session folder explains itself later.
$gitHead = ''
try { $gitHead = (& git -C $TrainingDir rev-parse --short HEAD 2>$null) } catch { $gitHead = '' }
$manifest = @(
    "session   : $leaf"
    "archived  : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    "moved     : $($moved -join ', ')"
    "git HEAD  : $gitHead"
    "machine   : $env:COMPUTERNAME"
    "dataset   : see logs/*_cv_results.json -> dataset.path"
    ""
    "Reminder: logs/<protocol>/ and models/ are what deploy_to_fastapi.ps1 reads."
    "Archiving moves them out of the working tree - deploy first, or re-run training."
)
# WriteAllLines writes UTF-8 without a BOM; Set-Content -Encoding UTF8 does not.
[System.IO.File]::WriteAllLines((Join-Path $target 'session.txt'), [string[]]$manifest)

Say ''
Say "  archived -> $target"
Say "  manifest -> $(Join-Path $target 'session.txt')"
