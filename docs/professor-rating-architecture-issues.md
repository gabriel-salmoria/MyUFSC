# Professor Rating System — Architecture Issues & Improvement Plan

This document catalogs all identified bugs, inconsistencies, and architectural problems in the current MVP. The goal is to use this as a planning reference before redesigning the feature properly.

---

## 1. Known UX Bugs (User-Reported)

### 1.1 Votes already use optimistic update — but lag might still exist
**Status:** Partially implemented. `handleVote` applies the state update synchronously before the `await submitVote(...)` call, so the UI should feel instant. However:
- There is no debounce or cooldown — rapid double-clicking sends multiple requests and can cause inconsistent server state.
- After the server responds, the local counts are replaced with server totals, which may cause a visible "re-snap" if the server and optimistic state disagree.
- On error, the state reverts, which may surprise the user silently.

### 1.2 Professor banner stale in the professor-selector after rating
**Files:** `components/schedule/professor-selector.tsx`, `components/schedule/timetable.tsx`

When a review is submitted via `ProfessorDetailsDialog`, `onReviewChanged` fires, which increments `aggregatesRefreshKey` in timetable, which re-fetches `professorAggregates`. So the `ProfessorSelector` badges **do** get refreshed — but with a delay (async re-fetch round-trip), which creates a visual inconsistency right after submission.

More importantly: the `ProfessorSearch` component (the search modal in the sidebar) shows professor rating badges fetched at search time and cached locally in `useState`. These **never** get invalidated after a review is submitted. If you close the dialog and re-open the search, you see the old rating until you re-type the query.

---

## 2. Data / Correctness Bugs

### 2.1 `createdAt` reset on review edit — `updatedAt` never set
**File:** `app/api/professors/[id]/reviews/route.ts`, line 42

```sql
SET text = $1, scores = $2, "createdAt" = NOW()
```

This overwrites the original creation date with the edit time and **never sets `updatedAt`**. Consequences:
- Original creation date is permanently lost after the first edit.
- The "Editado em..." label in `CommentCard` checks `updatedAt` — since it's never set for top-level reviews, this label never appears for them (only for replies, which use the correct `PUT /api/reviews/[id]` endpoint that properly sets `updatedAt`).

Fix: change to `SET text = $1, scores = $2, "updatedAt" = NOW()`.

### 2.2 User's own vote not persisted anywhere
`voteState` lives entirely in component state inside `ProfessorDetailsSection`. When the dialog closes and reopens, `voteState` resets to `{}`. The `/api/professors/[id]/details` endpoint returns total `upvotes`/`downvotes` per review but **no `myVote` field**. So on reopen, the user sees all vote buttons as neutral even if they voted previously. The server has the data (`review_votes` table with `voterHash`), but it's never queried with the user's hash.

### 2.3 `WriteReviewDialog` missing `onReviewChanged`
**File:** `components/schedule/timetable.tsx`, line 669–676

`WriteReviewDialog` is rendered without any `onReviewChanged` callback. Submitting a review through it does not trigger `aggregatesRefreshKey++`, so the timetable's professor badges don't update.

Additionally, the `onWriteReview` prop received by `ProfessorDetailsSection` (which is supposed to open this dialog) is **never called anywhere inside the component**. The dialog is effectively unreachable from its intended path — it's orphaned dead code.

---

## 3. Architecture Issues

### 3.1 Full re-fetch on every mutation (`refreshKey` pattern)
**File:** `components/professors/professor-details-dialog.tsx`

Every mutation (submit review, edit review, delete review, submit reply, edit reply) increments `refreshKey`, which triggers a full reload of all reviews + replies + stats for the professor. Problems:
- Shows a loading spinner that hides the entire mural on each action.
- Destroys any in-progress text in the reply box if a refresh fires while the user is typing somewhere else.
- Multiple round-trips to the server (separate queries for aggregate stats, reviews, vote counts for reviews, replies, vote counts for replies — at least 4–5 sequential or parallel queries per refresh).
- No granular cache invalidation — if 50 reviews exist, they all reload because one was added.

Better: patch local state on mutation success (add the new review to `reviews[]`, update the stats object), and only re-fetch in the background to sync.

