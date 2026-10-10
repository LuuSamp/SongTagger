-- Song catalog. One songs row is one recording.
-- Studio, live, and remix recordings are different rows.
-- Catalog genre and artist tags are owned by the catalog user.

CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    username VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO users (username)
VALUES ('catalog')
ON DUPLICATE KEY UPDATE username = username;

CREATE TABLE IF NOT EXISTS songs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    title TEXT NOT NULL,
    artist_credit TEXT NOT NULL,
    duration_ms INT NULL,
    mbid VARCHAR(36) NULL,
    isrc VARCHAR(12) NULL,
    disambiguation TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY songs_mbid (mbid),
    UNIQUE KEY songs_isrc (isrc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sources (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(32) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY sources_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS song_sources (
    song_id BIGINT UNSIGNED NOT NULL,
    source_id BIGINT UNSIGNED NOT NULL,
    external_id VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    PRIMARY KEY (song_id, source_id),
    UNIQUE KEY song_sources_external (source_id, external_id),
    CONSTRAINT song_sources_song_fk FOREIGN KEY (song_id) REFERENCES songs (id),
    CONSTRAINT song_sources_source_fk FOREIGN KEY (source_id) REFERENCES sources (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tags (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    normalized_name VARCHAR(255) NOT NULL,
    kind ENUM('artist', 'genre', 'feeling', 'instrument') NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY tags_kind_normalized_name (kind, normalized_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS song_tags (
    song_id BIGINT UNSIGNED NOT NULL,
    tag_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (song_id, tag_id, user_id),
    CONSTRAINT song_tags_song_fk FOREIGN KEY (song_id) REFERENCES songs (id),
    CONSTRAINT song_tags_tag_fk FOREIGN KEY (tag_id) REFERENCES tags (id),
    CONSTRAINT song_tags_user_fk FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_songs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    song_id BIGINT UNSIGNED NOT NULL,
    action ENUM('listen', 'like', 'save') NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY user_songs_user_song (user_id, song_id),
    CONSTRAINT user_songs_user_fk FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT user_songs_song_fk FOREIGN KEY (song_id) REFERENCES songs (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One playlist belongs to one user. Song order lives on playlist_songs.
-- The same song may appear more than once. Positions are always 1..n.

CREATE TABLE IF NOT EXISTS playlists (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY playlists_user (user_id),
    CONSTRAINT playlists_user_fk FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS playlist_songs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    playlist_id BIGINT UNSIGNED NOT NULL,
    song_id BIGINT UNSIGNED NOT NULL,
    position INT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY playlist_songs_position (playlist_id, position),
    CONSTRAINT playlist_songs_playlist_fk FOREIGN KEY (playlist_id) REFERENCES playlists (id),
    CONSTRAINT playlist_songs_song_fk FOREIGN KEY (song_id) REFERENCES songs (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
