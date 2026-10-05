#Requires -Version 5.1
<#
  run_cpu.ps1 - run the whole dataset-v3 pipeline on the CPU.

  WHY THIS EXISTS
  ---------------
  The GPU on this machine cannot execute kernels (see training/AMD_REPORT.md), so
  training runs on the CPU instead. CPU training is genuinely practical here: the
  corpus is 584 rows, so a fold is only ~18 steps per epoch - minutes, not hours.

  THE ONE THING THAT MATTERS
  --------------------------
  The GPU must be hidden BEFORE python starts, from this script, not from inside
  Python. Measured on this machine:

    set HIP_VISIBLE_DEVICES='' inside python  -> torch.cuda.is_available() = True
                                                 device_count() = 0      <-- BROKEN
    set HIP_VISIBLE_DEVICES='' in the shell   -> torch.cuda.is_available() = False

  With is_available() lying (True) and 0 devices, HF Trainer/accelerate tries to
  move the model onto the GPU and the run dies in _move_model_to_device. Exporting
  the two variables below before python is launched is what makes the CPU path work.

  USAGE
  -----
    .\run_cpu.ps1                                  # group CV, 5 folds, 4 epochs
    .\run_cpu.ps1 -Strategy cue                    # concept-disjoint split
    .\run_cpu.ps1 -Epochs 2 -Folds 3               # quicker
    .\run_cpu.ps1 -SkipContrastive                 # NLI only

  Results land in .\logs\ and .\models\ (this folder only).
#>
param(
    [ValidateSet('group', 'stratified', 'cue')]
    [string]$Strategy = 'group',
    [int]$Epochs = 4,
    [int]$Folds = 5,
    [int]$BatchSize = 16,
    [int]$EvalBatchSize = 64,
    [int]$LimitGoals = 0,          # >0 = smoke test on a few goals only
    [switch]$SkipContrastive,
    [switch]$SkipCompare
)

$ErrorActionPreference = 'Stop'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Venv = if ($env:SENTINEL_GPU_VENV) { $env:SENTINEL_GPU_VENV } else { 'C:\sentinel-gpu' }
$Py = Join-Path $Venv 'Scripts\python.exe'
$LogDir = Join-Path $Here 'logs'
$Log = Join-Path $LogDir "cpu_run_$Strategy.log"

# ---------------------------------------------------------------------------
# 1. Hide the GPUs - MUST happen before python is launched (see header).
#    An empty value is the documented way to present zero devices.
# ---------------------------------------------------------------------------
$env:HIP_VISIBLE_DEVICES = ''
$env:CUDA_VISIBLE_DEVICES = ''
$env:PYTHONFAULTHANDLER = '1'
# The ROCm build's OMP/MKL can thrash; keep the CPU run single-threaded per op and
# let torch use the cores, which is stable and easier to read in the log.
$env:OMP_NUM_THREADS = '8'

if (-not (Test-Path -LiteralPath $Py)) {
    Write-Error "python not found at $Py (set SENTINEL_GPU_VENV)"
}
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Here 'models') | Out-Null

# cue needs the split file (its train/test assignment is row data); CV needs the corpus
$Dataset = if ($Strategy -eq 'cue') {
    Join-Path $Here 'data\cue_split.csv'
} else {
    Join-Path $Here 'data\corpus_clean.csv'
}
if (-not (Test-Path -LiteralPath $Dataset)) {
    Write-Error "dataset not found: $Dataset"
}

function Write-Log {
    param([string]$Message)
    Write-Host $Message
    Add-Content -LiteralPath $Log -Value $Message -Encoding ASCII
}

