# AMD bug report: GPU kernel launches fault while allocation succeeds

**Product:** ROCm on Windows (HIP SDK 7.2 / `torch 2.9.1+rocm7.2.1`)
**GPUs:** AMD Radeon RX 9060 XT (gfx1200, RDNA4) **and** AMD Radeon(TM) Graphics (gfx1036, integrated)
**Severity:** blocking - no GPU compute possible on either GPU
**Captured:** 2026-10-03
**Reproduce with:** `training/training/new_dataset_1/diagnose_gpu.ps1`

---

## 1. Summary

On this system **every GPU kernel launch crashes** the process with a Windows access
violation (`0xC0000005`), while **context creation and device memory allocation succeed**.
The failure is reproducible with a six-line HIP program that uses no framework at all:
`hipMalloc` returns `0`, and the next line - `hipMemset`, which launches a memset kernel -
terminates the process before it can print its return code.

It fails **identically on both AMD GPUs in the machine**, the discrete RX 9060 XT and the
integrated gfx1036. Because two different GPUs (different architectures, different driver
versions) fail the same way, this is not a defect in one card's hardware.

Everything above the GPU driver behaves correctly: the HIP runtime enumerates devices,
creates contexts, allocates and frees memory, and synchronises. Only kernel execution fails.

---

## 2. System

| item | value |
| --- | --- |
| OS | Windows 11, build 10.0.26200 |
| CPU | AMD, 16 logical cores |
| GPU 0 | **AMD Radeon RX 9060 XT**, `gfx1200` (RDNA4), 17.1 GB |
| GPU 0 driver | **32.0.31041.1004** (2026-08-17), `oem12.inf` / `u0203304.inf` |
| GPU 1 | **AMD Radeon(TM) Graphics**, `gfx1036` (integrated), 6.6 GB |
| GPU 1 driver | 32.0.21045.1000 (2026-08-11) |
| AMD Software | 26.8.1 (`RadeonSoftwareVersion`) |
| AMD WVR64 / AMD DVR | 26.10.26223.2124 / 26.10.26223.2125 |
| AMD Install Manager | 26.10.26223.2118 |
| HIP SDK | 7.2, build `7.2.60201-38d754472` (`C:\Program Files\AMD\ROCm\7.2`) |
| pip ROCm runtime | `rocm` 7.2.1, `rocm-sdk-core` 7.2.1, HIP `7.2.53211-158bd99533` |
| PyTorch | `2.9.1+rocm7.2.1` |
| Python | 3.12 |

---

## 3. Minimal reproduction (no PyTorch, no framework)

````python
import ctypes
h = ctypes.WinDLL(r"C:\sentinel-gpu\Lib\site-packages\_rocm_sdk_core\bin\amdhip64_7.dll")
h.hipInit(ctypes.c_uint(0))
h.hipSetDevice(ctypes.c_int(0))
buf = ctypes.c_void_p()
print("hipMalloc rc =", h.hipMalloc(ctypes.byref(buf), ctypes.c_size_t(1 << 20)), flush=True)
print("hipMemset rc =", h.hipMemset(buf, ctypes.c_int(0), ctypes.c_size_t(1 << 20)), flush=True)
````

**Observed output - the process dies at `hipMemset`:**

````
hipMalloc rc = 0
<process terminates: Windows fatal exception: access violation, 0xC0000005>
````

The `hipMemset` line never prints, so the crash happens inside `hipMemset`, i.e. during
kernel dispatch. `hipMalloc` on the line before returns success, so allocation and the
context are both fine.

**Same result when the discrete GPU is hidden and only the iGPU is exposed**
(`HIP_VISIBLE_DEVICES=1`), and when the SDK's own copy of the runtime is loaded by
absolute path instead of the pip wheel's copy.

Extended sequence that isolates it further (all from the same process):

