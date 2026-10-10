"""Database CLI reads SongTagger/.env, same as python -m API."""

from __future__ import annotations

import os

import pytest

from db.manager import main


def test_manager_main_loads_db_user_from_dotenv(monkeypatch, tmp_path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("SONGTAGGING_DB_USER=from-dotenv\n", encoding="utf-8")
    monkeypatch.delenv("SONGTAGGING_DB_USER", raising=False)
    monkeypatch.setattr("db.manager.ENV_PATH", env_file)
    seen: dict[str, str | None] = {}

    def stop_after_settings() -> dict[str, str | int]:
        seen["user"] = os.environ.get("SONGTAGGING_DB_USER")
        raise SystemExit("stop-before-connect")

    monkeypatch.setattr("db.manager.database_settings", stop_after_settings)

    with pytest.raises(SystemExit, match="stop-before-connect"):
        main()

    assert seen["user"] == "from-dotenv"
