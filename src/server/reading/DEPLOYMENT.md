# Deploying reading progress and learning library

This release adds `reading_progress` and `reading_entries` to the existing SQLite database. No production or existing development database was changed while implementing this feature. The repository does not currently track Prisma migrations.

1. Stop the app and make a verified backup of `prisma/dev.db` (and the uploaded-file storage). For SQLite in WAL mode, use the SQLite backup API or stop all writers before copying.
2. Install dependencies with `npm ci`.
3. Apply the additive schema on the deployment host: `npm exec prisma db push`. Review Prisma's reported changes. Do not add `--accept-data-loss` or `--force-reset`.
4. Generate the client with `npm exec prisma generate` and build with `npm run build`.
5. Restart the application and check that reading progress, a saved word, and a note survive reload. Check with a second account that these personal records are isolated.

The datasource in `schema.prisma` is the existing `file:./dev.db`. Run schema commands against the intended deployment checkout. The two new tables cascade on document/user deletion. Existing document contents and explanations are untouched. Bookmarks and words use a SHA-256 unique key over user, document, type, text and location to make repeated and concurrent saves idempotent. Notes and conversation snapshots remain distinct saves.

Reading percentages are 0–100. Progress and entries are private to each user even when a workspace is shared. Workspace document access is checked before all per-document operations. Words start due immediately; successful reviews use 1, 2, 4, 8, 16, then 30-day intervals, while “again” schedules a 10-minute retry.

If rolling application code back, leave the additive tables intact so saved learning data is preserved. Restore the backup only if the schema application itself failed and after stopping writers.

If the runtime uses a `DATABASE_URL` override, ensure the Prisma CLI schema points at that exact same database before applying schema changes. The current schema uses a literal SQLite path, so setting a shell `DATABASE_URL` alone does not redirect `prisma db push`. For an isolated test, create a temporary schema copy with the intended datasource path and pass `--schema` explicitly. Never apply the new tables to one file and run the application against a different file.
