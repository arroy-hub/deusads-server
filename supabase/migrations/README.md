# Migrations

The database is changed only by the numbered files in this folder. They are applied by hand
(Supabase SQL editor, or the Supabase MCP `apply_migration`), so the process below is what keeps
the database and the code from drifting apart.

## How the database and the code stay in step

- `public.schema_versions` (migration 0012) lists the migrations the database has.
- `lib/migrations.js` lists the migrations the code expects.
- **Admin → System** compares the two and the admin menu shows `System (!)` when the database is
  behind. A migration that is not applied is therefore visible, not a mystery error.
- `npm test` runs `test/migrations.test.mjs`, which fails when a file in this folder is missing
  from `lib/migrations.js` (or the other way round), when numbers skip, or when a new migration
  forgets to record itself.

## Adding a migration

1. Create `NNNN_short_name.sql` with the next number. Write it so it is safe to run twice
   (`if not exists`, `create or replace`, `on conflict do nothing`).
2. Put a header comment saying what it does, what it needs, and what the code does until it is
   applied. Code that depends on a new column or function must degrade, not crash: see
   `isSchemaOutdated` in `lib/api.js` and `bookingsMissing` in `lib/booking-rules.js`.
3. End the file by recording it:

   ```sql
   insert into public.schema_versions (version, name)
   values ('NNNN', 'NNNN_short_name')
   on conflict (version) do nothing;
   ```

4. Add it to `MIGRATIONS` in `lib/migrations.js` (version, file, one-line summary).
5. Try it before it is real. Wrap the statements and your checks in a `DO` block that ends with
   `raise exception 'DRYRUN: %', result;`: everything rolls back and the message carries the
   result. This is how 0008 to 0010 were checked against the live data.
6. `npm test` and `npx next build`.
7. Apply it, then open Admin → System and check it shows as applied. Merge the code only after
   the migration is applied, or make sure the code copes without it.

## Things to know

- The Supabase MCP tool blocks `DROP POLICY`. `ALTER POLICY ... USING (...) WITH CHECK (...)`
  changes a policy in place and is allowed; that is how 0005 was applied. A change of the policy's
  command needs the SQL editor.
- Functions that only the dashboard calls (service role) are revoked from `public`, `anon` and
  `authenticated` and granted to `service_role`. Tables get row-level security and no grants to
  users unless they need to read them.
- Never edit a migration that has been applied. Add a new one. The only exception so far is
  fixing a comment, or recording what was actually run (0005).
