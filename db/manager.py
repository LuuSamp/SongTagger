"""Open the catalog database and create its tables.

Connection settings come from the environment:

- SONGTAGGING_DB_HOST (default 127.0.0.1)
- SONGTAGGING_DB_PORT (default 3306)
- SONGTAGGING_DB_USER (required)
- SONGTAGGING_DB_PASSWORD (default empty)
- SONGTAGGING_DB_NAME (default songtagging)
"""

from __future__ import annotations

import os
import re
from pathlib import Path

import pymysql
from pymysql.connections import Connection

SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"

SOURCE_NAMES = ("musicbrainz", "spotify", "apple_music", "youtube", "discogs")
CATALOG_USERNAME = "catalog"

_IDENTIFIER = re.compile(r"^[A-Za-z0-9_]+$")


def database_settings() -> dict[str, str | int]:
    user = os.environ.get("SONGTAGGING_DB_USER", "").strip()
    if not user:
        raise SystemExit("SONGTAGGING_DB_USER is required")
    name = os.environ.get("SONGTAGGING_DB_NAME", "songtagging").strip() or "songtagging"
    if not _IDENTIFIER.fullmatch(name):
        raise SystemExit("SONGTAGGING_DB_NAME must contain only letters, numbers, and underscores")
    port_text = os.environ.get("SONGTAGGING_DB_PORT", "3306").strip() or "3306"
    try:
        port = int(port_text)
    except ValueError as exc:
        raise SystemExit("SONGTAGGING_DB_PORT must be an integer") from exc
    return {
        "host": os.environ.get("SONGTAGGING_DB_HOST", "127.0.0.1").strip() or "127.0.0.1",
        "port": port,
        "user": user,
        "password": os.environ.get("SONGTAGGING_DB_PASSWORD", ""),
        "database": name,
    }


def open_connection(*, database: str | None) -> Connection:
    settings = database_settings()
    return pymysql.connect(
        host=str(settings["host"]),
        port=int(settings["port"]),
        user=str(settings["user"]),
        password=str(settings["password"]),
        database=database,
        charset="utf8mb4",
        autocommit=False,
        cursorclass=pymysql.cursors.DictCursor,
    )


def open_database() -> Connection:
    """Connect to the catalog database named by the environment."""
    return open_connection(database=str(database_settings()["database"]))


def sql_statements(script: str) -> list[str]:
    statements: list[str] = []
    buffer: list[str] = []
    for line in script.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("--"):
            continue
        buffer.append(line)
        if stripped.endswith(";"):
            statement = "\n".join(buffer).strip()
            if statement.endswith(";"):
                statement = statement[:-1].strip()
            if statement:
                statements.append(statement)
            buffer = []
    if buffer:
        raise SystemExit("db/schema.sql has an unterminated statement")
    return statements


def create_database(connection: Connection) -> None:
    name = str(database_settings()["database"])
    with connection.cursor() as cursor:
        cursor.execute(
            f"CREATE DATABASE IF NOT EXISTS `{name}` "
            "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        )
    connection.commit()


def apply_schema(connection: Connection) -> None:
    script = SCHEMA_PATH.read_text(encoding="utf-8")
    with connection.cursor() as cursor:
        for statement in sql_statements(script):
            cursor.execute(statement)
    connection.commit()


def ensure_catalog_rows(connection: Connection) -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            "INSERT INTO users (username) VALUES (%s) "
            "ON DUPLICATE KEY UPDATE username = username",
            (CATALOG_USERNAME,),
        )
        for name in SOURCE_NAMES:
            cursor.execute(
                "INSERT INTO sources (name) VALUES (%s) "
                "ON DUPLICATE KEY UPDATE name = name",
                (name,),
            )
    connection.commit()


def main() -> None:
    settings = database_settings()
    server = open_connection(database=None)
    try:
        create_database(server)
    finally:
        server.close()
    connection = open_database()
    try:
        apply_schema(connection)
        ensure_catalog_rows(connection)
    finally:
        connection.close()
    print(
        f"Ready: database {settings['database']} on {settings['host']}:{settings['port']}"
    )


if __name__ == "__main__":
    try:
        main()
    except pymysql.MySQLError as exc:
        raise SystemExit(f"MySQL error: {exc}") from exc
