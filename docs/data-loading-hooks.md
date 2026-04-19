# Data Loading Hooks

Data fetching on the main page (`app/page.tsx`) is organized into four custom hooks that run sequentially — each waits for the previous one before it can start. This is a known waterfall. Within each hook, parallel fetches are used where possible.

---

## Load Sequence

```
useCheckAuth()
  └─ determines isAuthenticated + userId
       └─ useStudentProfile()
            └─ fetches + decrypts profile; hydrates caches
                 └─ useCurriculum()
                      └─ fetches degree programs + all curriculum JSONs (parallel)
                           └─ useSchedule()
                                └─ fetches schedule JSONs (parallel per degree)
```

On a cold authenticated load this is 4+ sequential network round-trips before the UI is interactive.

---

## `useCheckAuth` — `hooks/setup/CheckAuth.ts`

**Purpose:** Determine whether the current browser session is authenticated.

**Behavior:**
1. On mount, calls `GET /api/user/auth/check` with `credentials: "include"` (sends session cookie).
2. If the response contains `{ authenticated: true, userId }`: calls `setAuthStatus(true, userId)` on the Zustand store.
3. If `false` but `localStorage.enc_pwd` exists (stale session after expiry): clears `enc_pwd` and resets the store. Does not redirect — lets the UI fall back to the welcome screen.
4. Sets `authCheckCompleted = true` in all cases via `finally`.

**Returns:** `{ authState, setAuthState, isAuthenticated, authCheckCompleted, userId }`

`authState` holds a local `error` string and `authChecked` flag. The hook guards against repeated calls by checking `authState.authChecked || authCheckCompleted` before firing.

---

## `useStudentProfile` — `hooks/setup/useStudentProfile.ts`

**Purpose:** Load and decrypt the student profile from the server, then hydrate the Zustand store.

**Behavior — four cases tracked via `prevStoreStudentInfoRef`:**

**Case 0 — store empty + have `userId`:**
- Profile must be fetched.
- Reads `enc_pwd` from `localStorage`. If missing, redirects to `/login`.
- Calls `GET /api/user/profile/:userId`.
- If the response includes `prefetched` data (curriculum + schedule blobs attached by the server), hydrates both caches immediately via `cacheCurriculum` (Zustand) and `primeScheduleCache` (module-level).
- Decrypts the encrypted blob with `decryptStudentData(hashString(pwd), iv, encryptedData)`.
- Calls `setStoreStudentInfo(decryptedData)` which triggers Case 1 on the next render.

**Case 1 — store just became non-null (was null):**
- Copies from store to local state. Sets `isProfileLoading = false`.

**Case 2 — store updated (reference changed, both old and new are non-null):**
- Updates local state to track store.

**Case 3 — store became null (logout):**
- Clears local state. Sets `isProfileLoading = false`.

**Case 4 — store still null, no userId, auth check done:**
- Stops loading. No profile to show.

**Returns:** `{ studentInfo, setStudentInfo, isProfileLoading }`

### Profile Prefetching

The profile endpoint (`GET /api/user/profile/:userId`) reads a cookie `ufsc_prefetch_degrees` that `useCurriculum` writes on each degree-set change. The server uses this to bundle curriculum + schedule data alongside the encrypted profile in a single response, eliminating the need for separate curriculum/schedule fetches on a cache hit.

---

## `useCurriculum` — `hooks/setup/UseCurriculum.ts`

**Purpose:** Fetch degree programs and curriculum JSON for all degrees the student is enrolled in or interested in.

**Trigger:** Runs when `studentInfo` changes and profile loading is complete.

**Behavior:**

1. **Degree programs** — fetched from `GET /api/degree-programs` via `fetchDegreePrograms()`. The result is cached in a module-level variable (`cachedDegreePrograms`), so subsequent hook runs don't re-fetch.

2. **ID migration** — if `studentInfo.currentDegree` or any `interestedDegrees` contains a bare base ID that no longer matches any program, `migrate()` finds the latest versioned ID that starts with `"<baseId>_"`. If migration is needed, `setStudentInfo` is called with the corrected IDs. The hook then returns early and waits for the store update to re-run.

