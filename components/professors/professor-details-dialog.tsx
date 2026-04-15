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

function ProfessorDetailsSection({
  professorId,
  taughtCourses,
  onWriteReview,
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

  const [reviewingCourse, setReviewingCourse] = useState<string | null>(null);
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
      toast({
        title: "Resposta enviada",
        description: "Sua resposta foi adicionada com sucesso.",
      });
    } catch (err: any) {
      toast({
        title: "Erro ao enviar resposta",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleReviewSubmit = async (courseId: string) => {
    if (overall === 0 || difficulty === 0 || didactics === 0) {
      toast({
        title: "Avaliações Incompletas",
        description: "Por favor, forneça uma nota para todos os critérios.",
        variant: "destructive",
      });
      return;
    }

    if (!reviewText.trim() || reviewText.length > 500) {
      toast({
        title: "Avaliação Inválida",
        description: "O texto da avaliação deve ter entre 1 e 500 caracteres.",
        variant: "destructive",
      });
      return;
    }

    setSubmittingReview(true);
    try {
      const fakeAuthorHash = "user-" + Math.floor(Math.random() * 1000000);
      await submitReview(professorId, courseId, fakeAuthorHash, reviewText, {
        overall,
        difficulty,
        didactics,
      });

      toast({
        title: "Sucesso",
        description: "Sua avaliação foi enviada com sucesso.",
      });

      setReviewingCourse(null);
      setReviewText("");
      setOverall(0);
      setDifficulty(0);
      setDidactics(0);
    } catch (err: any) {
      toast({
        title: "Falha no Envio",
        description: err.message || "Ocorreu um erro ao enviar a avaliação.",
        variant: "destructive",
      });
    } finally {
      setSubmittingReview(false);
    }
  };

  const getOverallStats = () => {
    let totalRev = 0;
    let sumOverall = 0;
    let sumDiff = 0;
    let sumDidactics = 0;

    Object.values(stats).forEach((s) => {
      if (s.totalReviews > 0) {
        totalRev += s.totalReviews;
        sumOverall += (s.overall || 0) * s.totalReviews;
        sumDiff += (s.difficulty || 0) * s.totalReviews;
        sumDidactics += (s.didactics || 0) * s.totalReviews;
      }
    });

    if (totalRev === 0) return null;

    return {
      totalReviews: totalRev,
      overall: sumOverall / totalRev,
      difficulty: sumDiff / totalRev,
      didactics: sumDidactics / totalRev,
    };
  };

  const overallStats = getOverallStats();

  return (
    <div className="mb-10 last:mb-0">
      <div className="mb-4">
        <h2 className="text-2xl font-bold mb-2">{professorId}</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <Badge
            variant="secondary"
            className="flex items-center gap-1.5 text-sm py-1"
          >
            <Star className="w-4 h-4 text-yellow-500 fill-current" />
            <span className="font-bold">
              {overallStats ? overallStats.overall.toFixed(1) : "0.0"}
            </span>{" "}
            Geral
          </Badge>
          <Badge
            variant="outline"
            className="flex items-center gap-1.5 text-sm py-1"
          >
            <Activity className="w-4 h-4 text-red-500" />
            Dificuldade:{" "}
            <span className="font-semibold">
              {overallStats ? overallStats.difficulty.toFixed(1) : "0.0"}
            </span>
          </Badge>
          <Badge
            variant="outline"
            className="flex items-center gap-1.5 text-sm py-1"
          >
            <BookOpen className="w-4 h-4 text-blue-500" />
            Didática:{" "}
            <span className="font-semibold">
              {overallStats ? overallStats.didactics.toFixed(1) : "0.0"}
            </span>
          </Badge>
          <span className="text-xs text-muted-foreground ml-auto font-medium">
            {overallStats ? overallStats.totalReviews : 0}{" "}
            {overallStats?.totalReviews === 1 ? "avaliação" : "avaliações"}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-muted-foreground/50" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[350px_1fr] gap-8">
          <div className="flex flex-col gap-4">
            <h3 className="text-xl font-semibold flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              Disciplinas Ministradas
            </h3>
            {Object.keys(stats).length > 0 ? (
              <div className="grid grid-cols-1 gap-3">
                {Object.entries(stats).map(([courseId, s]) => (
                  <div
                    key={courseId}
                    className="border rounded-lg p-4 bg-card shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <span className="font-bold text-lg">{courseId}</span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setReviewingCourse(
                            reviewingCourse === courseId ? null : courseId,
                          )
                        }
                      >
                        {reviewingCourse === courseId ? "Cancelar" : "Avaliar"}
                      </Button>
                    </div>

                    {reviewingCourse === courseId ? (
                      <div className="mt-4 mb-2 space-y-3 bg-muted/30 p-3 rounded-md border border-border/50">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold">Geral</span>
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  onClick={() => setOverall(star)}
                                  className={
                                    star <= overall
                                      ? "text-yellow-500"
                                      : "text-muted-foreground/30"
                                  }
                                >
                                  <Star className="w-4 h-4 fill-current" />
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold">
                              Dificuldade
                            </span>
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  onClick={() => setDifficulty(star)}
                                  className={
                                    star <= difficulty
                                      ? "text-yellow-500"
                                      : "text-muted-foreground/30"
                                  }
                                >
                                  <Star className="w-4 h-4 fill-current" />
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold">
                              Didática
                            </span>
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  onClick={() => setDidactics(star)}
                                  className={
                                    star <= didactics
                                      ? "text-yellow-500"
                                      : "text-muted-foreground/30"
                                  }
                                >
                                  <Star className="w-4 h-4 fill-current" />
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                        <Textarea
                          placeholder="Compartilhe sua experiência..."
                          value={reviewText}
                          onChange={(e) => setReviewText(e.target.value)}
                          className="text-sm min-h-[80px] bg-background resize-none"
                          maxLength={500}
                        />
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            onClick={() => handleReviewSubmit(courseId)}
                            disabled={submittingReview}
                          >
                            {submittingReview ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : null}
                            Enviar Avaliação
                          </Button>
                        </div>
                      </div>
                    ) : s.totalReviews > 0 ? (
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1 text-foreground font-medium">
                          <Star className="w-3 h-3 text-yellow-500 fill-current" />{" "}
                          {s.overall?.toFixed(1)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Activity className="w-3 h-3" /> Dif:{" "}
                          {s.difficulty?.toFixed(1)}
                        </span>
                        <span className="flex items-center gap-1">
                          <BookOpen className="w-3 h-3" /> Did:{" "}
                          {s.didactics?.toFixed(1)}
                        </span>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        Sem avaliações
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center p-8 border rounded-lg border-dashed bg-muted/20">
                <BookOpen className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-muted-foreground">
                  Este professor ainda não possui disciplinas cadastradas no
                  sistema para receber avaliações.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="text-xl font-semibold flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              Mural de Avaliações
            </h3>
            {reviews.length === 0 ? (
              <div className="text-center p-8 border rounded-lg border-dashed bg-muted/20">
                <MessageSquare className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-muted-foreground">
                  Sem avaliações. Ajude outros estudantes compartilhando sua
                  experiência!
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {reviews.map((review) => {
                  const reviewReplies = replies.filter(
                    (r) => r.parentId === review.id,
                  );

                  return (
                    <div
                      key={review.id}
                      className="border rounded-xl p-5 bg-card shadow-sm"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-xl shadow-inner">
                            {getEmojiForPseudonym(review.pseudonym)}
                          </div>
                          <div>
                            <div className="font-semibold flex items-center gap-2">
                              {review.pseudonym || "Autor da Avaliação"}
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0"
                              >
                                {review.courseId}
                              </Badge>
                            </div>
                            <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                              <span className="text-yellow-600 font-medium flex items-center gap-1">
                                <Star className="w-3 h-3 fill-current" />{" "}
                                {review.scores?.overall}
                              </span>
                              <span>Dif: {review.scores?.difficulty}</span>
                              <span>Did: {review.scores?.didactics}</span>
                            </div>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground/70">
                          {new Date(review.createdAt).toLocaleDateString(
                            "pt-BR",
                          )}
                        </span>
                      </div>

                      <p className="text-sm mt-4 text-card-foreground leading-relaxed">
                        {review.text}
                      </p>

                      <div className="mt-4">
                        {reviewReplies.length > 0 && (
                          <div className="pl-4 ml-4 border-l-2 border-primary/20 space-y-3 mb-3">
                            {reviewReplies.map((reply) => (
                              <div
                                key={reply.id}
                                className="text-sm bg-muted/30 p-3 rounded-lg border border-border/50"
                              >
                                <div className="flex justify-between items-center mb-1.5">
                                  <span className="font-semibold flex items-center gap-1.5 text-xs">
                                    <span>
                                      {getEmojiForPseudonym(reply.pseudonym)}
                                    </span>
                                    {reply.pseudonym || "Estudante"}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {new Date(
                                      reply.createdAt,
                                    ).toLocaleDateString("pt-BR")}
                                  </span>
                                </div>
                                <p className="text-muted-foreground">
                                  {reply.text}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}

                        {replyingTo === review.id ? (
                          <div className="mt-3 space-y-2 pl-4 ml-4 border-l-2 border-primary/20">
                            <Textarea
                              placeholder="Escreva sua resposta..."
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value)}
                              className="text-sm min-h-[80px] bg-background resize-none"
                            />
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setReplyingTo(null)}
                              >
                                Cancelar
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleReplySubmit(review.id)}
                              >
                                Responder
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-8 mt-1 ml-6 text-muted-foreground hover:text-foreground"
                            onClick={() => setReplyingTo(review.id)}
                          >
                            <Reply className="w-3.5 h-3.5 mr-1.5" /> Responder
                            Thread
                          </Button>
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
        <ScrollArea className="flex-1 p-6 pt-6">
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
