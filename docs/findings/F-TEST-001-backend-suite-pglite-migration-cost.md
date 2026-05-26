# F-TEST-001 Backend Suite PGlite Migration Cost

- `status`: `open`
- `found_in`: chat notifications review follow-up, backend full suite verification
- `risk`: `medium`
- `urgency`: before making full `pnpm --dir backend test` a routine closure gate or CI gate
- `area`: backend tests, PGlite test database setup, migration runtime
- `evidence`:
  - `backend/src/test/testDatabase.ts` creates a fresh in-memory PGlite database and runs all Drizzle migrations for every `createTestDatabase()` call.
  - Heavy suites such as `backend/src/app.test.ts`, `backend/src/modules/registration/service.test.ts`, and `backend/src/modules/password-reset/service.test.ts` call `createTestDatabase()` from `beforeEach`, so migration setup repeats per test case.
  - A single `createTestDatabase()` measurement was about 5 seconds locally; `backend/src/app.test.ts` alone took about 65 seconds, and registration plus password reset service tests took about 72 seconds.
  - The default backend test reporter prints little progress until files complete, so the full suite can look hung even while slow tests are still running.
- `fix_short`: Reduce repeated migration cost in backend tests, for example by reusing a migrated PGlite snapshot, splitting fast unit tests from DB integration tests, or moving shared expensive setup from per-test `beforeEach` to safe per-suite setup where isolation can be preserved.
- `acceptance`:
  - Full backend test runtime is low enough to use as a practical local and CI gate.
  - Test isolation remains explicit: state from one test cannot leak into another tenant, repository, auth, registration, or chat scenario.
  - Backend targeted tests still support focused closure checks for feature slices.
  - Test output makes long-running files visible enough that a slow run is distinguishable from a true hang.
