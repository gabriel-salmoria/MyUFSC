# Professor Rating System

The professor rating system allows students to anonymously review professors, write threaded replies, and vote on reviews. Ratings are aggregated per-professor and displayed as badges throughout the timetable and course selection UI.

---

## Data Model

### `professor_courses` table

Maps normalized professor names to course codes they teach. Populated by `scripts/update-professors.ts` which reads schedule data and extracts professor→course relationships.

`professorId` is the **normalized** professor name: NFD → strip diacritics → uppercase → collapse whitespace → trim. Example: `"João da Silva Neto"` → `"JOAO DA SILVA NETO"`.

### `reviews` table

Unified table for reviews and replies (self-referential via `parentId`):

| Column | Description |
|---|---|
| `id` | UUID primary key |
| `professorId` | Normalized professor name |
| `courseId` | Course code (e.g. `"INE5404"`) |
| `authorHash` | Anonymous user hash — not the real `userId` |
| `parentId` | `NULL` for top-level reviews; parent review UUID for replies |
| `text` | Up to 500 characters |
| `scores` | `{ overall: 1-5, difficulty: 1-5, didactics: 1-5 }` — only for top-level reviews |
| `createdAt` | Creation timestamp |
| `updatedAt` | Edit timestamp — only set on PUT edits to replies |

Soft-deleted reviews: when a review with replies is deleted, the text is set to `"[removido]"` rather than hard-deleting the row (to preserve the reply thread). The unique index on `(authorHash, professorId, courseId) WHERE parentId IS NULL AND text != '[removido]'` allows a new review to be submitted after soft-deletion.

### `review_votes` table

Stores upvote/downvote per review per voter. `value` is `1` (upvote) or `-1` (downvote). The primary key `(reviewId, voterHash)` prevents double-voting.

---

## Professor Name Normalization — `lib/professors.ts`

```ts
function normalizeProfessorId(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // strip diacritics
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}
```

This normalization is applied when inserting into `professor_courses`, when looking up details, and when matching professors from the timetable to the ratings system. The same logic must be applied wherever a professor name is used as a lookup key.

Note: this function is duplicated in `app/api/professors/[id]/details/route.ts` and `app/api/professors/[id]/reviews/route.ts`, and a variant exists as `normalizeProfName` in `professor-selector.tsx`. They should be consolidated into the shared `lib/professors.ts`.

---

## Pseudonym Generation — `lib/professors.ts`

Reviews are displayed with animal-based pseudonyms for anonymity:

```ts
function generatePseudonym(authorHash: string, professorId: string): string {
  const hash = sha256(authorHash + professorId);
  const num = parseInt(hash.substring(0, 8), 16);
  const animal = ANIMALS[num % ANIMALS.length];  // 22 Brazilian animals
  const number = (num % 1000).toString().padStart(3, "0");
  return `${animal}${number}`;  // e.g. "Capivara042"
}
```

The pseudonym is deterministic: the same user in the same professor thread always gets the same animal name. But different professors or different users produce different animals. The review author is identified as `"Autor da Avaliação"`.

---

## Content Moderation — `lib/professors.ts`

```ts
function isTextClean(text: string): boolean
```

Checks for a hardcoded list of Portuguese profanity and hate-speech terms using word-boundary regex (`\b<word>\b`). Returns `false` if any match. Called on the server before inserting a review or reply.

---

## API Endpoints

### `POST /api/professors/aggregates`

**Purpose:** Fast payload for showing rating badges in the timetable UI.

**Input:** `{ courseIds: string[] }` — the course IDs currently visible.

**Algorithm:**
1. Runs two queries in parallel:
   - **General query:** `LEFT JOIN professor_courses p + reviews r WHERE p.courseId = ANY(courseIds)` → per-professor averages across all courses.
   - **Per-course query:** same join, but `GROUP BY professorId, courseId` → per-professor-per-course averages.
2. Assembles `aggregates[professorName] = { overall, difficulty, didactics, totalReviews, byCourse: {...} }`.

**Caching:** Uses Next.js `unstable_cache` with a 5-minute revalidate window. The cache key includes the sorted course IDs, so the same set of courses always hits the same cache entry. HTTP `Cache-Control: s-maxage=300, stale-while-revalidate=86400` is also set.

