# Recommender evaluation

`GET /user/{user_id}/recommendations` uses a content model: the cosine between user and song tag profiles, blended with popularity. This document records what it computes and how it was chosen.

## What ships

Every song the user has not touched is ranked by:

```
score(u, s) = 0.8 · cos(B_u, A_s) / max_s cos(B_u, A_s)  +  0.2 · popularity_s
```

- **`A` (songs × tags)**: `1` if anyone (the catalog or any listener) applied the tag, times `idf_t = log(1 + N_songs / df_t)`. Each row is L2-normalized.
- **`B` (users × tags)**: `0.6 · declared + 0.4 · implicit`, each part max-normalized per user.
  - `declared`: `log(1 + songs the user tagged with t)`.
  - `implicit`: `Σ_s w_us · A_s`.
  - `w_us`: the strongest signal for that song (like 3, playlist 2, own tag 1.5, listen 1), times `e^(−age_days / 90)`.
- **`popularity_s`**: the number of distinct listeners who liked, saved to a playlist or tagged the song, divided by the maximum.
- **Ranking rules:** the user's own songs are excluded and there are at most 2 songs per artist.
- **`because`**: up to two tags with the largest `A_st · B_ut`.

The model is rebuilt only when the data fingerprint changes or after one hour. Building it takes under 1 ms on the current database (105 songs, 283 tags).

## Protocol

**Leave-one-out.** For every user with at least 2 positive songs (playlist, like or own tag), hide one song and remove every signal the user gave it, including their tag applications. Then rebuild the model and check where the hidden song lands in the top 10.

- **Metrics:** NDCG@10 (primary), Hit@10 and MRR, plus catalog coverage and intra-list diversity (1 − mean tag cosine).

**Two data sets.** The real database is far too small to decide alone.

- **Real:** 3 listeners (ada, bia, caio), 32 playlist rows over 27 distinct songs, 1 like and 42 tag applications. Each round has 3 test cases, so rounds were repeated with different hidden songs:
  - 20 rounds (60 cases) during the search;
  - 40 fresh rounds (120 cases) for the confirmation.
- **Synthetic:** 60 simulated listeners per world over the real catalog and its real catalog tags. Nothing is written to the database (`evaluate.synthetic`).
  - Each listener likes the genre neighborhood of 2 anchor genres, with Gumbel noise.
  - One in five listeners is a light user with 3 songs.
  - Listeners apply consistent "mood" tags tied to genres.
  - 5 worlds were used during the search; 10 different worlds for the confirmation.
  - Because these tastes are defined over catalog genres, the synthetic set favors content methods by construction. That is why the choice averages real and synthetic.

**Selection.** A staged search ranked configurations by `(real NDCG + synthetic NDCG) / 2`. The finalists were then re-evaluated with new seeds and paired bootstrap 95% intervals against the leader.

## Search (stage leaders, NDCG@10)

| Stage | What varied | Best real | Best synthetic | Outcome |
|---|---|---|---|---|
| Popularity only | — | 0.281 | 0.276 | Strong baseline |
| A scoring | binary / count / log / `c/(c+m)` with m ∈ {1, 2}; IDF on/off; catalog weight 0.5/1; row norm max/L2 | 0.276 | 0.323 | **binary + IDF + L2** won. Without IDF, raw counts fell to 0.138 / 0.260. |
| B scoring | γ ∈ {0, .3, .6, .8, 1}; action weights (3/2/1.5, flat, tag-heavy); decay 30/90/∞ days; norm max/L1 | 0.276 | 0.323 | **γ = 0.6, 3/2/1.5, 90 days, max** won. Explicit-only with L1 fell to 0.225 / 0.189. |
| Tag diffusion | co-occurrence kernel `K = (2I − L)²` on/off | 0.198 | 0.345 | Lost 0.08 on real, so not adopted |
| Score and re-ranking | cosine vs dot product; MMR λ ∈ {0, .3, .6} | — | — | Cosine with no MMR won. MMR raised diversity (0.74 → 0.91) and coverage but cost accuracy (synthetic 0.323 → 0.231 at λ = .6). |

## Confirmation (fresh seeds: 120 real cases, 600 synthetic cases)

The last two columns are the difference to the leader with its 95% interval.

| Candidate | Real NDCG@10 | Synthetic NDCG@10 | Δ real vs leader | Δ synthetic vs leader |
|---|---|---|---|---|
| **cosine + 0.2 popularity (shipped)** | 0.261 | **0.336** | — | — |
| cosine | 0.255 | 0.325 | −0.007 [−0.032, 0.020] | −0.010 [−0.020, 0.000] |
| cosine + 0.4 popularity | 0.251 | 0.321 | −0.011 [−0.038, 0.014] | −0.015 [−0.025, −0.005] |
| popularity only | 0.234 | 0.273 | −0.027 [−0.089, 0.035] | −0.062 [−0.080, −0.044] |

The 0.2 popularity blend beats pure content by about 2 standard errors on synthetic data and is neutral on real data, so it was kept.

## Re-running

Two pieces stay in the code: `API/Recommender/evaluate.py`, which holds the protocol and the synthetic generator, and the regression test `tests/test_recommender.py::test_chosen_blend_beats_content_only_and_popularity_only_offline`.

Re-run the evaluation once there are dozens of active listeners. Keep a change only if it wins on real data with an interval that excludes zero.