### 3.2 Vote counts fetched in multiple separate queries
**File:** `app/api/professors/[id]/details/route.ts`

Vote counts are fetched in two separate queries after the main data: one for top-level reviews, one for replies. Both use the same SQL pattern. These could be combined into a single query covering all IDs at once. Better still, vote counts (and optionally `myVote`) should be included in the main reviews/replies query via a LEFT JOIN.

### 3.3 `normalizeId` duplicated across routes
The same normalization logic (NFD → strip accents → uppercase → trim) is copy-pasted in:
- `app/api/professors/[id]/details/route.ts` (inline)
- `app/api/professors/[id]/reviews/route.ts` (as `normalizeId` function)

It's also duplicated in `professor-selector.tsx` as `normalizeProfName`. Should live in a single shared utility.

### 3.4 No pagination
**File:** `app/api/professors/[id]/details/route.ts`, line 51

Reviews are fetched with `LIMIT 20` and no offset or cursor. Reviews older than the 20th are permanently invisible. There's no "load more" on the frontend either. As usage grows, this will silently discard data.

### 3.5 Two parallel implementations of the review compose form
`ProfessorDetailsSection` has a full inline compose box (stars + textarea + submit). `WriteReviewDialog` is a separate dialog with its own star rating component (`StarRating` vs `StarColumn`), its own validation, its own submit handler. They do the same thing with different UX and no shared code. The dialog one doesn't support editing existing reviews. One should be removed or both refactored to share a base component.

---

## 4. State & Reactivity Issues

### 4.1 `voteState` resets on dialog close
When the user closes `ProfessorDetailsDialog` and reopens it, all optimistic vote state is gone. The reviews re-load with the correct server totals, but the user's own vote buttons (which button is highlighted) appear unvoted. This is because `myVote` is never retrieved from the server.

### 4.2 `replyText` shared across all reply boxes
**File:** `components/professors/professor-details-dialog.tsx`

There is a single `replyText` state string shared across all reply boxes throughout the whole thread tree. The active reply box is controlled by `replyingTo`, so only one is visible. But if you start typing a reply to review A, cancel, then open the reply box on review B, your typed text is still there.

Fix: either reset `replyText` when `replyingTo` changes, or move text state into `CommentCard`.

### 4.3 `ProfessorSearch` results are stale after rating
**File:** `components/professors/professor-search.tsx`

Search results are stored in local `useState<ProfessorSearchResult[]>` and are only refreshed when the user types a new query. The `ProfessorSearch` component has no way to receive an external "invalidate" signal. After rating a professor:
- The rating badge in the search results still shows the old overall score.
- The review count is still the old count.

### 4.4 `getAnonymousUserId` called repeatedly per render
**Files:** `professor-details-dialog.tsx`

`getAnonymousUserId(userId)` is called in:
- `myReviewByCourse` useMemo
- `alreadyReviewedCourses` useMemo
- Inside the render IIFE (line ~1201)
- Inside `handleVote`
- Inside `handleReplySubmit`, `handleEditReplySubmit`, `handleDeleteReview`, `handleReviewSubmit`

It should be computed once at the top of the component and reused. Currently it reads from `localStorage` on many of these calls.

### 4.5 `getOverallStats()` not memoized
**File:** `professor-details-dialog.tsx`, line 923

`getOverallStats()` is defined as a regular function and called directly in the render body (`const overallStats = getOverallStats()`). It iterates over all `stats` values on every render. Should be `useMemo(() => ..., [stats])`.

---

## 5. UX / Interaction Issues

### 5.1 No loading state for reply submit, edit, or delete
Only the review submit button shows a spinner (`submittingReview`). All other async actions (reply, edit reply, delete, edit review) have no loading indicator. Users can click the action multiple times before the first request resolves.

### 5.2 Soft-deleted reviews create visual clutter
Reviews deleted while having replies become `[removido]` placeholders that remain visible in the mural. A thread with several deleted nodes has a lot of empty placeholder entries. The current logic always soft-deletes when replies exist — there's no threshold or pruning.

Consider: collapse soft-deleted nodes (show nothing, or a very compact tombstone), and add a periodic cleanup job to hard-delete subtrees where all nodes are soft-deleted.