### `GET /api/professors/:id/details?voterHash=`

**Purpose:** Full professor data for the details dialog.

**Normalization:** The `:id` path param is URL-decoded and normalized before use.

**Three parallel queries:**
1. Aggregate stats per course (`GROUP BY courseId WHERE parentId IS NULL`).
2. All courses taught by this professor (`professor_courses`).
3. Top-level reviews (LIMIT 20, DESC by `createdAt`).

**Reply fetch:** After getting the reviews, fetches all replies using a recursive CTE:
```sql
WITH RECURSIVE reply_tree AS (
  SELECT ... FROM reviews WHERE parentId = ANY(reviewIds)
  UNION ALL
  SELECT r.* FROM reviews r INNER JOIN reply_tree rt ON r.parentId = rt.id
)
SELECT * FROM reply_tree ORDER BY createdAt ASC
```

**Vote fetch:** A single query covers all review and reply IDs at once:
```sql
SELECT reviewId,
  SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END) AS upvotes,
  SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END) AS downvotes,
  MAX(CASE WHEN voterHash = $2 THEN value ELSE NULL END) AS myVote
FROM review_votes WHERE reviewId = ANY($1)
GROUP BY reviewId
```

The `voterHash` param (optional) allows returning the current user's vote per review without a second query.

**Response:**
```json
{
  "statsPerCourse": { "INE5404": { "overall": 4.2, ... } },
  "reviews": [ { "id", "courseId", "pseudonym", "text", "scores", "upvotes", "downvotes", "myVote", ... } ],
  "replies": [ { "id", "parentId", "pseudonym", "text", ... } ]
}
```

### `GET /api/professors/:id/reviews`

Paginated endpoint for submitting/editing/deleting top-level reviews. Handles `POST` (create), `PUT` (edit), `DELETE`.

### `POST /api/reviews/:id/reply`

Creates or deletes a reply to a review. On DELETE with child replies, performs soft-delete (`text = '[removido]'`); without children, hard-deletes.

### `POST /api/reviews/:id/vote`

Upserts into `review_votes`. If the user votes the same direction again, it's treated as a toggle (delete the vote).

### `GET /api/professors/search`

Full-text search against `professor_courses.professorId` using `ILIKE '%query%'`. Returns up to 20 results with aggregate stats joined.

---

## Frontend Components

### `ProfessorSearch` — `components/professors/professor-search.tsx`

Search modal accessible from the header. Stores results in `useState<ProfessorSearchResult[]>`. Results are only invalidated when the user types a new query — there's no external invalidation signal when a review is submitted.

### `ProfessorDetailsDialog` — `components/professors/professor-details-dialog.tsx`

Full-page slide-out dialog showing:
- Overall aggregate stats header (overall, difficulty, didactics averages)
- Per-course breakdown
- Threaded review feed (top-level reviews with reply threads up to 1 level deep)

Uses a `refreshKey` counter: every mutation (submit, edit, delete review/reply) increments it, triggering a full data reload. This causes a brief loading state after every action.

Key state:
- `stats: Record<courseId, CourseStats>` — per-course averages
- `reviews: Review[]` — top-level reviews with vote counts
- `voteState: Record<reviewId, { upvotes, downvotes, myVote }>` — optimistic vote state (reset on dialog close)
- `replyingTo: string | null` — which review is being replied to
- `replyText: string` — shared text state across all reply boxes

### `ProfessorRatingBadge` — `components/professors/ProfessorRatingBadge.tsx`

Small colored badge showing the overall rating. Color coding:
- `≥ 4.0` → green
- `3.0 – 3.9` → yellow
- `< 3.0` → red
- No reviews → neutral/gray

### `WriteReviewDialog` — `components/professors/write-review-dialog.tsx`

Dialog for submitting a new review. Contains:
- Course selector (filtered to courses the student has taken AND the professor teaches)
- Three 1-5 star sliders: overall, difficulty, didactics
- Textarea with live character count (0/500)

---

## `lib/professors-client.ts`

Client-side helper that calls `POST /api/professors/aggregates`:

```ts
async function fetchProfessorAggregates(courseIds: string[])
  : Promise<Record<string, ProfessorAggregate>>
```

Used by the `Timetable` component to fetch badge data for the courses in the current phase.
