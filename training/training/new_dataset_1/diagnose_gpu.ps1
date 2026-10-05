#Requires -Version 5.1
<#
  diagnose_gpu.ps1 - one-command GPU triage for this machine.

  Built from the Oct 2026 investigation (see training/AMD_REPORT.md). Run this FIRST
  whenever ROCm or training breaks; it separates "the GPU is fine" from "the GPU
  cannot execute kernels" in about a minute, without touching the project code.

  USAGE
  -----
    .\diagnose_gpu.ps1
    .\diagnose_gpu.ps1 -Venv C:\sentinel-gpu

  Exit codes
    0  every check passed - the GPU can launch kernels
    1  a GPU check failed (the report will say which)
    2  setup problem (venv / python / SDK not found)
#>
param(
    [string]$Venv = $(if ($env:SENTINEL_GPU_VENV) { $env:SENTINEL_GPU_VENV } else { 'C:\sentinel-gpu' }),
    [string]$HipSdk = 'C:\Program Files\AMD\ROCm\7.2'
)

$ErrorActionPreference = 'Continue'
$Py = Join-Path $Venv 'Scripts\python.exe'
$results = [ordered]@{}

function Section {
    param([string]$Title)
    Write-Host ""
    Write-Host ("=" * 72)
    Write-Host "== $Title"
    Write-Host ("=" * 72)
}

function Check {
    param([string]$Name, [bool]$Ok, [string]$Detail)
    $results[$Name] = $Ok
    $tag = if ($Ok) { 'PASS' } else { 'FAIL' }
    Write-Host ("  [{0}] {1}" -f $tag, $Name) -ForegroundColor $(if ($Ok) { 'Green' } else { 'Red' })
    if ($Detail) { Write-Host "         $Detail" }
}

if (-not (Test-Path -LiteralPath $Py)) {
    Write-Host "python not found at $Py (set -Venv or SENTINEL_GPU_VENV)" -ForegroundColor Red
    exit 2
}

# Run everything from the venv (space-free). AMD ROCm on Windows aborts if the
# process starts in a path containing a space, and this folder has one - so the GPU
# checks must not run from here. Mirrors run_gpu.sh.
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $Venv

# ---------------------------------------------------------------------------
Section '1. environment'
Write-Host "  venv cwd     : $(Get-Location)   (GPU checks run here: space-free, required by ROCm)"
Write-Host "  script dir   : $ScriptDir"
foreach ($v in 'HIP_VISIBLE_DEVICES', 'CUDA_VISIBLE_DEVICES', 'HIP_PATH', 'HIP_DEVICE_LIB_PATH', 'TEMP', 'TMP') {
    $val = [Environment]::GetEnvironmentVariable($v)
    Write-Host ("  {0,-20}: '{1}'" -f $v, $val)
}
if ((Get-Location).Path -match ' ') {
    Check 'GPUs checks run from a space-free cwd' $false 'AMD ROCm aborts if the process starts in a path with a space'
} else {
    Check 'GPU checks run from a space-free cwd' $true "$(Get-Location)"
}
$tempOk = $env:TEMP -notmatch ' ' -and (Test-Path -LiteralPath $env:TEMP)
Check 'TEMP is usable' $tempOk "TEMP='$($env:TEMP)'"

# ---------------------------------------------------------------------------
Section '2. is the driver / HIP runtime healthy? (independent of torch)'
$hipInfo = Join-Path $HipSdk 'bin\hipInfo.exe'
if (Test-Path -LiteralPath $hipInfo) {
    $out = & $hipInfo 2>&1 | Select-Object -First 12
    $out | ForEach-Object { Write-Host "  $_" }
    Check 'hipInfo.exe enumerates the GPU' ([bool]($out -match 'Name:\s+AMD')) ''
} else {
    Check 'hipInfo.exe present' $false "not found at $hipInfo"
}

