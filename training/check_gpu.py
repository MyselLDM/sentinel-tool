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

import sys

import torch


def main() -> int:
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
        print(f"  [{index}] {props.name}  arch={arch}  vram={props.total_memory / 1e9:.1f} GB")

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