| call | result |
| --- | --- |
| `hipInit(0)` | `rc = 0` |
| `hipGetDeviceCount()` | `rc = 0`, **2 devices** (1 when `HIP_VISIBLE_DEVICES=0`, 0 when empty) |
| `hipSetDevice(0)` | `rc = 0` |
| `hipMemGetInfo()` **before any allocation** | `rc = 1` (`hipErrorInvalidValue`) |
| `hipMalloc(1 MB)` | `rc = 0` |
| `hipMemGetInfo()` **after the allocation** | `rc = 0`, `free = 15.86 GB` |
| `hipFree()` | `rc = 0` |
| `hipDeviceSynchronize()` | `rc = 0` |
| **`hipMemset(1 MB)`** | **process terminates - access violation** |

Note the `hipMemGetInfo` row: it returns `hipErrorInvalidValue` only when called **before
a context exists**; after a `hipMalloc` it reports memory correctly. We mention it because
it may be the intended behaviour, but it is worth confirming - and it misled our initial
diagnosis.

---

## 4. Equivalent failure through PyTorch

Driven by `torch` in a fresh process:

| operation | result |
| --- | --- |
| `torch.cuda.is_available()` | `True` |
| `torch.cuda.init()` | succeeds |
| `torch.cuda.get_device_properties(0)` | `AMD Radeon RX 9060 XT`, `gcnArchName=gfx1200` |
| `torch.cuda.caching_allocator_alloc(4096)` | **succeeds** (returns a pointer) |
| `torch.cuda.Stream()` / `Event()` | succeed |
| `torch.zeros(4, device="cuda")` | **access violation** (zero-fill launches a kernel) |
| `torch.zeros(4).cuda()` | **access violation** (H2D copy launches a kernel) |
| `torch.randn(2048,2048,device="cuda") @ x` | **access violation** |

So allocation through torch also works; anything that reaches a kernel dies. This matches
the raw-HIP reproduction exactly.

---

## 5. What we ruled out (each actually tested)

| hypothesis | test | outcome |
| --- | --- | --- |
| insufficient VRAM | Windows GPU counters | 1.5 GB used of 17.1 GB |
| wrong/incomplete ROCm install | 19 HIP DLLs in the pip wheel vs the SDK | **byte-identical** (sha256); loading the SDK's `amdhip64_7.dll` by absolute path behaves the same |
| corrupt venv / torch package | full `setup_gpu_amd.sh` re-run | completed with **zero packages installed** - nothing was corrupt |
| driver file corruption | clean driver reinstall | see section 6 - the install was a **no-op** (version unchanged, DriverStore unchanged) |
| PATH pollution | ran with a minimal PATH | same failure |
| temp-path bug (known ROCm/Windows issue) | `TEMP`/`TMP` moved to `%LOCALAPPDATA%\Temp` | still fails |
| cwd containing a space (known ROCm/Windows issue) | all checks run from `C:\sentinel-gpu` | still fails |
| missing gfx1200 code objects | search of the ROCm libraries | **343 gfx1200 files present** |
| wrong code-object arch | `HSA_OVERRIDE_GFX_VERSION=11.0.0` | still fails |
| mismatched device bitcode | `HIP_DEVICE_LIB_PATH` unset, and pointed at the SDK's own bitcode | still fails |
| a virtual display device | `SudoMaker Virtual Display Adapter` disabled | still fails |
| llama.cpp servers holding the GPU | stopped | still fails |
| a specific GPU's hardware | tested the integrated GPU instead | **fails there too** |

Also tried, all ineffective: `PYTORCH_NO_CUDA_MEMORY_CACHING=1`,
`PYTORCH_CUDA_ALLOC_CONF=expandable_segments:False`, `AMD_SERIALIZE_KERNEL=3`,
`HSA_ENABLE_SDMA=0`, `HIP_VISIBLE_DEVICES=0`.

Because **both** GPUs fail, and both work at every stage *except* kernel dispatch, the
fault is in the shared kernel-execution path (the AMD kernel-mode driver / ROCm dispatch),
below any user-space software.

---

## 6. One unresolved observation: the driver reinstall was a no-op

After attempting a driver reinstall:

* reported driver version **unchanged**: `32.0.31041.1004`
* no new DriverStore package: the newest `amdwin-u0203304.inf_amd64_*` is dated **Sep 24**
* `oem12.inf` still **Sep 24**
* `C:\AMD\AMD-Software-Installer\Bin64\*.tmp` was created **today**, and
  `PendingFileRenameOperations` holds 12 entries

So the installer appears to have skipped the same version rather than replacing it, and a
genuine replacement has not yet been performed. We mention this because it means "driver
reinstall did not fix it" is weak evidence in this report - it may be that no reinstall
actually occurred. We intend to force one with DDU and will update this report.

Related: the installed AMD components are on **mixed branches** - AMD Software 26.8.1 while
WVR64 / DVR / Install Manager are 26.10.x, with `AMD Install Manager` installed on
**2026-10-02**, the day before the fault appeared.

---

## 7. Timeline

| time | event |
| --- | --- |
| 2026-10-02 10:12 | last successful ROCm workload on this machine (model fine-tuning) |
| 2026-10-02 | `AMD Install Manager 26.10.26223.2118` installed |
| 2026-10-03 | every GPU kernel launch faults; many reboots, no change |
| 2026-10-03 | `C:\AMD\AMD-Software-Installer` staging created |

---

## 8. What we would like to know

1. Is there a known issue matching **"allocation succeeds, every kernel launch faults"**
   on RDNA4 (gfx1200) with the Adrenalin 26.x / `32.0.31xxx` driver branch on Windows 11?
2. Is there a **diagnostic tool** (or registry/ETW setting) that reports *why* the kernel
   dispatch fails, rather than an access violation?
3. Does `gfx1200` have a **minimum or maximum** driver version for ROCm 7.2 on Windows? The
   ROCm Windows docs we could find list the RX 9060 XT as supported but state no driver
   version, so we could not tell whether `32.0.31041.1004` is a validated pairing.
4. Is the `hipMemGetInfo -> hipErrorInvalidValue` result before any context (section 3)
   expected?
5. Given the mixed AMD component versions in section 6, is there a recommended way to
   verify the display stack is internally consistent?

---

## 9. Attachments / how to regenerate this evidence

| file | purpose |
| --- | --- |
| `training/training/new_dataset_1/diagnose_gpu.ps1` | runs every check in sections 3-6 and prints a verdict; one command |
| `training/training/new_dataset_1/check_gpu.py` | the PyTorch-level check (section 4) |
| `training/training/new_dataset_1/README.md` section 7 | the same investigation written up for project use |

`diagnose_gpu.ps1` output on the affected system, abridged:

````
== 1. environment
  [PASS] GPU checks run from a space-free cwd   C:\sentinel-gpu
  [PASS] TEMP is usable                         TEMP='C:\Users\jenre\AppData\Local\Temp'
== 2. is the driver / HIP runtime healthy?
  device# 0   Name: AMD Radeon RX 9060 XT   multiProcessorCount: 16
  [PASS] hipInfo.exe enumerates the GPU
== 3. HIP runtime API: context, allocation, KERNEL LAUNCH
  RESULT hipGetDeviceCount=2
  RESULT hipMalloc=0
  [PASS] HIP context + allocation
  [FAIL] HIP KERNEL LAUNCH (hipMemset)
== 4. torch on the GPU
  Windows fatal exception: access violation   (check_gpu.py line 98, the matmul)
  [FAIL] check_gpu.py matmul
== 5. torch on the CPU (the fallback we rely on)
  CPU_OK 262144.0
  [PASS] CPU torch works
== 6. driver detail
  AMD Radeon RX 9060 XT   driver 32.0.31041.1004  (8/17/2026)
  AMD Software 26.8.1 | AMD WVR64 26.10.26223.2124 | AMD DVR 26.10.26223.2125
  AMD Install Manager 26.10.26223.2118
````

---

## 10. Workaround in the meantime

CPU execution is unaffected (`torch` on CPU works normally), so the project continues on
CPU via `training/training/new_dataset_1/run_cpu.ps1`. This is adequate for the current
workload - the training corpus is only 584 rows - but it is not a solution for larger runs.