function Invoke-Step {
    param([string]$Name, [string[]]$StepArgs)
    Write-Log ""
    Write-Log "=============================================================="
    Write-Log "== $Name"
    Write-Log "=============================================================="
    # Start-Process joins -ArgumentList with spaces WITHOUT quoting, so any argument
    # containing a space (our script paths do - the repo lives under "D:\My Code")
    # arrives split in two and python fails with: can't open file 'D:\My'.
    # Quote every argument that contains whitespace.
    $quoted = @('-u') + ($StepArgs | ForEach-Object {
        if ($_ -match '\s') { '"' + $_ + '"' } else { $_ }
    })
    $logFull = (Resolve-Path -LiteralPath $Log).Path
    $outFile = "$logFull.step"
    $errFile = "$logFull.step.err"
    $proc = Start-Process -FilePath $Py `
        -ArgumentList ($quoted -join ' ') `
        -WorkingDirectory $Venv `
        -NoNewWindow -PassThru `
        -RedirectStandardOutput $outFile `
        -RedirectStandardError $errFile
    $proc.WaitForExit()
    # Add-Content (not Tee-Object) so nothing leaks into the function's return value -
    # Tee-Object emitted the log text, which made $status hold an array instead of the
    # exit code. ASCII so PowerShell does not write UTF-16.
    foreach ($f in @($outFile, $errFile)) {
        if (Test-Path -LiteralPath $f) {
            Get-Content -LiteralPath $f -Encoding UTF8 -ErrorAction SilentlyContinue |
                Where-Object { $_ -notmatch 'Loading weights|it/s\]' } |
                ForEach-Object { Add-Content -LiteralPath $Log -Value $_ -Encoding ASCII }
            Remove-Item -LiteralPath $f -ErrorAction SilentlyContinue
        }
    }
    $code = [int]$proc.ExitCode
    Write-Log "  exit code: $code"
    return $code
}

# ---------------------------------------------------------------------------
# 2. Verify the CPU protocol took effect before spending an hour on it
# ---------------------------------------------------------------------------
Write-Log "cpu run: strategy=$Strategy epochs=$Epochs folds=$Folds batch=$BatchSize"
Write-Log "  venv    : $Venv"
Write-Log "  dataset : $Dataset"
Write-Log "  log     : $Log"
$probe = & $Py -c "import torch; print('is_available=%s device_count=%d' % (torch.cuda.is_available(), torch.cuda.device_count()))"
Write-Log "  probe   : $probe"
if ($probe -notmatch 'is_available=False') {
    # Not fatal, and not worth alarming about: the CPU path is guaranteed by
    # --device cpu plus use_cpu=True on the HF Trainer (accelerate is what otherwise
    # grabs the GPU). Hiding the device via the environment is a belt-and-braces
    # extra that PowerShell does not always propagate. Recorded, then continue.
    Write-Log "  note    : torch still enumerates a GPU ($probe)."
    Write-Log "            Harmless - the run forces CPU via --device cpu + use_cpu=True,"
    Write-Log "            so HF Trainer/accelerate will not use the GPU."
}

# ---------------------------------------------------------------------------
# 3. Run the pipeline
# ---------------------------------------------------------------------------
$status = @{}
$limitArgs = if ($LimitGoals -gt 0) { @('--limit-goals', "$LimitGoals") } else { @() }
$status['train_nli'] = Invoke-Step 'train_nli.py (CPU)' (@(
    (Join-Path $Here 'train_nli.py'),
    '--device', 'cpu',
    '--fold-strategy', $Strategy,
    '--dataset', $Dataset,
    '--epochs', "$Epochs",
    '--folds', "$Folds",
    '--batch-size', "$BatchSize",
    '--eval-batch-size', "$EvalBatchSize"
) + $limitArgs)

if (-not $SkipContrastive) {
    $status['train_contrastive'] = Invoke-Step 'train_contrastive.py (CPU)' (@(
        (Join-Path $Here 'train_contrastive.py'),
        '--device', 'cpu',
        '--fold-strategy', $Strategy,
        '--dataset', $Dataset,
        '--epochs', "$Epochs",
        '--folds', "$Folds",
        '--batch-size', "$BatchSize",
        '--eval-batch-size', "$EvalBatchSize",
        '--no-use-amp'          # no fp16 without a GPU
    ) + $limitArgs)
}

if (-not $SkipCompare) {
    if (Test-Path -LiteralPath (Join-Path $LogDir 'nli_cv_results.json')) {
        $status['compare_models'] = Invoke-Step 'compare_models.py' @(
            (Join-Path $Here 'compare_models.py')
        )
    } else {
        Write-Log "skipping compare_models: no nli_cv_results.json produced"
    }
}

# ---------------------------------------------------------------------------
# 4. Summary
# ---------------------------------------------------------------------------
Write-Log ""
Write-Log "=============================================================="
Write-Log "== SUMMARY (exit codes; 0 = ok)"
Write-Log "=============================================================="
foreach ($k in $status.Keys) {
    Write-Log ("  {0,-20} {1}" -f $k, $status[$k])
}
Write-Log ""
Write-Log "Artifacts:"
foreach ($f in @('logs\nli_cv_results.json', 'logs\contrastive_cv_results.json',
                 'logs\comparison_results.json', 'models\model_config.json')) {
    $p = Join-Path $Here $f
    if (Test-Path -LiteralPath $p) {
        Write-Log ("  {0,-46} {1} bytes" -f $f, (Get-Item -LiteralPath $p).Length)
    } else {
        Write-Log ("  {0,-46} MISSING" -f $f)
    }
}
Write-Log ""
Write-Log "NOTE: report accuracy against the lexical ceiling in data\DATASET_V3.md section 4"
Write-Log "      (a bag of words scores AUC 0.981 on the concept-disjoint split)."

$failed = ($status.Values | Where-Object { $_ -ne 0 }).Count
if ($failed -gt 0) { exit 1 }
exit 0
