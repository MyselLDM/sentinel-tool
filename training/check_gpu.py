#!/usr/bin/env python3
"""Report whether PyTorch can actually use the GPU, and run a real kernel.

Use this before launching a training run to confirm acceleration works:

    <python> check_gpu.py

It prints the torch build, HIP/CUDA runtime, device name + arch, then runs a
matmul and (optionally) a tiny backprop on the GPU. Exit code is 0 only if a
GPU kernel genuinely executed.

Notes for AMD Radeon on Windows (ROCm build):
* AMD's ROCm PyTorch exposes the GPU through the *CUDA* API, so a working GPU
  shows up as ``torch.cuda.is_available() == True`` — no special device string.
* The ROCm device library must be findable. If a kernel launch crashes with
  ``ld.lld: error: undefined hidden symbol: __amd_*`` or an access violation in
  ``amdhip64_*.dll``, the runtime and its device libs are mismatched (usually a
  conflicting ROCm/TheRock install). See ``training/README.md``.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

# MUST run before `import torch`: the ROCm build loads amdhip64/COMGR at import
# time, and COMGR latches %TEMP% then. A space in that path crashes the first
# device op.
_moved_temp = C.ensure_space_free_temp()

import torch  # noqa: E402


def _env_report() -> None:
    """Print what decides *which* ROCm runtime/DLLs get loaded.

    A mismatched HIP/COMGR (e.g. a stale TheRock install earlier on PATH than the
    HIP SDK) lets the device enumerate but crashes on the first real device op.
    """
    interesting = (
        "HIP",
        "ROCM",
        "AMD",
        "CUDA",
        "HSA",
        "OMP",
        "MKL",
        "OPENCL",
        "TORCH",
        "ROCR",
        "MIOPEN",
        "GPU",
        "PYTORCH",
        "DEVICE",
        "TEMP",
        "TMP",
        "HOME",
        "USERPROFILE",
    )
    for key in sorted(os.environ):
        if any(token in key.upper() for token in interesting):
            print(f"env {key:<20}: {os.environ[key]}")
    print("PATH (full, in order):")
    for index, entry in enumerate(os.environ.get("PATH", "").split(os.pathsep)):
        print(f"    [{index:02d}] {entry}")
    print("cwd                 :", os.getcwd())
    print()


def main() -> int:
    _env_report()
    if _moved_temp:
        print(f"NOTE: TEMP/TMP moved to {_moved_temp} (a space in the old path crashes ROCm)\n")
    print("torch        :", torch.__version__)
    print("hip          :", getattr(torch.version, "hip", None))
    print("cuda         :", getattr(torch.version, "cuda", None))
    print("is_available :", torch.cuda.is_available())
    print("device_count :", torch.cuda.device_count())
    if not torch.cuda.is_available():
        print("\nNo GPU visible — training will run on CPU (that still works).")
        return 1

    for index in range(torch.cuda.device_count()):
        props = torch.cuda.get_device_properties(index)
        arch = getattr(props, "gcnArchName", None)
        extra = ""
        try:
            free, _total = torch.cuda.mem_get_info(index)
            extra = f"  free={free / 1e9:.1f} GB"
        except Exception:  # noqa: BLE001 - diagnostics only
            pass
        print(f"  [{index}] {props.name}  arch={arch}  vram={props.total_memory / 1e9:.1f} GB{extra}")

    try:
        x = torch.randn(2048, 2048, device="cuda", dtype=torch.float32)
        y = x @ x
        torch.cuda.synchronize()
        print(f"\nmatmul       : OK (checksum {float(y.sum()):.2f})")

        # Minimal autograd step — proves backward kernels work too.
        p = torch.randn(512, 512, device="cuda", requires_grad=True)
        loss = (p @ p).sum()
        loss.backward()
        torch.cuda.synchronize()
        print("backward     : OK")
    except Exception as exc:  # noqa: BLE001 - we want to report *any* failure
        print(f"\nGPU kernel FAILED: {type(exc).__name__}: {exc}")
        return 2

    print("\nGPU acceleration is working. Train with the default --device auto.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
