"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
} from "@/lib/professors-client";
import { getAnonymousUserId } from "@/lib/user-identity";
import {
  Loader2,
  MessageSquare,
  Star,
  Reply,
  BookOpen,
  Activity,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface ProfessorDetailsDialogProps {
  taughtCourses?: string[];
  professorId: string | null;
  onClose: () => void;
  onWriteReview?: (professorId: string, courseId: string) => void;
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
  };
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
  isReplyOpen,
  replyText,
  onReplyTextChange,
  onReplySubmit,
  onReplyCancel,
  isAuthenticated,
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
  isReplyOpen: boolean;
  replyText: string;
  onReplyTextChange: (v: string) => void;
  onReplySubmit: () => void;
  onReplyCancel: () => void;
  isAuthenticated: boolean;
  updatedAt?: string;
}) {
  return (
    <div
      className={`border rounded-xl ${isMe ? "bg-primary/5 border-primary/30" : "bg-card"}`}
    >
      <div className="flex gap-3 p-4">
        {/* Vote sidebar */}
        <VoteSidebar
          id={id}
          upvotes={upvotes}
          downvotes={downvotes}
          voteState={voteState}
          onVote={onVote}
          disabled={false}
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Row 1: name + date */}
          <div className="flex items-center justify-between gap-2 w-full mb-1">
            <div className="flex items-center gap-1.5 min-w-0">
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
              {onEdit && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                  onClick={onEdit}
                >
                  editar
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  className="text-xs text-red-500/70 hover:text-red-500 underline ml-1"
                  onClick={onDelete}
                >
                  excluir
                </button>
              )}
              <span className="text-[10px] text-muted-foreground/70 text-right">
                {updatedAt
                  ? `Editado em ${new Date(updatedAt).toLocaleDateString("pt-BR")}`
                  : new Date(date).toLocaleDateString("pt-BR")}
              </span>
            </div>
          </div>

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
                  <span>⚡ {scores.difficulty}</span>
                  <span>📖 {scores.didactics}</span>
                </div>
              )}
            </div>
          )}

          <p className="text-sm text-card-foreground leading-relaxed">{text}</p>

          <button
            type="button"
            onClick={onReply}
            className="mt-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <Reply className="w-3 h-3" /> Responder
          </button>

          {/* Inline reply form */}
          <AnimatePresence>
            {isReplyOpen && (
              <motion.div
                key="reply-form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="mt-3 space-y-2"
              >
                <Textarea
                  placeholder="Escreva sua resposta..."
                  value={replyText}
                  onChange={(e) => onReplyTextChange(e.target.value)}
                  className="text-sm min-h-[60px] bg-background resize-none w-full"
                />
                <div className="flex justify-end gap-2">
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
  depth = 0,
  isAuthenticated,
}: {
  replies: ReplyObj[];
  parentId: string;
  myHash: string;
  voteState: Record<string, any>;
  handleVote: (id: string, v: 1 | -1, curr: any) => void;
  replyingTo: string | null;
  setReplyingTo: (id: string | null) => void;
  replyText: string;
  setReplyText: (text: string) => void;
  handleReplySubmit: (id: string) => void;
  handleDelete: (id: string) => void;
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
              date={reply.createdAt}
              updatedAt={reply.updatedAt}
              text={reply.text}
              upvotes={reply.upvotes ?? 0}
              downvotes={reply.downvotes ?? 0}
              voteState={voteState[reply.id]}
              onVote={(v) =>
                handleVote(reply.id, v, {
                  upvotes: reply.upvotes ?? 0,
                  downvotes: reply.downvotes ?? 0,
                })
              }
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
            />
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
              depth={depth + 1}
              isAuthenticated={isAuthenticated}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function ProfessorDetailsSection({
  professorId,
  taughtCourses,
  onWriteReview,
}: {
  professorId: string;
  taughtCourses?: string[];
  onWriteReview?: (professorId: string, courseId: string) => void;
}) {
  const { userId, isAuthenticated } = useStudentStore();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Record<string, Stats>>({});
  const [reviews, setReviews] = useState<Review[]>([]);
  const [replies, setReplies] = useState<ReplyObj[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const { toast } = useToast();
  const { curriculumCache } = useStudentStore();

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
  // Local vote overrides: reviewId → { upvotes, downvotes, myVote }
  const [voteState, setVoteState] = useState<
    Record<string, { upvotes: number; downvotes: number; myVote: 1 | -1 | 0 }>
  >({});

  const handleVote = async (
    reviewId: string,
    value: 1 | -1,
    current: { upvotes: number; downvotes: number },
  ) => {
    const myHash = getAnonymousUserId(userId);
    const existing = voteState[reviewId]?.myVote ?? 0;
    const newVote: 0 | 1 | -1 = existing === value ? 0 : value;
    // Optimistic update: recalculate from current counts
    let up = voteState[reviewId]?.upvotes ?? current.upvotes;
    let down = voteState[reviewId]?.downvotes ?? current.downvotes;
    if (existing === 1) up--;
    if (existing === -1) down--;
    if (newVote === 1) up++;
    if (newVote === -1) down++;
    setVoteState((s) => ({
      ...s,
      [reviewId]: { upvotes: up, downvotes: down, myVote: newVote },
    }));
    try {
      const result = await submitVote(reviewId, myHash, value);
      setVoteState((s) => ({
        ...s,
        [reviewId]: {
          upvotes: result.upvotes,
          downvotes: result.downvotes,
          myVote: newVote,
        },
      }));
    } catch {
      setVoteState((s) => ({
        ...s,
        [reviewId]: {
          upvotes: current.upvotes,
          downvotes: current.downvotes,
          myVote: existing as 0 | 1 | -1,
        },
      }));
    }
  };

  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [reviewText, setReviewText] = useState("");
  const [overall, setOverall] = useState(0);
  const [difficulty, setDifficulty] = useState(0);
  const [didactics, setDidactics] = useState(0);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [isEditingForm, setIsEditingForm] = useState(false);

  const myReviewByCourse = useMemo(() => {
    const myHash = getAnonymousUserId(userId);
    const map: Record<string, Review> = {};
    for (const r of reviews) {
      if (r.authorHash === myHash) map[r.courseId] = r;
    }
    return map;
  }, [reviews]);

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
      setOverall(existing.scores.overall);
      setDifficulty(existing.scores.difficulty);
      setDidactics(existing.scores.didactics);
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
    const myHash = getAnonymousUserId(userId);
    return new Set(
      reviews.filter((r) => r.authorHash === myHash).map((r) => r.courseId),
    );
  }, [reviews]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    fetchProfessorDetails(professorId)
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
        setReviews(data.reviews || []);
        setReplies(data.replies || []);
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
  }, [professorId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteReview = async (reviewId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta avaliação?")) return;
    try {
      const myHash = getAnonymousUserId(userId);
      await deleteReview(reviewId, myHash);
      toast({ title: "Avaliação excluída" });
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      toast({
        title: "Erro ao excluir",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleReplySubmit = async (parentId: string) => {
    if (!replyText.trim()) return;
    try {
      const authorHash = getAnonymousUserId(userId);
      await submitReply(parentId, authorHash, replyText);
      setReplyingTo(null);
      setReplyText("");
      toast({ title: "Resposta enviada" });
      // Re-fetch to get the reply with correct pseudonym and all fields
      setRefreshKey((k) => k + 1);
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

    setSubmittingReview(true);
    try {
      const authorHash = getAnonymousUserId(userId);
      if (isEditing) {
        await updateReview(
          professorId,
          selectedCourse,
          authorHash,
          reviewText,
          {
            overall,
            difficulty,
            didactics,
          },
        );
        toast({ title: "Avaliação atualizada!" });
      } else {
        await submitReview(
          professorId,
          selectedCourse,
          authorHash,
          reviewText,
          {
            overall,
            difficulty,
            didactics,
          },
        );
        toast({ title: "Avaliação enviada!" });
      }
      // Reset form
      setSelectedCourse(null);
      setReviewText("");
      setOverall(0);
      setDifficulty(0);
      setDidactics(0);
      // Re-fetch data to reflect the new review in the UI
      setRefreshKey((k) => k + 1);
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

  const getOverallStats = () => {
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
  };

  const overallStats = getOverallStats();

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
            <span className="font-semibold">
              {overallStats ? overallStats.overall.toFixed(1) : "—"}
            </span>
            <span className="text-muted-foreground font-normal">Geral</span>
          </Badge>
          <Badge
            variant="outline"
            className="flex items-center gap-1 text-sm py-0.5"
          >
            <Activity className="w-3.5 h-3.5 text-red-400" />
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
                            <span>⚡ {s.difficulty?.toFixed(1)}</span>
                            <span>📖 {s.didactics?.toFixed(1)}</span>
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
                              icon="⭐"
                              label="Geral"
                              value={overall}
                              onChange={setOverall}
                            />
                            <StarColumn
                              icon="⚡"
                              label="Dificuldade"
                              value={difficulty}
                              onChange={setDifficulty}
                            />
                            <StarColumn
                              icon="📖"
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
                const myHash = getAnonymousUserId(userId);
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
                                  date={review.createdAt}
                                  updatedAt={review.updatedAt}
                                  text={review.text}
                                  scores={review.scores}
                                  courseName={
                                    !selectedCourse
                                      ? courseNameMap[review.courseId] ||
                                        review.courseId
                                      : undefined
                                  }
                                  upvotes={review.upvotes ?? 0}
                                  downvotes={review.downvotes ?? 0}
                                  voteState={voteState[review.id]}
                                  onVote={(v) =>
                                    handleVote(review.id, v, {
                                      upvotes: review.upvotes ?? 0,
                                      downvotes: review.downvotes ?? 0,
                                    })
                                  }
                                  onReply={() => setReplyingTo(review.id)}
                                  onEdit={
                                    isMyReview
                                      ? () => startEditing(review.courseId)
                                      : undefined
                                  }
                                  onDelete={
                                    isMyReview
                                      ? () => handleDeleteReview(review.id)
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
                                  handleDelete={handleDeleteReview}
                                  isAuthenticated={isAuthenticated}
                                />
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
  onWriteReview,
}: ProfessorDetailsDialogProps) {
  if (!professorId) return null;

  const professors = professorId
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <Dialog open={!!professorId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[70vw] w-[70vw] h-[90vh] flex flex-col p-0 overflow-hidden bg-background">
        <VisuallyHidden>
          <DialogTitle>Detalhes do(s) Professor(es)</DialogTitle>
        </VisuallyHidden>
        <ScrollArea className="flex-1 p-6">
          {professors.map((prof, index) => (
            <div key={prof}>
              <ProfessorDetailsSection
                professorId={prof}
                taughtCourses={taughtCourses}
                onWriteReview={onWriteReview}
              />
              {index < professors.length - 1 && <Separator className="my-8" />}
            </div>
          ))}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
