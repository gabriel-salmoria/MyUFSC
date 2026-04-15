"use client";

import { useEffect, useState } from "react";
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
} from "@/lib/professors-client";
import {
  Loader2,
  MessageSquare,
  Star,
  Reply,
  BookOpen,
  Activity,
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
}

interface ReplyObj {
  id: string;
  parentId: string;
  authorHash: string;
  pseudonym?: string;
  text: string;
  createdAt: string;
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
  "Autor da Avaliação": "👤",
};

function getEmojiForPseudonym(pseudonym?: string) {
  if (!pseudonym) return "👤";
  for (const [animal, emoji] of Object.entries(animalEmojis)) {
    if (pseudonym.includes(animal)) return emoji;
  }
  return "👤";
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
      {/* Stars rendered 5 → 1 top to bottom; filled from bottom up */}
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
      {/* Label at bottom */}
      <div className="mt-1.5 flex flex-col items-center gap-0.5">
        <span className="text-base leading-none">{icon}</span>
        <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

function ProfessorDetailsSection({
  professorId,
  taughtCourses,
}: {
  professorId: string;
  taughtCourses?: string[];
  onWriteReview?: (professorId: string, courseId: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Record<string, Stats>>({});
  const [reviews, setReviews] = useState<Review[]>([]);
  const [replies, setReplies] = useState<ReplyObj[]>([]);
  const { toast } = useToast();

  const [replyText, setReplyText] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  // Course selected for review (user clicks on a course card)
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [reviewText, setReviewText] = useState("");
  const [overall, setOverall] = useState(0);
  const [difficulty, setDifficulty] = useState(0);
  const [didactics, setDidactics] = useState(0);
  const [submittingReview, setSubmittingReview] = useState(false);

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
  }, [professorId, toast, taughtCourses]);

  const handleReplySubmit = async (parentId: string) => {
    if (!replyText.trim()) return;
    try {
      const fakeAuthorHash = "user-" + Math.floor(Math.random() * 10000);
      const result = await submitReply(parentId, fakeAuthorHash, replyText);
      setReplies((prev) => [...prev, result.reply]);
      setReplyingTo(null);
      setReplyText("");
      toast({ title: "Resposta enviada" });
    } catch (err: any) {
      toast({ title: "Erro ao enviar resposta", description: err.message, variant: "destructive" });
    }
  };

  const handleReviewSubmit = async () => {
    if (!selectedCourse) return;

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
      const fakeAuthorHash = "user-" + Math.floor(Math.random() * 1000000);
      await submitReview(professorId, selectedCourse, fakeAuthorHash, reviewText, {
        overall,
        difficulty,
        didactics,
      });
      toast({ title: "Avaliação enviada!" });
      setSelectedCourse(null);
      setReviewText("");
      setOverall(0);
      setDifficulty(0);
      setDidactics(0);
    } catch (err: any) {
      toast({ title: "Erro ao enviar", description: err.message, variant: "destructive" });
    } finally {
      setSubmittingReview(false);
    }
  };

  const getOverallStats = () => {
    let totalRev = 0, sumOverall = 0, sumDiff = 0, sumDid = 0;
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
          <Badge variant="secondary" className="flex items-center gap-1 text-sm py-0.5">
            <Star className="w-3.5 h-3.5 text-yellow-500 fill-current" />
            <span className="font-semibold">{overallStats ? overallStats.overall.toFixed(1) : "—"}</span>
            <span className="text-muted-foreground font-normal">Geral</span>
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1 text-sm py-0.5">
            <Activity className="w-3.5 h-3.5 text-red-400" />
            <span className="text-muted-foreground">Dificuldade</span>
            <span className="font-semibold">{overallStats ? overallStats.difficulty.toFixed(1) : "—"}</span>
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1 text-sm py-0.5">
            <BookOpen className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-muted-foreground">Didática</span>
            <span className="font-semibold">{overallStats ? overallStats.didactics.toFixed(1) : "—"}</span>
          </Badge>
          <span className="text-xs text-muted-foreground ml-auto">
            {overallStats?.totalReviews ?? 0}{" "}
            {(overallStats?.totalReviews ?? 0) === 1 ? "avaliação" : "avaliações"}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground/40" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
          {/* Left: course list */}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
              <BookOpen className="w-4 h-4" />
              Disciplinas
            </h3>
            {Object.keys(stats).length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {Object.entries(stats).map(([courseId, s]) => {
                  const isSelected = selectedCourse === courseId;
                  return (
                    <button
                      key={courseId}
                      type="button"
                      onClick={() => setSelectedCourse(isSelected ? null : courseId)}
                      className={`text-left border rounded-lg px-3 py-1.5 transition-colors w-full ${
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border bg-card hover:bg-accent/40"
                      }`}
                    >
                      <div className="font-semibold text-sm">{courseId}</div>
                      {s.totalReviews > 0 ? (
                        <div className="flex gap-2 text-xs text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-0.5 text-foreground">
                            <Star className="w-2.5 h-2.5 text-yellow-500 fill-current" />
                            {s.overall?.toFixed(1)}
                          </span>
                          <span>Dif {s.difficulty?.toFixed(1)}</span>
                          <span>Did {s.didactics?.toFixed(1)}</span>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground mt-0.5">Sem avaliações</div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center p-6 border rounded-lg border-dashed text-sm text-muted-foreground">
                Nenhuma disciplina cadastrada
              </div>
            )}
          </div>

          {/* Right: mural */}
          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-semibold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
              <MessageSquare className="w-4 h-4" />
              Mural de Avaliações
            </h3>

            {/* Review compose box */}
            <div className="border rounded-xl bg-card">
              {selectedCourse ? (
                <div className="p-3">
                  <div className="text-xs text-muted-foreground mb-2">
                    Avaliando{" "}
                    <span className="font-semibold text-foreground">{selectedCourse}</span>
                    {" · "}
                    <button
                      type="button"
                      className="underline hover:text-foreground"
                      onClick={() => setSelectedCourse(null)}
                    >
                      cancelar
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {/* Top row: textarea (stretches) + star columns */}
                    <div className="flex gap-3" style={{ alignItems: "stretch" }}>
                      <div className="flex-1">
                        <Textarea
                          placeholder="Compartilhe sua experiência com este professor..."
                          value={reviewText}
                          onChange={(e) => setReviewText(e.target.value)}
                          className="text-sm resize-none bg-background border-border/60 w-full h-full"
                          maxLength={500}
                        />
                      </div>

                      {/* Three vertical star columns */}
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

                    {/* Bottom row: char count + send button */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{reviewText.length}/500</span>
                      <Button
                        size="sm"
                        className="px-6"
                        onClick={handleReviewSubmit}
                        disabled={submittingReview}
                      >
                        {submittingReview ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          "Enviar Avaliação"
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-5 text-sm text-muted-foreground text-center">
                  <MessageSquare className="w-5 h-5 mx-auto mb-1.5 opacity-40" />
                  Selecione uma disciplina à esquerda para avaliar este professor
                </div>
              )}
            </div>

            {/* Existing reviews */}
            {!loading && reviews.length === 0 && (
              <div className="text-center py-10 text-sm text-muted-foreground border rounded-xl border-dashed">
                <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-30" />
                Nenhuma avaliação ainda
              </div>
            )}
            {reviews.length > 0 && (
              <div className="flex flex-col gap-4">
                {reviews.map((review) => {
                  const reviewReplies = replies.filter((r) => r.parentId === review.id);
                  return (
                    <div key={review.id} className="border rounded-xl p-4 bg-card">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-base">
                            {getEmojiForPseudonym(review.pseudonym)}
                          </div>
                          <div>
                            <div className="text-sm font-medium flex items-center gap-1.5">
                              {review.pseudonym || "Autor da Avaliação"}
                              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                                {review.courseId}
                              </Badge>
                            </div>
                            <div className="flex gap-2 text-xs text-muted-foreground mt-0.5">
                              <span className="flex items-center gap-0.5 text-yellow-600 font-medium">
                                <Star className="w-2.5 h-2.5 fill-current" /> {review.scores?.overall}
                              </span>
                              <span>Dif: {review.scores?.difficulty}</span>
                              <span>Did: {review.scores?.didactics}</span>
                            </div>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground/60">
                          {new Date(review.createdAt).toLocaleDateString("pt-BR")}
                        </span>
                      </div>

                      <p className="text-sm text-card-foreground leading-relaxed mt-3">
                        {review.text}
                      </p>

                      <div className="mt-3">
                        {reviewReplies.length > 0 && (
                          <div className="pl-4 ml-3 border-l-2 border-border space-y-2 mb-2">
                            {reviewReplies.map((reply) => (
                              <div key={reply.id} className="text-sm">
                                <div className="flex justify-between items-center mb-0.5">
                                  <span className="font-medium flex items-center gap-1 text-xs">
                                    {getEmojiForPseudonym(reply.pseudonym)}{" "}
                                    {reply.pseudonym || "Estudante"}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {new Date(reply.createdAt).toLocaleDateString("pt-BR")}
                                  </span>
                                </div>
                                <p className="text-muted-foreground text-xs">{reply.text}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {replyingTo === review.id ? (
                          <div className="mt-2 space-y-1.5 pl-4 ml-3 border-l-2 border-border">
                            <Textarea
                              placeholder="Escreva sua resposta..."
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value)}
                              className="text-sm min-h-[60px] bg-background resize-none"
                            />
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="ghost" onClick={() => setReplyingTo(null)}>
                                Cancelar
                              </Button>
                              <Button size="sm" onClick={() => handleReplySubmit(review.id)}>
                                Responder
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1 ml-3"
                            onClick={() => setReplyingTo(review.id)}
                          >
                            <Reply className="w-3 h-3" /> Responder
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
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
      <DialogContent className="sm:max-w-[70vw] w-[70vw] max-h-[90vh] flex flex-col p-0 overflow-hidden bg-background">
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
