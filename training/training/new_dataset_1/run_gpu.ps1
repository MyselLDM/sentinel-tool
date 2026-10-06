<#
.SYNOPSIS
    Launch a Sentinel training script on the AMD GPU (Windows ROCm).

.DESCRIPTION
    PowerShell equivalent of run_gpu.sh.

    Why this wrapper exists: AMD's ROCm toolchain on Windows crashes with an
    access violation if the process *starts* in a directory whose path contains a
    space (this repo lives at "D:\My Code\sentinel"). This launches the script
    from a space-free working directory (the venv). All output paths are
    absolute, so nothing else changes.

    Requires the GPU venv created by setup_gpu_amd.sh (in Git Bash).

.EXAMPLE
    .\run_gpu.ps1 check_gpu.py
    .\run_gpu.ps1 train_nli.py
    .\run_gpu.ps1 train_nli.py --epochs 4 --batch-size 32
    .\run_gpu.ps1 train_contrastive.py --use-amp
    .\run_gpu.ps1 compare_models.py

.NOTES
    Override the venv location with the SENTINEL_GPU_VENV environment variable,
    and the ROCm user-mode runtime with SENTINEL_ROCM_RUNTIME.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Script,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ScriptArgs
)

$ErrorActionPreference = 'Stop'

$Venv = if ($env:SENTINEL_GPU_VENV) { $env:SENTINEL_GPU_VENV } else { 'C:\sentinel-gpu' }
$python = Join-Path $Venv 'Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {
    throw "GPU venv not found at '$Venv'. Build it with setup_gpu_amd.sh (Git Bash), or set SENTINEL_GPU_VENV."
}

$scriptPath = Join-Path $PSScriptRoot $Script
if (-not (Test-Path -LiteralPath $scriptPath)) {
    throw "Script not found: $scriptPath"
}

# A space-free working directory is mandatory for AMD ROCm on Windows.
# Set both PowerShell's location AND the process working directory: PowerShell 7's
# Set-Location alone does not always update the latter, and the child inherits it.
Set-Location -LiteralPath $Venv
[System.IO.Directory]::SetCurrentDirectory($Venv)

# Surface native crashes (ROCm access violations) as Python tracebacks instead of
# the process dying silently with no output.
$env:PYTHONFAULTHANDLER = '1'

# Point the child at the ROCm user-mode runtime that can actually launch kernels
# on this machine. The venv's own ROCm 7.2 runtime faults on the very first
# kernel launch (hipMalloc OK, hipMemset -> 0xC0000005), so its bin directory
# must not win the DLL search. See common.preload_rocm_runtime for the
# measurements; the scripts also pin this in-process before importing torch.
$RocmRuntime = if ($env:SENTINEL_ROCM_RUNTIME) { $env:SENTINEL_ROCM_RUNTIME } else { 'C:\TheRock\build\bin' }
if (Test-Path -LiteralPath $RocmRuntime) {
    $env:PATH = "$RocmRuntime;$env:PATH"
    $RocmBitcode = Join-Path (Split-Path -Parent $RocmRuntime) 'lib\llvm\amdgcn\bitcode'
    if (Test-Path -LiteralPath $RocmBitcode) { $env:HIP_DEVICE_LIB_PATH = $RocmBitcode }
}

& $python -X faulthandler $scriptPath @ScriptArgs
exit $LASTEXITCODE
