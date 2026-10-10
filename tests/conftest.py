"""Throwaway catalog database and a fake recording source."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from db.manager import apply_schema, create_database, ensure_catalog_rows, open_connection, open_database
from db.seed import display_tag, normalize_tag

from API.app import create_app


class FakeSource:
    def __init__(self) -> None:
        self.calls: list[tuple] = []
        self.title_hits: list[dict] = []
        self.artist_hits: list[dict] = []
        self.fail_lookup_ids: set[str] = set()

    def search(self, title: str, artist: str) -> list[dict]:
        self.calls.append(("search", title, artist))
        return [dict(item) for item in self.artist_hits]

    def search_title(self, title: str) -> list[dict]:
        self.calls.append(("search_title", title))
        return [dict(item) for item in self.title_hits]

    def lookup(self, recording_id: str) -> dict:
        self.calls.append(("lookup", recording_id))
        if recording_id in self.fail_lookup_ids:
            raise RuntimeError("lookup failed")
        for item in [*self.title_hits, *self.artist_hits]:
            if item["id"] == recording_id:
                return dict(item)
        raise RuntimeError(f"unknown recording {recording_id}")


@pytest.fixture
def database(monkeypatch: pytest.MonkeyPatch):
    name = f"songtagging_test_{uuid.uuid4().hex}"
    monkeypatch.setenv("SONGTAGGING_DB_NAME", name)
    server = open_connection(database=None)
    try:
        create_database(server)
        catalog = open_database()
        try:
            apply_schema(catalog)
            ensure_catalog_rows(catalog)
        finally:
            catalog.close()
        yield name
    finally:
        with server.cursor() as cursor:
            cursor.execute(f"DROP DATABASE IF EXISTS `{name}`")
        server.commit()
        server.close()


@pytest.fixture
def source() -> FakeSource:
    return FakeSource()


@pytest.fixture
def client(database: str, source: FakeSource):
    with TestClient(create_app(source)) as test_client:
        yield test_client


def insert_user(username: str) -> int:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute("INSERT INTO users (username) VALUES (%s)", (username,))
            user_id = int(cursor.lastrowid)
        connection.commit()
        return user_id
    finally:
        connection.close()


def insert_song(title: str, artist_credit: str) -> int:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO songs (title, artist_credit) VALUES (%s, %s)",
                (title, artist_credit),
            )
            song_id = int(cursor.lastrowid)
        connection.commit()
        return song_id
    finally:
        connection.close()


def add_tag(song_id: int, username: str, kind: str, name: str) -> None:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_id = int(cursor.fetchone()["id"])
            cursor.execute(
                "INSERT INTO tags (name, normalized_name, kind) VALUES (%s, %s, %s) "
                "ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)",
                (display_tag(name), normalize_tag(name), kind),
            )
            tag_id = int(cursor.lastrowid)
            cursor.execute(
                "INSERT INTO song_tags (song_id, tag_id, user_id) VALUES (%s, %s, %s)",
                (song_id, tag_id, user_id),
            )
        connection.commit()
    finally:
        connection.close()


def tag_rows(username: str | None = None) -> list[tuple]:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            sql = (
                "SELECT st.song_id, st.tag_id, u.username, t.kind, t.name "
                "FROM song_tags st "
                "JOIN users u ON u.id = st.user_id "
                "JOIN tags t ON t.id = st.tag_id"
            )
            params: tuple = ()
            if username is not None:
                sql += " WHERE u.username = %s"
                params = (username,)
            sql += " ORDER BY st.song_id, st.tag_id, u.username"
            cursor.execute(sql, params)
            return [
                (int(row["song_id"]), int(row["tag_id"]), row["username"], row["kind"], row["name"])
                for row in cursor.fetchall()
            ]
    finally:
        connection.close()


def count_rows(table: str) -> int:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute(f"SELECT COUNT(*) AS n FROM `{table}`")
            return int(cursor.fetchone()["n"])
    finally:
        connection.close()
