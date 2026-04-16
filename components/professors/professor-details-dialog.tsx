"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useStudentStore } from "@/lib/student-store";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchProfessorDetails,
  submitReply,
  submitReview,
  submitVote,
  updateReview,
  deleteReview,
  updateReply,
} from "@/lib/professors-client";
import { getAnonymousUserId } from "@/lib/user-identity";
import {
  Loader2,
  MessageSquare,
  Star,
  Reply,
  BookOpen,
  Brain,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ProfessorDetailsDialogProps {
  taughtCourses?: string[];
  professorId: string | null;
  onClose: () => void;
  onReviewChanged?: () => void;
}

interface Review {
  id: string;
  courseId: string;
  authorHash: string;
  pseudonym?: string;
  text: string;
  scores: {
    overall: number;
    difficulty: number;
    didactics: number;
  } | null;
  createdAt: string;
  updatedAt?: string;
  upvotes: number;
  downvotes: number;
}

interface ReplyObj {
  id: string;
  parentId: string;
  authorHash: string;
  pseudonym?: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
  upvotes: number;
  downvotes: number;
}

interface Stats {
  totalReviews: number;
  overall: number | null;
  difficulty: number | null;
  didactics: number | null;
}

const animalEmojis: Record<string, string> = {
  Capivara: "🦦",
  Jacaré: "🐊",
  Sagui: "🐒",
  Quati: "🦝",
  Tucano: "🦜",
  Arara: "🦜",
  Tamanduá: "🐜",
  Preguiça: "🦥",
  "Gato-do-mato": "🐈",
  "Macaco-prego": "🦍",
  Puma: "🐆",
  Ocelote: "🐆",
  Tatu: "🦔",
  Garça: "🦩",
  Coruja: "🦉",
  Sapo: "🐸",
  "Cachorro-do-mato": "🐕",
  Gavião: "🦅",
  "Pica-pau": "🐦",
  Teiú: "🦎",
  "Quero-quero": "🦆",
  Marreco: "🦆",
};

function getEmojiForPseudonym(pseudonym?: string) {
  if (!pseudonym) return "👤";
  for (const [animal, emoji] of Object.entries(animalEmojis)) {
    if (pseudonym.includes(animal)) return emoji;
  }
  return "👤";
}

function VoteSidebar({
  upvotes,
  downvotes,
  voteState,
  onVote,
  disabled,
}: {
  upvotes: number;
  downvotes: number;
  voteState?: { upvotes: number; downvotes: number; myVote: 1 | -1 | 0 };
  onVote: (v: 1 | -1) => void;
  disabled?: boolean;
}) {
  const up = voteState ? voteState.upvotes : upvotes;
  const myVote = voteState?.myVote ?? 0;
  const score = up - (voteState ? voteState.downvotes : downvotes);
  return (
    <div className="flex flex-col items-center gap-1 pt-1 min-w-[32px]">
      <button
        type="button"
        onClick={() => !disabled && onVote(1)}
        title={disabled ? "Faça login para votar" : undefined}
        className={`p-1 rounded transition-colors ${disabled ? "text-muted-foreground/30 cursor-not-allowed" : myVote === 1 ? "text-green-600" : "text-muted-foreground/50 hover:text-green-600"}`}
      >
        <ThumbsUp className="w-4 h-4" />
      </button>
      <span
        className={`text-xs font-semibold tabular-nums ${score > 0 ? "text-green-600" : score < 0 ? "text-red-500" : "text-muted-foreground"}`}
      >
        {score}
      </span>
      <button
        type="button"
        onClick={() => !disabled && onVote(-1)}
        title={disabled ? "Faça login para votar" : undefined}
        className={`p-1 rounded transition-colors ${disabled ? "text-muted-foreground/30 cursor-not-allowed" : myVote === -1 ? "text-red-500" : "text-muted-foreground/50 hover:text-red-500"}`}
      >
        <ThumbsDown className="w-4 h-4" />
      </button>
    </div>
  );
}

function CommentCard({
  id,
  pseudonym,
  isMe,
  date,
  updatedAt,
  text,
  scores,
  courseName,
  upvotes,
  downvotes,
  voteState,
  onVote,
  onReply,
  onEdit,
  onDelete,
  isEditing,
  editValue,
  onEditChange,
  onEditSave,
  onEditCancel,
  isReplyOpen,
  replyText,
  onReplyTextChange,
  onReplySubmit,
  onReplyCancel,
  isAuthenticated,
  isCollapsed,
  onToggleCollapse,
}: {
  id: string;
  pseudonym?: string;
  isMe: boolean;
  date: string;
  text: string;
  scores?: { overall: number; difficulty: number; didactics: number };
  courseName?: string;
  upvotes: number;
  downvotes: number;
  voteState?: { upvotes: number; downvotes: number; myVote: 1 | -1 | 0 };
  onVote: (v: 1 | -1) => void;
  onReply: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  isEditing?: boolean;
  editValue?: string;
  onEditChange?: (v: string) => void;
  onEditSave?: () => void;
  onEditCancel?: () => void;
  isReplyOpen: boolean;
  replyText: string;
  onReplyTextChange: (v: string) => void;
  onReplySubmit: () => void;
  onReplyCancel: () => void;
  isAuthenticated: boolean;
  updatedAt?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const isDeleted = text === "[removido]";
  return (
    <div
      className={`border rounded-xl ${isMe ? "bg-primary/5 border-primary/30" : "bg-card"}`}
    >
      <div className="flex gap-3 p-4">
        {/* Vote sidebar */}
        {!isDeleted ? (
          <VoteSidebar
            upvotes={upvotes}
            downvotes={downvotes}
            voteState={voteState}
            onVote={onVote}
            disabled={false}
          />
        ) : (
          <div className="w-[32px]" />
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Row 1: name + date */}
          <div className="flex items-center justify-between gap-2 w-full mb-1">
            <div className="flex items-center gap-1.5 min-w-0">
              {onToggleCollapse && (
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  className="p-0.5 hover:bg-muted rounded text-muted-foreground mr-0.5"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
              <span className="text-base shrink-0">
                {getEmojiForPseudonym(pseudonym)}
              </span>
              <span className="text-sm font-semibold truncate">
                {pseudonym || "Anônimo"}
              </span>
              {isMe && (
                <span className="text-[10px] text-primary font-semibold shrink-0">
                  você
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!isDeleted && onEdit && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                  onClick={onEdit}
                >
                  editar
                </button>
              )}
              {!isDeleted && onDelete && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="text-xs text-red-500/70 hover:text-red-500 underline ml-1"
                    >
                      excluir
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Tem certeza que deseja excluir?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={onDelete}
                        className="bg-red-600 hover:bg-red-700 text-white"
                      >
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <span className="text-[10px] text-muted-foreground/70 text-right">
                {updatedAt && !isDeleted
                  ? `Editado em ${new Date(updatedAt).toLocaleDateString("pt-BR")}`
                  : new Date(date).toLocaleDateString("pt-BR")}
              </span>
            </div>
          </div>

          {!isCollapsed && (
            <>
              {/* Row 2: course badge + scores (optional) */}
              {(courseName || scores) && (
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {courseName && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-4"
                    >
                      {courseName}
                    </Badge>
                  )}
                  {scores && (
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-0.5 text-yellow-600 font-medium">
                        <Star className="w-2.5 h-2.5 fill-current" />{" "}
                        {scores.overall}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Brain className="w-2.5 h-2.5 text-red-400" />{" "}
                        {scores.difficulty}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <BookOpen className="w-2.5 h-2.5 text-blue-400" />{" "}
                        {scores.didactics}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {isEditing ? (
                <div className="mt-2 space-y-2">
                  <Textarea
                    value={editValue}
                    onChange={(e) => onEditChange?.(e.target.value)}
                    className="text-sm min-h-[60px] bg-background resize-none w-full"
                  />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={onEditCancel}>
                      Cancelar
                    </Button>
                    <Button size="sm" onClick={onEditSave}>
                      Salvar
                    </Button>
                  </div>
                </div>
              ) : (
                <p
                  className={`text-sm leading-relaxed ${isDeleted ? "text-muted-foreground italic" : "text-card-foreground"}`}
                >
                  {text}
                </p>
              )}

              {!isDeleted && !isEditing && (
                <button
                  type="button"
                  onClick={onReply}
                  className="mt-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <Reply className="w-3 h-3" /> Responder
                </button>
              )}

              {/* Inline reply form */}
              <AnimatePresence>
                {isReplyOpen && (
                  <motion.div
                    key="reply-form"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Textarea
                      placeholder="Escreva sua resposta..."
                      value={replyText}
                      onChange={(e) => onReplyTextChange(e.target.value)}
                      className="text-sm min-h-[60px] bg-background resize-none w-full"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={onReplyCancel}>
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={onReplySubmit}>
                        Responder
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StarColumn({
  icon,
  label,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [hovered, setHovered] = useState(0);
  const display = hovered || value;

  return (
    <div className="flex flex-col items-center gap-0.5">
      {[5, 4, 3, 2, 1].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          className="transition-transform hover:scale-110 active:scale-95"
        >
          <Star
            className="w-7 h-7 transition-colors"
            style={{
              fill: star <= display ? "#fbbf24" : "white",
              stroke: star <= display ? "#f59e0b" : "#94a3b8",
              strokeWidth: 1.5,
            }}
          />
        </button>
      ))}
      <div className="mt-1.5 flex flex-col items-center gap-0.5">
        <span className="text-base leading-none">{icon}</span>
        <span className="text-[10px] font-medium text-muted-foreground">
          {label}
        </span>
      </div>
    </div>
  );
}

function ReplyThread({
  replies,
  parentId,
  myHash,
  voteState,
  handleVote,
  replyingTo,
  setReplyingTo,
  replyText,
  setReplyText,
  handleReplySubmit,
  handleDelete,
  editingReply,
  setEditingReply,
  editReplyText,
  setEditReplyText,
  handleEditReplySubmit,
  collapsedThreads,
  toggleCollapse,
  depth = 0,
  isAuthenticated,
}: {
  replies: ReplyObj[];
  parentId: string;
  myHash: string;
  voteState: Record<string, any>;
  handleVote: (id: string, v: 1 | -1) => void;
  replyingTo: string | null;
  setReplyingTo: (id: string | null) => void;
  replyText: string;
  setReplyText: (text: string) => void;
  handleReplySubmit: (id: string) => void;
  handleDelete: (id: string) => void;
  editingReply: string | null;
  setEditingReply: (id: string | null) => void;
  editReplyText: string;
  setEditReplyText: (text: string) => void;
  handleEditReplySubmit: (id: string) => void;
  collapsedThreads: Set<string>;
  toggleCollapse: (id: string) => void;
  depth?: number;
  isAuthenticated: boolean;
}) {
  const children = replies.filter((r) => r.parentId === parentId);
  if (children.length === 0) return null;

  return (
    <div
      className={`mt-2 flex flex-col gap-2 ${
        depth > 0 ? "ml-8 border-l pl-4 border-border/50" : "ml-8"
      }`}
    >
      <AnimatePresence initial={false}>
        {children.map((reply) => (
          <motion.div
            key={reply.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <CommentCard
              id={reply.id}
              pseudonym={reply.pseudonym}
              isMe={reply.authorHash === myHash}
              isCollapsed={collapsedThreads.has(reply.id)}
              onToggleCollapse={() => toggleCollapse(reply.id)}
              date={reply.createdAt}
              updatedAt={reply.updatedAt}
              text={reply.text}
              upvotes={reply.upvotes ?? 0}
              downvotes={reply.downvotes ?? 0}
              voteState={voteState[reply.id]}
              onVote={(v) => handleVote(reply.id, v)}
              onReply={() => setReplyingTo(reply.id)}
              isReplyOpen={replyingTo === reply.id}
              replyText={replyText}
              onReplyTextChange={setReplyText}
              onReplySubmit={() => handleReplySubmit(reply.id)}
              onReplyCancel={() => setReplyingTo(null)}
              isAuthenticated={isAuthenticated}
              onDelete={
                reply.authorHash === myHash
                  ? () => handleDelete(reply.id)
                  : undefined
              }
              onEdit={
                reply.authorHash === myHash
                  ? () => {
                      setEditingReply(reply.id);
                      setEditReplyText(reply.text);
                    }
                  : undefined
              }
              isEditing={editingReply === reply.id}
              editValue={editReplyText}
              onEditChange={setEditReplyText}
              onEditSave={() => handleEditReplySubmit(reply.id)}
              onEditCancel={() => setEditingReply(null)}
            />
            {!collapsedThreads.has(reply.id) && (
              <ReplyThread
                replies={replies}
                parentId={reply.id}
                myHash={myHash}
                voteState={voteState}
                handleVote={handleVote}
                replyingTo={replyingTo}
                setReplyingTo={setReplyingTo}
                replyText={replyText}
                setReplyText={setReplyText}
                handleReplySubmit={handleReplySubmit}
                handleDelete={handleDelete}
                editingReply={editingReply}
                setEditingReply={setEditingReply}
                editReplyText={editReplyText}
                setEditReplyText={setEditReplyText}
                handleEditReplySubmit={handleEditReplySubmit}
                collapsedThreads={collapsedThreads}
                toggleCollapse={toggleCollapse}
                depth={depth + 1}
                isAuthenticated={isAuthenticated}
              />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

type Scores = { overall: number; difficulty: number; didactics: number };

/**
 * Iteratively removes soft-deleted nodes ([removido]) that have no children.
 * Runs until no more orphans exist (handles chains: grandparent → parent → child).
 */
function cleanupOrphanedSoftDeleted(
  replies: ReplyObj[],
  reviews: Review[],
): { reviews: Review[]; replies: ReplyObj[] } {
  let currReviews = reviews;
  let currReplies = replies;
  let changed = true;
  while (changed) {
    changed = false;
    // Set of IDs that are currently someone's parent
    const parentIds = new Set(currReplies.map((r) => r.parentId));

    const nextReviews = currReviews.filter(
      (r) => r.text !== "[removido]" || parentIds.has(r.id),
    );
    if (nextReviews.length !== currReviews.length) {
      currReviews = nextReviews;
      changed = true;
    }

    const nextReplies = currReplies.filter(
      (r) => r.text !== "[removido]" || parentIds.has(r.id),
    );
    if (nextReplies.length !== currReplies.length) {
      currReplies = nextReplies;
      changed = true;
    }
  }
  return { reviews: currReviews, replies: currReplies };
}

function statsAddReview(stats: Stats, scores: Scores): Stats {
  const n = stats.totalReviews;
  return {
    totalReviews: n + 1,
    overall: ((stats.overall ?? 0) * n + scores.overall) / (n + 1),
    difficulty: ((stats.difficulty ?? 0) * n + scores.difficulty) / (n + 1),
    didactics: ((stats.didactics ?? 0) * n + scores.didactics) / (n + 1),
  };
}

function statsRemoveReview(stats: Stats, scores: Scores): Stats {
  const n = stats.totalReviews;
  if (n <= 1) return { totalReviews: 0, overall: null, difficulty: null, didactics: null };
  return {
    totalReviews: n - 1,
    overall: ((stats.overall ?? 0) * n - scores.overall) / (n - 1),
    difficulty: ((stats.difficulty ?? 0) * n - scores.difficulty) / (n - 1),
    didactics: ((stats.didactics ?? 0) * n - scores.didactics) / (n - 1),
  };
}

function statsEditReview(stats: Stats, oldScores: Scores, newScores: Scores): Stats {
  const n = stats.totalReviews;
  if (n === 0) return stats;
  return {
    totalReviews: n,
    overall: ((stats.overall ?? 0) * n - oldScores.overall + newScores.overall) / n,
    difficulty: ((stats.difficulty ?? 0) * n - oldScores.difficulty + newScores.difficulty) / n,
    didactics: ((stats.didactics ?? 0) * n - oldScores.didactics + newScores.didactics) / n,
  };
}

function ProfessorDetailsSection({
  professorId,
  taughtCourses,
  onReviewChanged,
}: {
  professorId: string;
  taughtCourses?: string[];
  onReviewChanged?: () => void;
}) {
  const { userId, isAuthenticated } = useStudentStore();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Record<string, Stats>>({});
  const [reviews, setReviews] = useState<Review[]>([]);
  const [replies, setReplies] = useState<ReplyObj[]>([]);
  const { toast } = useToast();
  const { curriculumCache } = useStudentStore();

  const myHash = useMemo(() => getAnonymousUserId(userId), [userId]);

  // Build a courseId → name map from the curriculum cache
  const courseNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const courses of Object.values(curriculumCache)) {
      for (const c of courses) {
        if (!map[c.id]) map[c.id] = c.name;
      }
    }
    return map;
  }, [curriculumCache]);

  const [replyText, setReplyText] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [editingReply, setEditingReply] = useState<string | null>(null);
  const [editReplyText, setEditReplyText] = useState("");
  const [collapsedThreads, setCollapsedThreads] = useState<Set<string>>(
    new Set(),
  );
  const toggleCollapse = useCallback((id: string) => {
    setCollapsedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  // Local vote overrides: reviewId → { upvotes, downvotes, myVote }
  const [voteState, setVoteState] = useState<
    Record<string, { upvotes: number; downvotes: number; myVote: 1 | -1 | 0 }>
  >({});

  // Refs for debounced voting — stable across renders
  const voteStateRef = useRef(voteState);
  voteStateRef.current = voteState; // Always up-to-date
  const pendingVotes = useRef<Record<string, 0 | 1 | -1>>({});
  const voteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const committedVoteStates = useRef<
    Record<string, { upvotes: number; downvotes: number; myVote: 0 | 1 | -1 }>
  >({});

  // Clear all pending vote timers when the dialog unmounts
  useEffect(() => {
    return () => {
      for (const timer of Object.values(voteTimers.current)) clearTimeout(timer);
    };
  }, []);

  const handleVote = useCallback(
    (reviewId: string, value: 1 | -1) => {
      const current = voteStateRef.current[reviewId] ?? {
        upvotes: 0,
        downvotes: 0,
        myVote: 0 as const,
      };
      const existing = current.myVote;
      const newVote: 0 | 1 | -1 = existing === value ? 0 : value;

      // Snapshot base state once per debounce window
      if (!voteTimers.current[reviewId]) {
        committedVoteStates.current[reviewId] = { ...current };
      }

      // Optimistic count update
      let up = current.upvotes;
      let down = current.downvotes;
      if (existing === 1) up--;
      if (existing === -1) down--;
      if (newVote === 1) up++;
      if (newVote === -1) down++;

      pendingVotes.current[reviewId] = newVote;
      setVoteState((s) => ({
        ...s,
        [reviewId]: { upvotes: up, downvotes: down, myVote: newVote },
      }));

      // Reset debounce timer — actual request fires 1.5s after last click
      clearTimeout(voteTimers.current[reviewId]);
      voteTimers.current[reviewId] = setTimeout(async () => {
        delete voteTimers.current[reviewId];
        const desiredVote = pendingVotes.current[reviewId] ?? 0;
        const committed = committedVoteStates.current[reviewId];

        // If user toggled back to original state, skip the request entirely
        if (desiredVote === (committed?.myVote ?? 0)) {
          delete committedVoteStates.current[reviewId];
          return;
        }

        try {
          const result = await submitVote(reviewId, myHash, desiredVote);
          delete committedVoteStates.current[reviewId];
          setVoteState((s) => ({
            ...s,
            [reviewId]: {
              upvotes: result.upvotes,
              downvotes: result.downvotes,
              myVote: desiredVote,
            },
          }));
        } catch {
          const base = committedVoteStates.current[reviewId];
          delete committedVoteStates.current[reviewId];
          if (base) setVoteState((s) => ({ ...s, [reviewId]: base }));
        }
      }, 1500);
    },
    [myHash],
  );

  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [reviewText, setReviewText] = useState("");
  const [overall, setOverall] = useState(0);
  const [difficulty, setDifficulty] = useState(0);
  const [didactics, setDidactics] = useState(0);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [isEditingForm, setIsEditingForm] = useState(false);

  const myReviewByCourse = useMemo(() => {
    const map: Record<string, Review> = {};
    for (const r of reviews) {
      if (r.authorHash === myHash && r.text !== "[removido]")
        map[r.courseId] = r;
    }
    return map;
  }, [reviews, myHash]);

  function selectCourse(courseId: string) {
    setReviewText("");
    setOverall(0);
    setDifficulty(0);
    setDidactics(0);
    setIsEditingForm(false);
    setSelectedCourse(courseId);
  }

  function startEditing(courseId: string) {
    const existing = myReviewByCourse[courseId];
    if (existing) {
      setReviewText(existing.text);
      if (existing.scores) {
        setOverall(existing.scores.overall);
        setDifficulty(existing.scores.difficulty);
        setDidactics(existing.scores.didactics);
      }
    }
    setIsEditingForm(true);
    setSelectedCourse(courseId);
  }

  function deselectCourse() {
    setSelectedCourse(null);
    setReviewText("");
    setOverall(0);
    setDifficulty(0);
    setDidactics(0);
    setIsEditingForm(false);
  }

  // Set of courseIds this user has already reviewed (matched by stored authorHash)
  const alreadyReviewedCourses = useMemo(() => {
    return new Set(
      reviews
        .filter((r) => r.authorHash === myHash && r.text !== "[removido]")
        .map((r) => r.courseId),
    );
  }, [reviews, myHash]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    fetchProfessorDetails(professorId, myHash)
      .then((data) => {
        if (!mounted) return;
        const newStats = { ...(data.statsPerCourse || {}) };
        if (taughtCourses) {
          taughtCourses.forEach((c) => {
            if (!newStats[c]) {
              newStats[c] = {
                totalReviews: 0,
                overall: null,
                difficulty: null,
                didactics: null,
              };
            }
          });
        }
        setStats(newStats);
        // Clean up any already-orphaned [removido] nodes from previous sessions
        const cleaned = cleanupOrphanedSoftDeleted(
          data.replies || [],
          data.reviews || [],
        );
        setReviews(cleaned.reviews);
        setReplies(cleaned.replies);

        // Initialize vote state from API (includes myVote)
        const initialVoteState: Record<
          string,
          { upvotes: number; downvotes: number; myVote: 1 | -1 | 0 }
        > = {};
        for (const item of [
          ...(data.reviews || []),
          ...(data.replies || []),
        ]) {
          initialVoteState[item.id] = {
            upvotes: item.upvotes ?? 0,
            downvotes: item.downvotes ?? 0,
            myVote: (item.myVote ?? 0) as 1 | -1 | 0,
          };
        }
        setVoteState(initialVoteState);
      })
      .catch((err) => {
        if (!mounted) return;
        toast({
          title: "Erro ao carregar detalhes",
          description: err.message,
          variant: "destructive",
        });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [professorId, myHash]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteTopLevelReview = async (reviewId: string) => {
    const target = reviews.find((r) => r.id === reviewId);
    try {
      const result = await deleteReview(reviewId, myHash);
      const newReviews = result.softDeleted
        ? reviews.map((r) =>
            r.id === reviewId ? { ...r, text: "[removido]", scores: null } : r,
          )
        : reviews.filter((r) => r.id !== reviewId);

      // After updating reviews, cascade-remove any newly orphaned [removido] nodes
      const cleaned = cleanupOrphanedSoftDeleted(replies, newReviews);
      setReviews(cleaned.reviews);
      setReplies(cleaned.replies);

      // Update stats if review had scores
      if (target?.scores) {
        setStats((prev) => {
          const existing = prev[target.courseId];
          if (!existing) return prev;
          return {
            ...prev,
            [target.courseId]: statsRemoveReview(existing, target.scores!),
          };
        });
      }
      toast({ title: "Avaliação excluída" });
      onReviewChanged?.();
    } catch (err: any) {
      toast({
        title: "Erro ao excluir",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteReply = async (replyId: string) => {
    try {
      const result = await deleteReview(replyId, myHash);
      const newReplies = result.softDeleted
        ? replies.map((r) =>
            r.id === replyId ? { ...r, text: "[removido]" } : r,
          )
        : replies.filter((r) => r.id !== replyId);

      // Cascade-remove any [removido] ancestors that are now childless
      const cleaned = cleanupOrphanedSoftDeleted(newReplies, reviews);
      setReviews(cleaned.reviews);
      setReplies(cleaned.replies);

      toast({ title: "Resposta excluída" });
    } catch (err: any) {
      toast({
        title: "Erro ao excluir",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleEditReplySubmit = async (replyId: string) => {
    if (!editReplyText.trim()) return;
    try {
      const result = await updateReply(replyId, myHash, editReplyText);
      setReplies((prev) =>
        prev.map((r) =>
          r.id === replyId
            ? { ...r, text: editReplyText, updatedAt: result.review?.updatedAt }
            : r,
        ),
      );
      setEditingReply(null);
      setEditReplyText("");
      toast({ title: "Resposta atualizada" });
    } catch (err: any) {
      toast({
        title: "Erro ao atualizar resposta",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleReplySubmit = async (parentId: string) => {
    if (!replyText.trim()) return;
    try {
      const result = await submitReply(parentId, myHash, replyText);
      setReplies((prev) => [...prev, result.reply]);
      setVoteState((s) => ({
        ...s,
        [result.reply.id]: { upvotes: 0, downvotes: 0, myVote: 0 },
      }));
      setReplyingTo(null);
      setReplyText("");
      toast({ title: "Resposta enviada" });
    } catch (err: any) {
      toast({
        title: "Erro ao enviar resposta",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleReviewSubmit = async () => {
    if (!selectedCourse) return;
    const isEditing =
      alreadyReviewedCourses.has(selectedCourse) && isEditingForm;

    if (overall === 0 || difficulty === 0 || didactics === 0) {
      toast({
        title: "Avaliações incompletas",
        description: "Forneça uma nota para todos os critérios.",
        variant: "destructive",
      });
      return;
    }
    if (!reviewText.trim() || reviewText.length > 500) {
      toast({
        title: "Texto inválido",
        description: "O comentário deve ter entre 1 e 500 caracteres.",
        variant: "destructive",
      });
      return;
    }

    const newScores = { overall, difficulty, didactics };
    setSubmittingReview(true);
    try {
      if (isEditing) {
        const result = await updateReview(
          professorId,
          selectedCourse,
          myHash,
          reviewText,
          newScores,
        );
        setReviews((prev) =>
          prev.map((r) =>
            r.courseId === selectedCourse && r.authorHash === myHash
              ? {
                  ...r,
                  text: reviewText,
                  scores: newScores,
                  updatedAt: result.review?.updatedAt,
                }
              : r,
          ),
        );
        setStats((prev) => {
          const existing = prev[selectedCourse];
          const oldReview = myReviewByCourse[selectedCourse];
          if (!existing || !oldReview?.scores) return prev;
          return {
            ...prev,
            [selectedCourse]: statsEditReview(existing, oldReview.scores, newScores),
          };
        });
        toast({ title: "Avaliação atualizada!" });
      } else {
        const result = await submitReview(
          professorId,
          selectedCourse,
          myHash,
          reviewText,
          newScores,
        );
        const newReview: Review = {
          id: result.review.id,
          courseId: selectedCourse,
          authorHash: myHash,
          pseudonym: result.review.pseudonym,
          text: reviewText,
          scores: newScores,
          createdAt: result.review.createdAt,
          updatedAt: undefined,
          upvotes: 0,
          downvotes: 0,
        };
        setReviews((prev) => [newReview, ...prev]);
        setVoteState((s) => ({
          ...s,
          [newReview.id]: { upvotes: 0, downvotes: 0, myVote: 0 },
        }));
        setStats((prev) => {
          const existing = prev[selectedCourse] ?? {
            totalReviews: 0,
            overall: null,
            difficulty: null,
            didactics: null,
          };
          return {
            ...prev,
            [selectedCourse]: statsAddReview(existing, newScores),
          };
        });
        toast({ title: "Avaliação enviada!" });
      }
      // Reset form
      setSelectedCourse(null);
      setReviewText("");
      setOverall(0);
      setDifficulty(0);
      setDidactics(0);
      setIsEditingForm(false);
      onReviewChanged?.();
    } catch (err: any) {
      toast({
        title: "Erro ao enviar",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSubmittingReview(false);
    }
  };

  // Clear reply text when switching which reply box is open
  useEffect(() => {
    setReplyText("");
  }, [replyingTo]);

  const overallStats = useMemo(() => {
    let totalRev = 0,
      sumOverall = 0,
      sumDiff = 0,
      sumDid = 0;
    Object.values(stats).forEach((s) => {
      if (s.totalReviews > 0) {
        totalRev += s.totalReviews;
        sumOverall += (s.overall || 0) * s.totalReviews;
        sumDiff += (s.difficulty || 0) * s.totalReviews;
        sumDid += (s.didactics || 0) * s.totalReviews;
      }
    });
    if (totalRev === 0) return null;
    return {
      totalReviews: totalRev,
      overall: sumOverall / totalRev,
      difficulty: sumDiff / totalRev,
      didactics: sumDid / totalRev,
    };
  }, [stats]);

  return (
    <div className="mb-10 last:mb-0">
      {/* Header */}
      <div className="mb-5">
        <h2 className="text-xl font-bold mb-2">{professorId}</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <Badge
            variant="secondary"
            className="flex items-center gap-1 text-sm py-0.5"
          >
            <Star className="w-3.5 h-3.5 text-yellow-500 fill-current" />
            <span className="text-muted-foreground font-normal">Geral</span>
            <span className="font-semibold">
              {overallStats ? overallStats.overall.toFixed(1) : "—"}
            </span>
          </Badge>
          <Badge
            variant="outline"
            className="flex items-center gap-1 text-sm py-0.5"
          >
            <Brain className="w-3.5 h-3.5 text-red-400" />
            <span className="text-muted-foreground">Dificuldade</span>
            <span className="font-semibold">
              {overallStats ? overallStats.difficulty.toFixed(1) : "—"}
            </span>
          </Badge>
          <Badge
            variant="outline"
            className="flex items-center gap-1 text-sm py-0.5"
          >
            <BookOpen className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-muted-foreground">Didática</span>
            <span className="font-semibold">
              {overallStats ? overallStats.didactics.toFixed(1) : "—"}
            </span>
          </Badge>
          <span className="text-xs text-muted-foreground ml-auto">
            {overallStats?.totalReviews ?? 0}{" "}
            {(overallStats?.totalReviews ?? 0) === 1
              ? "avaliação"
              : "avaliações"}
          </span>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex justify-center items-center py-16"
          >
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground/40" />
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6"
          >
            {/* Left: course list */}
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium flex items-center gap-1 text-muted-foreground uppercase tracking-wider">
                <BookOpen className="w-3.5 h-3.5" />
                Disciplinas
              </h3>
              {Object.keys(stats).length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {Object.entries(stats).map(([courseId, s]) => {
                    const isSelected = selectedCourse === courseId;
                    return (
                      <motion.button
                        key={courseId}
                        type="button"
                        layout
                        onClick={() => {
                          if (isSelected) {
                            deselectCourse();
                          } else {
                            selectCourse(courseId);
                          }
                        }}
                        className={`text-left border rounded-lg px-3 py-1.5 transition-colors w-full ${
                          isSelected
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "border-border bg-card hover:bg-accent/40"
                        }`}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className="font-semibold text-sm">{courseId}</div>
                        {courseNameMap[courseId] && (
                          <div className="text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">
                            {courseNameMap[courseId]}
                          </div>
                        )}
                        {s.totalReviews > 0 ? (
                          <div className="flex gap-2 text-xs text-muted-foreground mt-0.5">
                            <span className="flex items-center gap-0.5 text-foreground">
                              <Star className="w-2.5 h-2.5 text-yellow-500 fill-current" />
                              {s.overall?.toFixed(1)}
                            </span>
                            <span className="flex items-center gap-0.5">
                              <Brain className="w-2.5 h-2.5 text-red-400" />
                              {s.difficulty?.toFixed(1)}
                            </span>
                            <span className="flex items-center gap-0.5">
                              <BookOpen className="w-2.5 h-2.5 text-blue-400" />
                              {s.didactics?.toFixed(1)}
                            </span>
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Sem avaliações
                          </div>
                        )}
                        {alreadyReviewedCourses.has(courseId) && (
                          <div className="text-[10px] text-green-600 font-medium mt-0.5">
                            ✓ Você já avaliou
                          </div>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center p-6 border rounded-lg border-dashed text-sm text-muted-foreground">
                  Nenhuma disciplina cadastrada
                </div>
              )}

              {/* Hint — only shown when no course is selected */}
              <AnimatePresence>
                {!selectedCourse && Object.keys(stats).length > 0 && (
                  <motion.p
                    key="hint"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="text-[11px] text-muted-foreground/60 text-center mt-1"
                  >
                    Clique em uma disciplina para avaliar
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Right: mural */}
            <div className="flex flex-col gap-4">
              <h3 className="text-xs font-medium flex items-center gap-1 text-muted-foreground uppercase tracking-wider">
                <MessageSquare className="w-3.5 h-3.5" />
                Mural de Avaliações
              </h3>

              {/* Review compose box — only shown when a course is selected */}
              <AnimatePresence mode="wait">
                {selectedCourse &&
                (!alreadyReviewedCourses.has(selectedCourse) ||
                  isEditingForm) ? (
                  <motion.div
                    key="compose"
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="border rounded-xl bg-card overflow-hidden"
                  >
                    <div className="p-3">
                      <div className="text-xs text-muted-foreground mb-2">
                        Avaliando{" "}
                        <span className="font-semibold text-foreground">
                          {selectedCourse}
                        </span>
                        {" · "}
                        <button
                          type="button"
                          className="underline hover:text-foreground"
                          onClick={deselectCourse}
                        >
                          cancelar
                        </button>
                      </div>
                      <div className="flex flex-col gap-2">
                        <div
                          className="flex gap-3"
                          style={{ alignItems: "stretch" }}
                        >
                          <div className="flex-1">
                            <Textarea
                              placeholder="Compartilhe sua experiência com este professor..."
                              value={reviewText}
                              onChange={(e) => setReviewText(e.target.value)}
                              className="text-sm resize-none bg-background border-border/60 w-full h-full"
                              maxLength={500}
                            />
                          </div>
                          <div className="flex gap-4 shrink-0 px-2 items-center">
                            <StarColumn
                              icon={
                                <Star className="w-4 h-4 text-yellow-500 fill-current" />
                              }
                              label="Geral"
                              value={overall}
                              onChange={setOverall}
                            />
                            <StarColumn
                              icon={<Brain className="w-4 h-4 text-red-400" />}
                              label="Dificuldade"
                              value={difficulty}
                              onChange={setDifficulty}
                            />
                            <StarColumn
                              icon={
                                <BookOpen className="w-4 h-4 text-blue-400" />
                              }
                              label="Didática"
                              value={didactics}
                              onChange={setDidactics}
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {reviewText.length}/500
                          </span>
                          <Button
                            size="sm"
                            className="px-6"
                            onClick={handleReviewSubmit}
                            disabled={submittingReview}
                          >
                            {submittingReview ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : alreadyReviewedCourses.has(selectedCourse!) ? (
                              "Atualizar Avaliação"
                            ) : (
                              "Enviar Avaliação"
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {/* Existing reviews — filtered by selected course when one is active */}
              {(() => {
                const baseReviews = selectedCourse
                  ? reviews.filter((r) => r.courseId === selectedCourse)
                  : reviews;
                // Sort: own review first
                const visibleReviews = [...baseReviews].sort((a, b) => {
                  const aIsMe = a.authorHash === myHash ? -1 : 0;
                  const bIsMe = b.authorHash === myHash ? -1 : 0;
                  return aIsMe - bIsMe;
                });
                return (
                  <>
                    <AnimatePresence>
                      {visibleReviews.length === 0 && (
                        <motion.div
                          key="empty"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="text-center py-10 text-sm text-muted-foreground border rounded-xl border-dashed"
                        >
                          <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-30" />
                          {selectedCourse
                            ? "Ainda não tem nada aqui... seja o primeiro a avaliar!"
                            : "Nenhuma avaliação ainda"}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {visibleReviews.length > 0 && (
                      <div className="flex flex-col gap-4">
                        <AnimatePresence initial={false}>
                          {visibleReviews.map((review, i) => {
                            const isMyReview = review.authorHash === myHash;
                            return (
                              <motion.div
                                key={review.id}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                                transition={{
                                  duration: 0.22,
                                  ease: "easeOut",
                                  delay: i * 0.04,
                                }}
                              >
                                <CommentCard
                                  id={review.id}
                                  pseudonym={review.pseudonym}
                                  isMe={isMyReview}
                                  isCollapsed={collapsedThreads.has(review.id)}
                                  onToggleCollapse={() =>
                                    toggleCollapse(review.id)
                                  }
                                  date={review.createdAt}
                                  updatedAt={review.updatedAt}
                                  text={review.text}
                                  scores={review.scores ?? undefined}
                                  courseName={
                                    !selectedCourse
                                      ? courseNameMap[review.courseId] ||
                                        review.courseId
                                      : undefined
                                  }
                                  upvotes={review.upvotes ?? 0}
                                  downvotes={review.downvotes ?? 0}
                                  voteState={voteState[review.id]}
                                  onVote={(v) => handleVote(review.id, v)}
                                  onReply={() => setReplyingTo(review.id)}
                                  onEdit={
                                    isMyReview
                                      ? () => startEditing(review.courseId)
                                      : undefined
                                  }
                                  onDelete={
                                    isMyReview
                                      ? () => handleDeleteTopLevelReview(review.id)
                                      : undefined
                                  }
                                  isReplyOpen={replyingTo === review.id}
                                  replyText={replyText}
                                  onReplyTextChange={setReplyText}
                                  onReplySubmit={() =>
                                    handleReplySubmit(review.id)
                                  }
                                  onReplyCancel={() => setReplyingTo(null)}
                                  isAuthenticated={isAuthenticated}
                                />
                                {/* Nested replies thread */}
                                {!collapsedThreads.has(review.id) && (
                                  <ReplyThread
                                    replies={replies}
                                    parentId={review.id}
                                    myHash={myHash}
                                    voteState={voteState}
                                    handleVote={handleVote}
                                    replyingTo={replyingTo}
                                    setReplyingTo={setReplyingTo}
                                    replyText={replyText}
                                    setReplyText={setReplyText}
                                    handleReplySubmit={handleReplySubmit}
                                    handleDelete={handleDeleteReply}
                                    editingReply={editingReply}
                                    setEditingReply={setEditingReply}
                                    editReplyText={editReplyText}
                                    setEditReplyText={setEditReplyText}
                                    handleEditReplySubmit={
                                      handleEditReplySubmit
                                    }
                                    collapsedThreads={collapsedThreads}
                                    toggleCollapse={toggleCollapse}
                                    isAuthenticated={isAuthenticated}
                                  />
                                )}
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ProfessorDetailsDialog({
  taughtCourses,
  professorId,
  onClose,
  onReviewChanged,
}: ProfessorDetailsDialogProps) {
  const professors = professorId
    ? professorId.split(",").map((p) => p.trim()).filter(Boolean)
    : [];

  return (
    <Dialog open={!!professorId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-[70vw] w-[70vw] h-[90vh] flex flex-col p-0 overflow-hidden bg-background">
        <VisuallyHidden>
          <DialogTitle>Detalhes do(s) Professor(es)</DialogTitle>
        </VisuallyHidden>
        <ScrollArea className="flex-1 p-6">
          {professors.map((prof, index) => (
            <div key={prof}>
              <ProfessorDetailsSection
                professorId={prof}
                taughtCourses={taughtCourses}
                onReviewChanged={onReviewChanged}
              />
              {index < professors.length - 1 && <Separator className="my-8" />}
            </div>
          ))}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
