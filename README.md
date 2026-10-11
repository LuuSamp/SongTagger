# SongTagger

MariaDB, Python, and Node. From this directory, copy `.env.example` to `.env` and set `SONGTAGGING_DB_USER`.

# How to run

## Prepare and seed the database (We use MariaDB)

```bash
python -m pip install -r requirements.txt
python -m db.manager
python -m db.seed
python -m db.seed_demo
```

## Run the API

```bash
python -m API
```

## Run the UI

```bash
cd UI
cp .env.example .env
npm install
npm run dev
```

API on http://127.0.0.1:8001, UI on http://127.0.0.1:5173.
