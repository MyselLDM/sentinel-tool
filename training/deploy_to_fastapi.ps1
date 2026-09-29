<#
.SYNOPSIS
    Deploy the trained models into the FastAPI service, atomically.

.DESCRIPTION
    Copying training/models/ into fastapi/.models/ by hand is NOT enough:

    1. fastapi/model_config.json must name the copied directories AND carry the
       trained thresholds - otherwise app/models.py raises (or, with
       ALLOW_BASE_FALLBACK=1, silently serves the UNTRAINED base models).
    2. That config is rewritten by compare_models.py on every training run, so it
       reflects whichever protocol finished LAST (run_protocols_gpu.sh ends with
       'sample', whose thresholds are optimistically tight). Use -Protocol group.
    3. The service reads the config once at startup, so it must be restarted.

    This script does all of it and VERIFIES the result before you restart.

.PARAMETER Protocol
    Which evaluation protocol's thresholds to deploy. group (default) is the
    primary protocol: calibrated on unseen goals, which is what production sees.

.PARAMETER DryRun
    Show what would happen without changing anything.

.PARAMETER Verify
    Run this AFTER restarting the service: assert it is serving trained models.

.EXAMPLE
    .\deploy_to_fastapi.ps1
    .\deploy_to_fastapi.ps1 -Protocol sample -DryRun
    .\deploy_to_fastapi.ps1 -Verify
#>
[CmdletBinding()]
param(
    [ValidateSet('group', 'stratified', 'sample')]
    [string]$Protocol = 'group',
    [switch]$DryRun,
    [switch]$Verify
)

$ErrorActionPreference = 'Stop'

$Here = $PSScriptRoot
$Repo = Split-Path -Parent $Here
$Src = Join-Path $Here 'models'
$Dest = Join-Path $Repo 'fastapi\.models'
$SrcCfg = Join-Path $Src 'model_config.json'
# The service reads settings.model_config_path = fastapi\model_config.json.
# NOT fastapi\.models\model_config.json - a config left inside the models dir is
# never read, and a stale one there is actively misleading.
$DestCfg = Join-Path $Repo 'fastapi\model_config.json'

function Say { param([string]$Message) Write-Host $Message }
function Step { param([string]$Message) Write-Host ''; Write-Host "==> $Message" }
function Die { param([string]$Message) Write-Host "ERROR: $Message" -ForegroundColor Red; exit 1 }

function Read-Cfg {
    param([string]$Path)
    return (Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json)
}

function Get-Prop {
    param($Object, [string]$Name)
    if ($null -eq $Object) { return $null }
    if ($Object.PSObject.Properties.Name -contains $Name) { return $Object.$Name }
    return $null
}

function Find-Python {
    $candidates = @()
    if ($env:SENTINEL_PYTHON) { $candidates += $env:SENTINEL_PYTHON }
    if ($env:SENTINEL_GPU_VENV) { $candidates += (Join-Path $env:SENTINEL_GPU_VENV 'Scripts\python.exe') }
    $candidates += 'C:\sentinel-gpu\Scripts\python.exe'
    $candidates += (Join-Path $Repo 'fastapi\.venv\Scripts\python.exe')
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
    }
    return $null
}

function Invoke-CompareModels {
    # Regenerates models/model_config.json from the archived logs of $Protocol.
    if ($DryRun) {
        Say "    [dry-run] $Py compare_models.py --protocol $Protocol"
        return
    }
    & $Py (Join-Path $Here 'compare_models.py') --protocol $Protocol | Out-Null
    if ($LASTEXITCODE -ne 0) { Die 'compare_models.py failed' }
}

function Remove-Dir {
    param([string]$Path)
    if ($DryRun) { Say "    [dry-run] Remove-Item -Recurse -Force '$Path'" }
    else { Remove-Item -LiteralPath $Path -Recurse -Force }
}

function Copy-Dir {
    param([string]$From, [string]$To)
    if ($DryRun) { Say "    [dry-run] Copy-Item -Recurse '$From' -> '$To'" }
    else { Copy-Item -LiteralPath $From -Destination $To -Recurse -Force }
}

$Py = Find-Python
if (-not $Py) { Die 'no python found; set SENTINEL_PYTHON' }

# -- -Verify: run this AFTER restarting the service --------------------------
if ($Verify) {
    Step 'verifying the running FastAPI service (http://localhost:8000/health)'
    $url = 'http://localhost:8000/health'
    $code = 0
    $body = $null
    try {
        $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
        $code = [int]$resp.StatusCode
        $body = $resp.Content | ConvertFrom-Json
    }
    catch {
        $response = $_.Exception.Response
        if ($response) {
            $code = [int]$response.StatusCode
            $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
            $body = $reader.ReadToEnd() | ConvertFrom-Json
        }
        else {
            Say "  could not reach $url : $($_.Exception.Message)"
            Say '  is the service running?  (cd fastapi; ./run.sh)'
            exit 1
        }
    }
    Say "  HTTP $code  status=$($body.status)  ready=$($body.ready)  on_base_models=$($body.on_base_models)"
    Say "  nli=$($body.nli_version)  contrastive=$($body.contrastive_version)"
    if ($body.model_error) { Say "  model_error: $($body.model_error)" }
    if ($body.on_base_models -eq $false -and $body.ready) {
        Say '  OK - serving the trained models.'
        exit 0
    }
    Say '  NOT READY - the service is not serving trained models (see above).'
    exit 1
}

