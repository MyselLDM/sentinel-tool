#Requires -Version 5.1
<#
  run_all_gpu.ps1 - run the full Sentinel training pipeline for ONE evaluation
  protocol on the GPU.

  PowerShell equivalent of run_all_gpu.sh. Progress goes to logs\run_<strategy>.log
  and a completion marker to logs\RUN_DONE_<strategy>; results are archived to
  logs\<strategy>\ so a second protocol's run cannot overwrite them.

  USAGE
    .\run_all_gpu.ps1                 # group (default) - the PRIMARY number
    .\run_all_gpu.ps1 stratified      # label-stratified k-fold
    .\run_all_gpu.ps1 cue             # concept-disjoint split

  PROTOCOLS
    group      = goal-grouped CV, unseen goals -> the PRIMARY number
    stratified = label-stratified k-fold, what the reference fine-tune script did
    cue        = the concept-disjoint split (data\cue_split.csv); the test set's
                 overreach KINDS are unseen -> the secondary/robustness number

  Everything it writes stays inside this folder: logs\, models\.

  Follow the run with:
    Get-Content .\logs\run_group.log -Wait

  Overrides (environment variables, not parameters):
    SENTINEL_GPU_VENV      default C:\sentinel-gpu
    SENTINEL_ROCM_RUNTIME  default C:\TheRock\build\bin

  If PowerShell refuses to run the file:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\run_all_gpu.ps1 group

  IMPORTANT: stop the local llama.cpp servers before running. They hold the same
  GPU, and a wedged HIP context is the usual cause of an access violation at the
  first kernel (see README "GPU requirements").

  Exit code is 0 only when all three steps succeeded.
#>
param(
    [Parameter(Position = 0)]
    [ValidateSet('group', 'stratified', 'cue')]
    [string]$Strategy = 'group'
)

$ErrorActionPreference = 'Stop'

$Here = $PSScriptRoot
$Venv = if ($env:SENTINEL_GPU_VENV) { $env:SENTINEL_GPU_VENV } else { 'C:\sentinel-gpu' }
$Py = Join-Path $Venv 'Scripts\python.exe'
$LogDir = Join-Path $Here 'logs'
$Log = Join-Path $LogDir "run_${Strategy}.log"
$Status = Join-Path $LogDir "run_${Strategy}.status"
$Archive = Join-Path $LogDir $Strategy
$Done = Join-Path $LogDir "RUN_DONE_${Strategy}"