3. **Signature guard** — the hook builds a sorted comma-separated string of all degree IDs (`fetchedForDegreeRef`). If the signature hasn't changed since the last run, the fetch is skipped.

4. **Parallel curriculum fetch** — for each degree ID, checks the Zustand `curriculumCache` first. If a cache hit exists, reconstructs a minimal `Curriculum` object from it. On a miss, calls `GET /api/curriculum/:programId`.

5. **Prefetch cookie** — writes `ufsc_prefetch_degrees=<sorted_degree_ids>` to `document.cookie` so the next profile load can bundle curriculum data.

6. Updates `curriculumState`:
   - `curriculumsCache` — the full `Curriculum` objects (for the hook's consumers)
   - `curriculum` — the curriculum currently being viewed
   - `currentCurriculum` — the student's primary degree curriculum
   - `viewingDegreeId` — which degree is in the viewport

**State exposed:** `{ curriculumState, setCurriculumState, isCurriculumLoading, setViewingDegreeId }`

`setViewingDegreeId(id)` switches the displayed curriculum immediately if it's already in `curriculumsCache`.

---

## `useSchedule` — `hooks/setup/UseSchedule.ts`

**Purpose:** Fetch class schedule data for all degrees.

**Trigger:** Runs when `studentInfo` changes, **and after** both `isProfileLoading` and `isCurriculumLoading` are `false`.

**Behavior:**

1. Builds a signature: sorted degree IDs + `"_"` + selected semester (or `"LATEST"` if none selected). Includes `selectedSemester` in the signature so changing the semester selector forces a re-fetch.

2. Also re-fetches if `scheduleData === null` regardless of signature match (retry on error).

3. Calls `fetchClassSchedule(degreeId, semester?)` for each degree in parallel. `fetchClassSchedule` (in `app/api/schedule/client.ts`) is a module-level cache (`Map<string, any>`):
   - Cache key: `"<degreeId>_<semester>"` or just `"<degreeId>"` for latest.
   - On a miss, calls `GET /api/schedule?currentDegree=&semester=`.

4. If the server resolved `"LATEST"` to a concrete semester code (returned as `data.fetchedSemester`), the hook:
   - Updates its own signature ref to the concrete code so it won't re-fetch.
   - Primes the module cache with the concrete key via `primeScheduleCache`.
   - Updates `selectedSemester` in local state.

5. Merges all successful results with `Object.assign` into a single `mergedData` object.

6. Selects the longest `availableSemesters` array from the batch to populate the semester selector.

**State exposed:** `{ scheduleState, setScheduleState, isScheduleLoading }`

`scheduleState` contains: `scheduleData`, `isLoading`, `selectedCampus`, `selectedSemester`, `availableSemesters`.

---

## Schedule Client Cache — `app/api/schedule/client.ts`

A module-level `Map<string, any>` that caches schedule JSON keyed by `"<degreeId>_<semester>"`.

**`primeScheduleCache(degreeId, semester, data)`** — writes directly into the cache. Called by `useStudentProfile` when the profile response includes prefetched schedules, and by `useSchedule` when it resolves the latest semester.

**`fetchClassSchedule(degreeId, semester?)`** — checks the cache, then falls back to a fetch. Returns `null` on error.

---

## API Route: `GET /api/schedule`

Reads `currentDegree` and optional `semester` query params. If no semester is given, calls `getLatestSemester` and tries the current, previous, and older semesters in order (using `getCurrentSemesters()`). Returns:

```json
{
  "<programId>": { "<campus>": [...courses] },
  "fetchedSemester": "20251",
  "availableSemesters": ["20252", "20251", "20242", ...]
}
```

The `fetchedSemester` field is the resolved semester code so the client can update its state and avoid redundant refetches.

---

## API Route: `GET /api/curriculum/:programId`

Calls `getCurriculumByProgramId(programId)` and returns the JSON blob. No transformation — the client's `parseCourses` handles array-to-object conversion.

---

## API Route: `GET /api/degree-programs`

Calls `getAllPrograms()` and returns `{ programs: DegreeProgram[] }`.
