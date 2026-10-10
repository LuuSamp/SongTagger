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