Say 'Sentinel model deploy'
Say "  source      : $Src"
Say "  destination : $Dest"
Say "  protocol    : $Protocol"
if ($DryRun) { Say '  mode        : DRY RUN' }

# -- 1. make sure the config matches the requested protocol ------------------
Step "1/5 config for protocol '$Protocol'"
$needRegen = $false
if (-not (Test-Path -LiteralPath $SrcCfg)) {
    $needRegen = $true
    Say "  no $SrcCfg - generating it"
}
else {
    $cfg = Read-Cfg $SrcCfg
    $have = Get-Prop $cfg 'protocol_key'
    if (-not $have) { $have = Get-Prop $cfg 'protocol' }
    if ($have -ne $Protocol) {
        $needRegen = $true
        Say "  config was built from '$have'; regenerating from '$Protocol'"
    }
    else {
        Say "  already '$Protocol' - leaving it alone"
    }
}
if ($needRegen) { Invoke-CompareModels }

$cfg = Read-Cfg $SrcCfg
$NliDir = $cfg.nli.model_dir
$ConDir = $cfg.contrastive.model_dir
$NliThr = $cfg.nli.threshold
$ConThr = $cfg.contrastive.threshold
Say "  nli         : $NliDir  (threshold $NliThr)"
Say "  contrastive : $ConDir  (threshold $ConThr)"

# -- 2. the source must actually be complete ---------------------------------
Step '2/5 checking source models'
foreach ($dir in @($NliDir, $ConDir)) {
    $path = Join-Path $Src $dir
    if (-not (Test-Path -LiteralPath $path)) { Die "missing source directory: $path" }
    $weights = Join-Path $path 'model.safetensors'
    if (-not (Test-Path -LiteralPath $weights)) { Die "missing weights: $weights" }
    $mb = [math]::Round((Get-Item -LiteralPath $weights).Length / 1MB)
    Say "  ok  $dir  ($mb MB weights)"
}

# -- 3. prune ONLY stale copies of our two models (never the directory) ------
Step '3/5 pruning stale model dirs in the destination'
if (-not (Test-Path -LiteralPath $Dest)) {
    Say "  creating $Dest"
    if (-not $DryRun) { New-Item -ItemType Directory -Path $Dest | Out-Null }
}
$present = @(Get-ChildItem -LiteralPath $Dest -Directory -ErrorAction SilentlyContinue)
foreach ($item in $present) {
    $isOurs = ($item.Name -like 'sentinelagent-nli-*') -or ($item.Name -like 'contrastive-miniLM-*')
    if (-not $isOurs) { continue }
    if ($item.Name -eq $NliDir) { continue }
    if ($item.Name -eq $ConDir) { continue }
    Say "  removing stale: $($item.Name)"
    Remove-Dir -Path $item.FullName
}
$strayCfg = Join-Path $Dest 'model_config.json'
if (Test-Path -LiteralPath $strayCfg) {
    Say "  removing stray $strayCfg (unused; the service reads $DestCfg)"
    if ($DryRun) { Say "    [dry-run] Remove-Item '$strayCfg'" }
    else { Remove-Item -LiteralPath $strayCfg -Force }
}

# -- 4. copy the models and install the config -------------------------------
Step '4/5 copying models + config'
foreach ($dir in @($NliDir, $ConDir)) {
    $target = Join-Path $Dest $dir
    if (Test-Path -LiteralPath $target) { Remove-Dir -Path $target }
    Copy-Dir -From (Join-Path $Src $dir) -To $target
    if (-not $DryRun) { Say "  copied $dir" }
}
if ($DryRun) {
    Say "    [dry-run] Copy-Item '$SrcCfg' -> '$DestCfg'"
}
else {
    Copy-Item -LiteralPath $SrcCfg -Destination $DestCfg -Force
    Say '  installed model_config.json'
}

# -- 5. assert the installed config resolves (catches the silent fallback) ---
Step '5/5 verifying the installed config'
$problems = @()
foreach ($key in @('nli', 'contrastive')) {
    $entry = Get-Prop $cfg $key
    $name = Get-Prop $entry 'model_dir'
    $path = Join-Path $Dest $name
    if (-not $name) {
        $problems += "$key`: no model_dir configured"
        continue
    }
    if (-not (Test-Path -LiteralPath $path)) {
        $problems += "$key`: model_dir '$name' does not resolve under $Dest"
        continue
    }
    $weights = Join-Path $path 'model.safetensors'
    if (-not (Test-Path -LiteralPath $weights)) {
        $problems += "$key`: no model.safetensors in $path"
        continue
    }
    Say "  ok  $key`: $name  threshold=$($entry.threshold)"
}
if ($problems.Count -gt 0) {
    Say ''
    Say '  FAILED:'
    foreach ($problem in $problems) { Say "    - $problem" }
    exit 1
}
$protocolKey = Get-Prop $cfg 'protocol_key'
Say "  protocol recorded: $protocolKey"

Step 'done'
Say 'Restart the FastAPI service so it re-reads the config - a running process'
Say 'keeps the config it read at startup:'
Say "    cd `"$Repo\fastapi`"; ./run.sh"
Say ''
Say 'Then confirm it is serving the trained models:'
Say '    .\deploy_to_fastapi.ps1 -Verify'