# ---------------------------------------------------------------------------
Section '3. HIP runtime API: context, allocation, KERNEL LAUNCH'
# The kernel-launch line is the decisive one. hipMemset launches a real kernel; if
# the process dies there while hipMalloc returned 0, the GPU cannot execute kernels
# and nothing in torch / the venv / this project can be at fault.
$probe = @'
import ctypes, sys
p = sys.argv[1]
h = ctypes.WinDLL(p)
h.hipInit(ctypes.c_uint(0))
n = ctypes.c_int(); h.hipGetDeviceCount(ctypes.byref(n))
h.hipSetDevice(ctypes.c_int(0))
buf = ctypes.c_void_p()
r_malloc = h.hipMalloc(ctypes.byref(buf), ctypes.c_size_t(1 << 20))
print(f"RESULT hipGetDeviceCount={n.value}")
print(f"RESULT hipMalloc={r_malloc}")
sys.stdout.flush()
# launches a memset KERNEL - the decisive step
r_memset = h.hipMemset(buf, ctypes.c_int(0), ctypes.c_size_t(1 << 20))
print(f"RESULT hipMemset={r_memset}")
sys.stdout.flush()
r_sync = h.hipDeviceSynchronize()
print(f"RESULT hipDeviceSynchronize={r_sync}")
'@
$probeFile = Join-Path $env:TEMP 'hip_probe.py'
Set-Content -LiteralPath $probeFile -Value $probe -Encoding ASCII
$dll = Join-Path $Venv 'Lib\site-packages\_rocm_sdk_core\bin\amdhip64_7.dll'
if (-not (Test-Path -LiteralPath $dll)) {
    Check 'amdhip64_7.dll present' $false $dll
} else {
    $probeOut = & $Py $probeFile $dll 2>&1
    $probeOut | ForEach-Object { Write-Host "  $_" }
    $joined = ($probeOut | Out-String)
    Check 'HIP context + allocation' ($joined -match 'hipMalloc=0') ''
    Check 'HIP KERNEL LAUNCH (hipMemset)' ($joined -match 'hipMemset=0') `
        'if this FAILS the GPU cannot execute kernels at all - nothing in torch/venv/project is at fault'
}
Remove-Item -LiteralPath $probeFile -ErrorAction SilentlyContinue

# ---------------------------------------------------------------------------
Section '4. torch on the GPU (the project check)'
$checkGpu = Join-Path $ScriptDir 'check_gpu.py'
if (Test-Path -LiteralPath $checkGpu) {
    $out = & $Py '-X' 'faulthandler' $checkGpu 2>&1
    $out | Where-Object { $_ -notmatch '^env |^    \[' } | Select-Object -Last 12 | ForEach-Object { Write-Host "  $_" }
    $joined = ($out | Out-String)
    Check 'check_gpu.py matmul' ($joined -match 'matmul\s+:\s+OK') ''
} else {
    Check 'check_gpu.py present' $false $checkGpu
}

# ---------------------------------------------------------------------------
Section '5. torch on the CPU (the fallback we rely on)'
$cpuOut = & $Py -c "import torch; a=torch.ones(64,64); print('CPU_OK', float((a@a).sum()))" 2>&1
$cpuOut | ForEach-Object { Write-Host "  $_" }
Check 'CPU torch works' ([bool](($cpuOut | Out-String) -match 'CPU_OK')) 'CPU training is the fallback - run_cpu.ps1 uses it'

# ---------------------------------------------------------------------------
Section '6. driver detail (for a bug report)'
$vc = Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue
foreach ($g in $vc) {
    Write-Host ("  {0,-34} driver {1}  ({2})" -f $g.Name, $g.DriverVersion, $g.DriverDate)
}
$amd = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -match 'AMD Software|AMD WVR|AMD DVR|Install Manager' } |
    Select-Object DisplayName, DisplayVersion
foreach ($a in $amd) { Write-Host ("  {0,-34} {1}" -f $a.DisplayName, $a.DisplayVersion) }
Write-Host ""
Write-Host "  NOTE: the driver version above should MATCH what you installed. If a reinstall"
Write-Host "        did not change it, the installer skipped the same version (check DriverStore"
Write-Host "        timestamps) - use DDU to force a real replacement."

# ---------------------------------------------------------------------------
Section 'VERDICT'
$gpuOk = $results['HIP KERNEL LAUNCH (hipMemset)']
$matmulOk = $results['check_gpu.py matmul']
Write-Host ""
if ($gpuOk -and $matmulOk) {
    Write-Host "  GPU is HEALTHY - run the training with the GPU:" -ForegroundColor Green
    Write-Host "      .\run_all_gpu.sh group"
} elseif (-not $gpuOk) {
    Write-Host "  GPU CANNOT LAUNCH KERNELS. This is below torch, the venv and this project." -ForegroundColor Red
    Write-Host "  1. DDU (Safe Mode) then install a DIFFERENT driver version, and confirm the"
    Write-Host "     version actually changed."
    Write-Host "  2. If it persists, capture this output and report it to AMD - see"
    Write-Host "     training/AMD_REPORT.md for what to include."
    Write-Host "  Meanwhile, train on the CPU:  .\run_cpu.ps1" -ForegroundColor Yellow
} else {
    Write-Host "  HIP kernels launch, but torch fails - the fault is in the torch/ROCm binding." -ForegroundColor Yellow
    Write-Host "  Try reinstalling the ROCm wheels (training/setup_gpu_amd.sh)."
    Write-Host "  Meanwhile, train on the CPU:  .\run_cpu.ps1" -ForegroundColor Yellow
}
Write-Host ""

$failed = ($results.Values | Where-Object { -not $_ }).Count
if ($failed -gt 0) { exit 1 }
exit 0
