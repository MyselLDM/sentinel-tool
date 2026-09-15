"""Thread-safe LRU cache for inference results (process-local)."""

from __future__ import annotations

import threading
from collections import OrderedDict
from typing import Any, Hashable


class LRUCache:
    """A minimal, thread-safe LRU cache. ``maxsize <= 0`` disables caching."""

    def __init__(self, maxsize: int = 1024) -> None:
        self._maxsize = max(0, int(maxsize))
        self._data: "OrderedDict[Hashable, Any]" = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: Hashable) -> Any | None:
        if self._maxsize == 0:
            return None
        with self._lock:
            if key not in self._data:
                return None
            self._data.move_to_end(key)
            return self._data[key]

    def set(self, key: Hashable, value: Any) -> None:
        if self._maxsize == 0:
            return
        with self._lock:
            self._data[key] = value
            self._data.move_to_end(key)
            while len(self._data) > self._maxsize:
                self._data.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()

    def __len__(self) -> int:
        return len(self._data)
