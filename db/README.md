# Catalog database

MariaDB. Commands below run from the project root.

```bash
python -m pip install pymysql httpx
```

```bash
export SONGTAGGING_DB_HOST=127.0.0.1    # default
export SONGTAGGING_DB_PORT=3306         # default
export SONGTAGGING_DB_USER=your_user    # required
export SONGTAGGING_DB_PASSWORD=         # default empty
export SONGTAGGING_DB_NAME=songtagging  # default
```

```bash
python -m db.manager   # create the database, tables, five sources, and the catalog user
python -m db.seed      # upsert the recordings in seed_queries.txt from MusicBrainz
```

The seed stays at or under one MusicBrainz request per second. A second run updates the same rows. Lookups are cached in `seed_cache.json`.

## Demo data

```bash
python -m db.seed_demo
```

Run it after `python -m db.seed`. It creates the users `ada`, `bia` and `caio`, adds their feeling and instrument tags to well-known seeded songs, and creates their playlists (ada: Noite, Brasil; bia: Guitarras, Pista; caio: Domingo). It is safe to run again: tags are idempotent and a playlist is skipped when that user already has one with the same name. Songs missing from the catalog are reported and skipped.
