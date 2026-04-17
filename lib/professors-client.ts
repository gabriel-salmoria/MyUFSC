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

// Deduplicate in-flight requests and cache responses for 30 s
const _aggregatesCache = new Map<string, { data: any; expiresAt: number }>();
const _aggregatesInFlight = new Map<string, Promise<any>>();

export async function fetchProfessorAggregates(courseIds: string[]) {
  if (!courseIds || courseIds.length === 0) return {};
  const key = [...courseIds].sort().join(",");

  const cached = _aggregatesCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const inflight = _aggregatesInFlight.get(key);
  if (inflight) return inflight;

  const request = fetch(`/api/professors/aggregates`, {
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
      _aggregatesCache.set(key, { data: data.aggregates, expiresAt: Date.now() + 30_000 });
      return data.aggregates;
    })
    .finally(() => {
      _aggregatesInFlight.delete(key);
    });

  _aggregatesInFlight.set(key, request);
  return request;
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
