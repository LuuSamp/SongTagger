"""Load SongTagger/.env once at process startup."""

from __future__ import annotations

import os
from pathlib import Path


def load_env(path: Path) -> None:
    """Replace process environment names that appear in ``path``.

    A name in the file wins even when its value is empty. A name that is
    absent keeps the process value. Blank lines and ``#`` comments are ignored.
    A missing file leaves the process environment unchanged.
    """
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        name = name.strip()
        if name:
            os.environ[name] = value.strip()
