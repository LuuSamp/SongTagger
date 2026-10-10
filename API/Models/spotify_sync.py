"""Choose which linked side a playlist sync updates."""

from __future__ import annotations

from pydantic import BaseModel


class SpotifySyncRequest(BaseModel):
    direction: str
