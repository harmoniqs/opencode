# Unified session database: remove channel-based DB path splitting

Status: proposed (2026-08-12)

Tracking: harmoniqs/opencode#188 · Glossary: `CONTEXT.md` (Installation Channel)

All opencode installations on a single machine write to one database file (`opencode.db`) regardless of their build channel. The channel-based path splitting (`opencode-dev.db`, `opencode-local.db`, branch-named DBs) is removed. On first startup after the change, a one-time consolidation migrates rows from any legacy channel-named DB files into the canonical `opencode.db`, deduplicating by primary key, then renames the sources to `*.db.merged` as backups.

**Why:** the channel-DB split was introduced defensively — to prevent a dev build from corrupting a release user's session history. In practice, sessions are append-only, schema-migrated identically across all channels, and the split only fragments session history for users who switch between dev and release builds on the same machine (the common case for contributors). The existing `consolidateLocalDb` function already acknowledges this by merging per-branch DBs into one — this change extends the same logic to its natural conclusion.

**Mechanism:**

1. `path()` in `database.ts` reduces to: if `OPENCODE_DB` is set, use it; otherwise return `join(Global.Path.data, "opencode.db")` with a one-time consolidation pass.
2. The consolidation function scans `Global.Path.data` for any `opencode-*.db` files (matching `opencode-dev.db`, `opencode-local.db`, `opencode-beta.db`, and any branch-named variants). For each found file, it ATTACHes it via SQLite, iterates all user tables, and runs `INSERT OR IGNORE INTO main.<table> SELECT * FROM source.<table>` (primary-key dedup). Foreign key checks are disabled during the merge. Successfully merged sources are renamed to `*.db.merged`; their WAL/SHM sidecars are deleted.
3. If `opencode.db` does not yet exist but channel DBs do, the largest channel DB is renamed to become `opencode.db` (the base), then remaining channel DBs are merged into it. This avoids a full copy of the largest file.
4. The `OPENCODE_DB` environment variable override is retained for CI, testing, and `:memory:` use.
5. `OPENCODE_DISABLE_CHANNEL_DB`, `STABLE_CHANNELS`, and all channel-branching logic are deleted.

**Standalone merge script:** a `merge-opencode-dbs.sh` bash script (distributed separately, not in the repo) provides the same consolidation for users who haven't upgraded yet. It requires only `sqlite3` on PATH, auto-detects the data directory, and performs the same ATTACH + INSERT OR IGNORE + backup flow.

**Conditions of merge:** the consolidation must be idempotent (re-running after a partial failure picks up where it left off — already-merged files have been renamed, un-merged ones are retried). The merge must not block startup for more than ~5 seconds on a 500 MB combined DB size. WAL mode must be checkpointed on source DBs before ATTACH (to avoid attaching a DB mid-transaction).

**Flip condition:** if opencode ever needs true multi-tenant isolation (e.g. separate DB per workspace for portability), revisit with a workspace-scoped model rather than channel-scoped.

**Accepted costs:** users who deliberately kept channel DBs separate (for A/B testing session behavior across versions) lose that separation. The `*.db.merged` backups consume disk until manually deleted.

**Considered:** env-var-only patch (`OPENCODE_DISABLE_CHANNEL_DB=1` in build config — runner-up: zero code change, but doesn't merge existing data and doesn't fix upstream); explicit CLI command (`opencode db merge` — rejected: the right behavior should be automatic, most users won't discover or run a manual command and will just lose history); keep channel split but add cross-DB search (rejected: complexity for a problem that shouldn't exist).
