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

Content rules: educational only, never financial advice, and any numbers
quoted in exercises must be internally consistent so the checker in
`app/services/learn_service.py` validates them.
