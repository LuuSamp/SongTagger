from __future__ import annotations

from API.Services.playlists import PlaylistService
from API.Services.songs import SongService
from API.Services.tags import TagService
from db.manager import load_project_env, open_database
from db.seed import fold

DEMO_USERS = ("ada", "bia", "caio")

DEMO_TAGS: dict[str, list[tuple[str, str, list[tuple[str, str]]]]] = {
    "ada": [
        ("Caetano Veloso", "Sampa", [("feeling", "warm"), ("feeling", "nostalgic"), ("instrument", "acoustic-guitar")]),
        ("Elis Regina", "Águas de Março", [("feeling", "sunny"), ("feeling", "carefree")]),
        ("Antônio Carlos Jobim", "The Girl From Ipanema", [("feeling", "sunny"), ("instrument", "saxophone")]),
        ("Gal Costa", "Baby", [("feeling", "warm")]),
        ("Miles Davis", "So What", [("feeling", "late-night"), ("feeling", "contemplative"), ("instrument", "trumpet")]),
        ("John Coltrane", "Giant Steps", [("instrument", "saxophone")]),
        ("Ella Fitzgerald", "Summertime", [("feeling", "late-night"), ("feeling", "intimate")]),
        ("Sade", "Smooth Operator", [("feeling", "late-night"), ("instrument", "saxophone")]),
        ("Massive Attack", "Teardrop", [("feeling", "dreamy"), ("feeling", "late-night")]),
    ],
    "bia": [
        ("Cocteau Twins", "Lorelei", [("feeling", "dreamy"), ("feeling", "ethereal")]),
        ("My Bloody Valentine", "Only Shallow", [("feeling", "dreamy"), ("instrument", "electric-guitar")]),
        ("Radiohead", "Paranoid Android", [("instrument", "electric-guitar")]),
        ("Pixies", "Where Is My Mind?", [("feeling", "nostalgic"), ("instrument", "electric-guitar")]),
        ("Daft Punk", "One More Time", [("feeling", "euphoric"), ("instrument", "synthesizer")]),
        ("Donna Summer", "I Feel Love", [("instrument", "synthesizer")]),
        ("Gilberto Gil", "Aquele Abraço", [("feeling", "sunny")]),
        ("Jorge Ben Jor", "Mas Que Nada", [("feeling", "carefree"), ("instrument", "percussion")]),
        ("Miles Davis", "So What", [("feeling", "late-night")]),
    ],
    "caio": [
        ("Caetano Veloso", "Sampa", [("feeling", "warm"), ("feeling", "nostalgic")]),
        ("Elis Regina", "Águas de Março", [("feeling", "sunny")]),
        ("Antônio Carlos Jobim", "The Girl From Ipanema", [("feeling", "sunny")]),
        ("Miles Davis", "So What", [("feeling", "late-night"), ("instrument", "trumpet")]),
        ("Massive Attack", "Teardrop", [("feeling", "dreamy")]),
        ("Cocteau Twins", "Lorelei", [("feeling", "dreamy")]),
        ("Daft Punk", "One More Time", [("feeling", "euphoric")]),
    ],
}

DEMO_PLAYLISTS: dict[str, list[tuple[str, list[tuple[str, str]]]]] = {
    "ada": [
        (
            "Noite",
            [
                ("Miles Davis", "So What"),
                ("Ella Fitzgerald", "Summertime"),
                ("Sade", "Smooth Operator"),
                ("Massive Attack", "Teardrop"),
                ("John Coltrane", "Giant Steps"),
            ],
        ),
        (
            "Brasil",
            [
                ("Caetano Veloso", "Sampa"),
                ("Elis Regina", "Águas de Março"),
                ("Antônio Carlos Jobim", "The Girl From Ipanema"),
                ("Jorge Ben Jor", "Mas Que Nada"),
                ("Gilberto Gil", "Aquele Abraço"),
                ("Gal Costa", "Baby"),
            ],
        ),
    ],
    "bia": [
        (
            "Guitarras",
            [
                ("Radiohead", "Paranoid Android"),
                ("Pixies", "Where Is My Mind?"),
                ("My Bloody Valentine", "Only Shallow"),
                ("Nirvana", "Smells Like Teen Spirit"),
            ],
        ),
        (
            "Pista",
            [
                ("Daft Punk", "One More Time"),
                ("Donna Summer", "I Feel Love"),
                ("New Order", "Blue Monday"),
                ("Chic", "Le Freak"),
            ],
        ),
    ],
    "caio": [
        (
            "Domingo",
            [
                ("Caetano Veloso", "Sampa"),
                ("Elis Regina", "Águas de Março"),
                ("Miles Davis", "So What"),
                ("Massive Attack", "Teardrop"),
                ("Daft Punk", "One More Time"),
            ],
        ),
    ],
}


def ensure_users(usernames: tuple[str, ...]) -> dict[str, int]:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            for username in usernames:
                cursor.execute("INSERT IGNORE INTO users (username) VALUES (%s)", (username,))
            connection.commit()
            cursor.execute(
                "SELECT id, username FROM users WHERE username IN ({})".format(
                    ", ".join(["%s"] * len(usernames))
                ),
                usernames,
            )
            return {row["username"]: int(row["id"]) for row in cursor.fetchall()}
    finally:
        connection.close()


def song_index() -> list[tuple[int, str, str]]:
    connection = open_database()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, title, artist_credit FROM songs ORDER BY id")
            return [(int(row["id"]), fold(row["title"]), fold(row["artist_credit"])) for row in cursor.fetchall()]
    finally:
        connection.close()


def find_song(index: list[tuple[int, str, str]], artist: str, title: str) -> int | None:
    title_key = fold(title)
    artist_key = fold(artist)
    for song_id, song_title, song_artist in index:
        if song_title == title_key and artist_key in song_artist:
            return song_id
    return None


def main() -> None:
    load_project_env()
    songs = SongService()
    tags = TagService(songs)
    playlists = PlaylistService(songs)
    users = ensure_users(DEMO_USERS)
    index = song_index()
    missing: set[str] = set()

    print(f"Users ready: {', '.join(f'{name} (id {users[name]})' for name in DEMO_USERS)}")

    for username, entries in DEMO_TAGS.items():
        applied = 0
        for artist, title, song_tags in entries:
            song_id = find_song(index, artist, title)
            if song_id is None:
                missing.add(f"{artist} - {title}")
                continue
            for kind, token in song_tags:
                tags.attach(username, song_id, kind, token)
                applied += 1
        print(f"Tags for {username}: {applied} applied (repeat runs keep one row per tag)")

    for username, user_playlists in DEMO_PLAYLISTS.items():
        user_id = users[username]
        existing = {entry["name"] for entry in playlists.list_playlists(user_id)["playlists"]}
        for name, entries in user_playlists:
            if name in existing:
                print(f"Playlist {username}/{name}: already exists, skipped")
                continue
            playlist = playlists.create(user_id, name)
            added = 0
            for artist, title in entries:
                song_id = find_song(index, artist, title)
                if song_id is None:
                    missing.add(f"{artist} - {title}")
                    continue
                playlists.add_song(user_id, playlist["id"], song_id, None)
                added += 1
            print(f"Playlist {username}/{name}: created with {added} songs")

    if missing:
        print("Songs not in the catalog (run python -m db.seed first): " + "; ".join(sorted(missing)))


if __name__ == "__main__":
    main()
