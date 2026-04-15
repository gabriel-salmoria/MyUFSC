export async function fetchProfessorDetails(professorId: string) {
  const res = await fetch(
    `/api/professors/${encodeURIComponent(professorId)}/details`,
  );
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to fetch professor details");
  }
  return res.json();
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

export async function fetchProfessorAggregates(courseIds: string[]) {
  if (!courseIds || courseIds.length === 0) return {};
  const res = await fetch(`/api/professors/aggregates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseIds }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to fetch aggregates");
  }
  const data = await res.json();
  return data.aggregates;
}

export async function submitVote(
  reviewId: string,
  voterHash: string,
  value: 1 | -1,
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
