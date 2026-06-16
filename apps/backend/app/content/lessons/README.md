# Lesson catalog

The interactive learning curriculum lives here as plain JSON so that
curriculum contributions are pure-content pull requests — no Python required.

- `modules.json` — tier order plus per-module title and description.
- `novice.json`, `intermediate.json`, `advanced.json`, `expert.json` — one
  array of lesson objects per tier, sorted by `order`.

Each lesson object has:

- `id` — stable slug, prefixed with the tier (e.g. `novice-01-candlestick`).
- `module_id`, `tier`, `order`, `title`, `summary`.
- `concept` — markdown body of the lesson.
- `key_terms` — list of `{term, definition}` pairs.
- `exercise` — either `multiple_choice` (`question`, `options`,
  `correct_index`, `explanation`) or `numeric_input` (`question`, `hint`,
  `correct_answer`, `tolerance_percent`, `explanation`).
- `live_apply` — `{screen, cta}` pointing the learner at a live app surface.

Every lesson file is validated against
[`lesson.schema.json`](lesson.schema.json) in CI
(`tests/test_lesson_content.py`), including unique ids, sequential `order`
per tier, and in-range `correct_index`.

Content rules: educational only, never financial advice, and any numbers
quoted in exercises must be internally consistent so the checker in
`app/services/learn_service.py` validates them.

## Translations

The English files above are the source of truth. A locale is added by dropping
overlay files under a language subdirectory named by its base code:

```text
lessons/<locale>/modules.json        # partial: translated level + track titles
lessons/<locale>/novice.json         # partial lesson list (any subset)
lessons/<locale>/intermediate.json
lessons/<locale>/advanced.json
lessons/<locale>/expert.json
```

Overlays are **partial and field-by-field**: an entry only needs an `id` plus
the prose fields it translates; anything omitted (or any lesson/file absent)
falls back to English. So a locale can be filled in one lesson at a time.

Structural and answer-key fields are **always taken from English** and ignored
in overlays — `id`, `module_id`, `track_id`, `tier`, `order`, and the
`exercise` keys `type`, `correct_index`, `correct_answer`, `tolerance_percent`.
This keeps progress tracking and exam grading identical across every language.
Translate only prose: `title`, `summary`, `concept`, `key_terms`,
`exercise.question`/`hint`/`options`/`explanation`, `common_mistakes`, and the
`bridge`/`live_apply` `cta`. The active locale is taken from the request's
`Accept-Language` header (the desktop client sends the chosen language).