if (-not (Test-Path -LiteralPath $Py)) {
    Write-Error "GPU venv python not found at $Py (set SENTINEL_GPU_VENV)"
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Remove-Item -LiteralPath $Done -ErrorAction SilentlyContinue

# A space-free working directory is mandatory for AMD ROCm on Windows: the HIP
# runtime latches the startup directory and aborts on a path containing a space
# (this repo is "D:\My Code\sentinel"). Set both PowerShell's location AND the
# process working directory - PowerShell 7's Set-Location alone does not always
# update the latter, and the child inherits it.
Set-Location -LiteralPath $Venv
[System.IO.Directory]::SetCurrentDirectory($Venv)

# Point the child at the ROCm user-mode runtime that can actually launch kernels.
# The venv's own ROCm 7.2 runtime faults on the very first kernel launch
# (hipMalloc OK, hipMemset -> 0xC0000005), so its bin directory must not win the
# DLL search. See common.preload_rocm_runtime for the measurements and
# run_gpu.ps1 for the same setup.
$RocmRuntime = if ($env:SENTINEL_ROCM_RUNTIME) { $env:SENTINEL_ROCM_RUNTIME } else { 'C:\TheRock\build\bin' }
if (Test-Path -LiteralPath $RocmRuntime) {
    $env:PATH = "$RocmRuntime;$env:PATH"
    $RocmBitcode = Join-Path (Split-Path -Parent $RocmRuntime) 'lib\llvm\amdgcn\bitcode'
    if (Test-Path -LiteralPath $RocmBitcode) { $env:HIP_DEVICE_LIB_PATH = $RocmBitcode }
}

# Surface native crashes (ROCm access violations) as Python tracebacks instead of
# the process dying silently. Pin the child's encoding on both sides so the log
# round-trips: the child writes UTF-8, and PowerShell decodes native output with
# [Console]::OutputEncoding - without this it reads those bytes as the OEM code
# page and tqdm's block glyphs land in the log as mojibake ("Γûê" for "█").
$env:PYTHONFAULTHANDLER = '1'
$env:PYTHONIOENCODING = 'utf-8'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

# The cue protocol reads its train/test assignment from row data, so it must load
# cue_split.csv; the CV protocols load the plain corpus (the holdout is never
# trained on - the frozen benchmark is scored separately by the trainer).
$Dataset = if ($Strategy -eq 'cue') {
    Join-Path $Here 'data\cue_split.csv'
} else {
    Join-Path $Here 'data\corpus_clean.csv'
}
if (-not (Test-Path -LiteralPath $Dataset)) {
    Write-Error "dataset not found: $Dataset"
}

# UTF-8 *without* a BOM: PowerShell 5.1's `-Encoding UTF8` writes a BOM, and
# `-Encoding ASCII` turned tqdm's block characters into '?' in the log.
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Add-LogText {
    param([string]$Text)
    [System.IO.File]::AppendAllText($script:Log, $Text + [Environment]::NewLine, $script:Utf8NoBom)
}

function Write-Log {
    param([string]$Message)
    Write-Host $Message
    Add-LogText $Message
}

function Write-LogOutput {
    # Child stderr arrives as an ErrorRecord whose .TargetObject is the raw text.
    # Do NOT use .ToString() here: for tqdm's \r-only line refreshes it degrades
    # to the exception's *type name* ("System.Management.Automation.RemoteException"),
    # which littered the log with ~40 junk lines on the first real run.
    param($Item)
    if ($Item -is [System.Management.Automation.ErrorRecord]) {
        $text = if ($null -ne $Item.TargetObject) {
            [string]$Item.TargetObject
        } else {
            [string]$Item.Exception.Message
        }
    } else {
        $text = [string]$Item
    }
    Add-LogText $text
}

function Invoke-Step {
    param([string]$Name, [string[]]$StepArgs)

    Write-Log "=== ${Name}: started $(Get-Date -Format o) ==="
    # Merge stderr into stdout so tqdm's progress lands in the log, and append as
    # it goes so `Get-Content -Wait` can follow the run. Two things are load-bearing:
    #   * ErrorActionPreference must be Continue around the call - with Stop, a
    #     native command writing to stderr while 2>&1 is active raises
    #     NativeCommandError and aborts the step;
    #   * the output must go through Write-LogOutput, which unwraps each
    #     ErrorRecord to its raw text. Piping the records straight to Out-File
    #     formats them with PowerShell's "At <file>:<line> char:<n> + CategoryInfo"
    #     decoration, which would bury the real log.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Py '-X' 'faulthandler' (Join-Path $Here $Name) @StepArgs 2>&1 |
            ForEach-Object { Write-LogOutput $_ }
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    Write-Log "=== ${Name}: exit=$code  $(Get-Date -Format o) ==="
    Add-Content -LiteralPath $Status -Value "$Name=$code" -Encoding ASCII
    return $code
}

# Fresh log + status for this run.
if (Test-Path -LiteralPath $Log) { Clear-Content -LiteralPath $Log }
else { New-Item -ItemType File -Path $Log -Force | Out-Null }
'running' | Set-Content -LiteralPath $Status -Encoding ASCII
Write-Log "started $(Get-Date -Format o)  protocol=$Strategy  venv=$Venv  dataset=$(Split-Path -Leaf $Dataset)"

# Both trainers take --fold-strategy and --dataset; compare_models.py pairs
# whatever is in logs\ (its --protocol flag is only for re-reading an archive).
# Every step runs even if an earlier one failed - the summary at the end is what
# says which.
$codes = [ordered]@{}
$codes['train_nli.py'] = Invoke-Step 'train_nli.py' @('--fold-strategy', $Strategy, '--dataset', $Dataset)
$codes['train_contrastive.py'] = Invoke-Step 'train_contrastive.py' @('--fold-strategy', $Strategy, '--dataset', $Dataset)
$codes['compare_models.py'] = Invoke-Step 'compare_models.py' @()

# Archive this protocol's results so the next protocol's run cannot clobber them.
New-Item -ItemType Directory -Force -Path $Archive | Out-Null
foreach ($f in 'nli_cv_results.json', 'contrastive_cv_results.json', 'comparison_results.json') {
    $source = Join-Path $LogDir $f
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $Archive -Force }
}
Write-Log "archived results -> $Archive"

Add-Content -LiteralPath $Status -Value "done $(Get-Date -Format o)" -Encoding ASCII
Write-Log "DONE $(Get-Date -Format o)"
New-Item -ItemType File -Path $Done -Force | Out-Null

Write-Log ""
Write-Log "SUMMARY (exit codes; 0 = ok)"
foreach ($name in $codes.Keys) { Write-Log ("  {0,-22} {1}" -f $name, $codes[$name]) }
Write-Log ""
Write-Log "NOTE: report accuracy against the lexical ceiling in data\DATASET_V3.md section 4"
Write-Log "      (a bag of words scores AUC 0.981 on the concept-disjoint split)."

if (($codes.Values | Where-Object { $_ -ne 0 }).Count -gt 0) { exit 1 }
exit 0