### 5.3 `VoteSidebar` `disabled` prop hardcoded to `false`
**File:** `professor-details-dialog.tsx`, line 239

```tsx
<VoteSidebar ... disabled={false} />
```

The `disabled` prop exists on `VoteSidebar` and wires up conditional CSS + a tooltip ("Faça login para votar"), but it's always passed as `false`. Either hook this up to an actual condition (e.g., user not authenticated) or remove the prop.

### 5.4 Dual input in `ProfessorSearch`
**File:** `components/professors/professor-search.tsx`

There are two `<input>` elements bound to the same `query` state — one in the trigger area (always visible) and one inside the popup overlay. Both update simultaneously. This creates focus confusion and duplicates event handling.

### 5.5 Search result limit mismatch
**File:** `components/professors/professor-search.tsx`, line 106

```ts
const displayedResults = results.slice(0, 50);
```

The search API returns `LIMIT 20` results. The frontend slices to 50. The keyboard navigation also uses `Math.min(results.length, 50)`. The constant 50 is dead code — it can never be reached.

---

## 6. Code Quality

### 6.1 `ReplyThread` prop drilling (17 props)
`ReplyThread` receives 17 props and passes most of them unchanged into its recursive calls and into each `CommentCard`. This makes the component hard to maintain and the recursion very verbose. A React context for the shared handlers (vote, reply, edit, delete, collapse) would eliminate the drilling.

### 6.2 `onWriteReview` prop is unused
**File:** `professor-details-dialog.tsx`, line 610–615

`ProfessorDetailsSection` accepts an `onWriteReview` prop in its signature but never calls it. The prop is passed through from `ProfessorDetailsDialog` all the way from `timetable.tsx`, but the actual compose box is inline in `ProfessorDetailsSection` itself. The prop and all its plumbing can be removed.

### 6.3 `handleDeleteReview` reused as reply delete handler
**File:** `professor-details-dialog.tsx`, line 1308

`handleDelete={handleDeleteReview}` is passed to `ReplyThread`. `handleDeleteReview` calls `deleteReview(reviewId, myHash)` and also calls `onReviewChanged?.()`. Deleting a reply shouldn't propagate `onReviewChanged` to the parent (it doesn't affect professor aggregates), but currently it does, causing an unnecessary aggregate re-fetch.

---

## Summary Table

| # | Issue | Severity | Type |
|---|-------|----------|------|
| 1.1 | Vote optimistic update — rapid clicks | Low | UX |
| 1.2 | Professor badge stale in search after rating | Medium | UX / Bug |
| 2.1 | `createdAt` reset on edit, `updatedAt` never set | High | Bug |
| 2.2 | `myVote` not returned from API, lost on reopen | Medium | Bug |
| 2.3 | `WriteReviewDialog` orphaned, no `onReviewChanged` | Medium | Bug |
| 3.1 | Full re-fetch on every mutation | High | Architecture |
| 3.2 | Vote counts in 2 extra queries per load | Medium | Performance |
| 3.3 | `normalizeId` duplicated in 3+ places | Low | Code quality |
| 3.4 | No pagination (LIMIT 20, no cursor) | High | Architecture |
| 3.5 | Two parallel compose form implementations | Medium | Code quality |
| 4.1 | `voteState` reset on dialog close | Medium | UX |
| 4.2 | `replyText` shared across all reply boxes | Low | UX / Bug |
| 4.3 | `ProfessorSearch` results never invalidated | Medium | UX |
| 4.4 | `getAnonymousUserId` called many times per render | Low | Performance |
| 4.5 | `getOverallStats` not memoized | Low | Performance |
| 5.1 | No loading state for reply/edit/delete | Low | UX |
| 5.2 | Soft-deleted reviews clutter the mural | Low | UX |
| 5.3 | `VoteSidebar.disabled` always false | Low | Code quality |
| 5.4 | Dual input elements in `ProfessorSearch` | Low | UX |
| 5.5 | Search slice to 50, API returns max 20 | Low | Code quality |
| 6.1 | 17-prop drilling in `ReplyThread` | Medium | Code quality |
| 6.2 | `onWriteReview` prop accepted but never called | Low | Code quality |
| 6.3 | Reply delete triggers `onReviewChanged` unnecessarily | Low | Bug |
