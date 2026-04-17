// Cache professor details for 2 min. Invalidated explicitly after any review mutation.
const _detailsCache = new Map<string, { data: any; expiresAt: number }>();
const _detailsInFlight = new Map<string, Promise<any>>();

export async function fetchProfessorDetails(
  professorId: string,
  voterHash?: string,
) {
  const key = `${professorId}:${voterHash ?? ""}`;

  const cached = _detailsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const inflight = _detailsInFlight.get(key);
  if (inflight) return inflight;

  const url = new URL(
    `/api/professors/${encodeURIComponent(professorId)}/details`,
    window.location.origin,
  );
  if (voterHash) url.searchParams.set("voterHash", voterHash);

  const request = fetch(url.toString())
    .then(async (res) => {
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to fetch professor details");
      }
      const data = await res.json();
      _detailsCache.set(key, { data, expiresAt: Date.now() + 120_000 });
      return data;
    })
    .finally(() => {
      _detailsInFlight.delete(key);
    });

  _detailsInFlight.set(key, request);
  return request;
}

/** Call this after submitting/editing/deleting a review so the next open fetches fresh data. */
export function invalidateProfessorDetailsCache(professorId: string) {
  for (const key of _detailsCache.keys()) {
    if (key.startsWith(`${professorId}:`)) _detailsCache.delete(key);
  }
}

export async function submitReply(
  parentId: string,
  authorHash: string,
  text: string,
) {
  const res = await fetch(`/api/reviews/${parentId}/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ authorHash, text }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to submit reply");
  }
  return res.json();
}

export async function updateReview(
  professorId: string,
  courseId: string,
  authorHash: string,
  text: string,
  scores: { overall: number; difficulty: number; didactics: number },
) {
  const res = await fetch(
    `/api/professors/${encodeURIComponent(professorId)}/reviews`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId, authorHash, text, scores }),
    },
  );
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to update review");
  }
  return res.json();
}

export async function submitReview(
  professorId: string,
  courseId: string,
  authorHash: string,
  text: string,
  scores: { overall: number; difficulty: number; didactics: number },
) {
  const res = await fetch(
    `/api/professors/${encodeURIComponent(professorId)}/reviews`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId, authorHash, text, scores }),
    },
  );
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to submit review");
  }
  return res.json();
}

// LRU working set cache for professor aggregates.
// Each courseId key stores the full batch result returned for a request that included it.
// Fresh window: 5 min (return immediately). Stale window: 24 h (return immediately + revalidate in bg).
// Entries beyond MAX_SIZE evict the least-recently-accessed first.
const MAX_AGGREGATES_CACHE = 200;
const AGGREGATES_FRESH_MS = 5 * 60 * 1000;
const AGGREGATES_STALE_MS = 24 * 60 * 60 * 1000;

interface AggregatesEntry {
  data: any;
  fetchedAt: number;
  lastAccessed: number;
}

const _aggregatesCache = new Map<string, AggregatesEntry>();
const _aggregatesInFlight = new Map<string, Promise<any>>();

function _touchAggregatesEntry(key: string): AggregatesEntry | undefined {
  const entry = _aggregatesCache.get(key);
  if (entry) entry.lastAccessed = Date.now();
  return entry;
}

function _evictAggregatesLRU() {
  if (_aggregatesCache.size <= MAX_AGGREGATES_CACHE) return;
  let lruKey = "";
  let lruTime = Infinity;
  for (const [key, entry] of _aggregatesCache) {
    if (entry.lastAccessed < lruTime) {
      lruTime = entry.lastAccessed;
      lruKey = key;
    }
  }
  if (lruKey) _aggregatesCache.delete(lruKey);
}

async function _fetchAggregatesFromServer(courseIds: string[]): Promise<any> {
  const fetchKey = courseIds.join(",");
  let request = _aggregatesInFlight.get(fetchKey);
  if (!request) {
    request = fetch(`/api/professors/aggregates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseIds }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || "Failed to fetch aggregates");
        }
        const data = await res.json();
        return data.aggregates;
      })
      .finally(() => {
        _aggregatesInFlight.delete(fetchKey);
      });
    _aggregatesInFlight.set(fetchKey, request);
  }
  return request;
}

function _revalidateAggregatesInBackground(courseIds: string[]) {
  _fetchAggregatesFromServer(courseIds)
    .then((aggregates) => {
      const now = Date.now();
      for (const id of courseIds) {
        const existing = _aggregatesCache.get(id);
        _aggregatesCache.set(id, {
          data: aggregates,
          fetchedAt: now,
          lastAccessed: existing?.lastAccessed ?? now,
        });
        _evictAggregatesLRU();
      }
    })
    .catch(() => {});
}

export async function fetchProfessorAggregates(courseIds: string[]) {
  if (!courseIds || courseIds.length === 0) return {};
  const uniqueCourseIds = Array.from(new Set(courseIds)).sort();

  const now = Date.now();
  const staleIds: string[] = [];
  const missingIds: string[] = [];

  for (const id of uniqueCourseIds) {
    const entry = _touchAggregatesEntry(id);
    if (!entry || now - entry.fetchedAt > AGGREGATES_STALE_MS) {
      missingIds.push(id);
    } else if (now - entry.fetchedAt > AGGREGATES_FRESH_MS) {
      staleIds.push(id);
    }
  }

  // Stale entries: serve from cache now, revalidate in background (stale-while-revalidate)
  if (staleIds.length > 0) {
    _revalidateAggregatesInBackground(staleIds);
  }

  // Missing entries: must fetch before returning
  if (missingIds.length > 0) {
    const fetched = await _fetchAggregatesFromServer(missingIds);
    const fetchedAt = Date.now();
    for (const id of missingIds) {
      _aggregatesCache.set(id, { data: fetched, fetchedAt, lastAccessed: fetchedAt });
      _evictAggregatesLRU();
    }
    const result: any = { ...fetched };
    for (const id of uniqueCourseIds) {
      if (!missingIds.includes(id)) {
        const entry = _aggregatesCache.get(id);
        if (entry) Object.assign(result, entry.data);
      }
    }
    return result;
  }

  const result: any = {};
  for (const id of uniqueCourseIds) {
    const entry = _aggregatesCache.get(id);
    if (entry) Object.assign(result, entry.data);
  }
  return result;
}

export async function submitVote(
  reviewId: string,
  voterHash: string,
  value: 1 | -1 | 0,
) {
  const res = await fetch(`/api/reviews/${reviewId}/vote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ voterHash, value }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to submit vote");
  }
  return res.json(); // { upvotes, downvotes }
}

export async function searchProfessors(query: string) {
  if (!query || query.length < 2) return [];
  const res = await fetch(
    `/api/professors/search?q=${encodeURIComponent(query)}`,
  );
  if (!res.ok) {
    throw new Error("Failed to search professors");
  }
  const data = await res.json();
  return data.professors || [];
}

export async function deleteReview(reviewId: string, authorHash: string) {
  const res = await fetch(`/api/reviews/${reviewId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ authorHash }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to delete review");
  }
  return res.json();
}
export async function updateReply(
  replyId: string,
  authorHash: string,
  text: string,
) {
  const res = await fetch(`/api/reviews/${replyId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ authorHash, text }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to update reply");
  }
  return res.json();
}
