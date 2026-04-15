"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { submitReview } from "@/lib/professors-client";
import { getAnonymousUserId } from "@/lib/user-identity";
import { Star, Loader2 } from "lucide-react";

interface WriteReviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  professorId: string | null;
  courseId: string | null;
}

function StarRating({ value, onChange }: { value: number; onChange: (val: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className={`focus:outline-none transition-colors ${
            star <= value ? "text-yellow-500" : "text-muted-foreground/30"
          }`}
        >
          <Star className="w-6 h-6 fill-current" />
        </button>
      ))}
    </div>
  );
}

export function WriteReviewDialog({ isOpen, onClose, professorId, courseId }: WriteReviewDialogProps) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [overall, setOverall] = useState(0);
  const [difficulty, setDifficulty] = useState(0);
  const [didactics, setDidactics] = useState(0);
  const { toast } = useToast();

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setText("");
      setOverall(0);
      setDifficulty(0);
      setDidactics(0);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!professorId || !courseId) return;

    if (overall === 0 || difficulty === 0 || didactics === 0) {
      toast({
        title: "Avaliações Incompletas",
        description: "Por favor, forneça uma nota para todos os critérios.",
        variant: "destructive",
      });
      return;
    }

    if (!text.trim() || text.length > 500) {
      toast({
        title: "Avaliação Inválida",
        description: "O texto da avaliação deve ter entre 1 e 500 caracteres.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const authorHash = getAnonymousUserId();
      await submitReview(professorId, courseId, authorHash, text, {
        overall,
        difficulty,
        didactics,
      });

      toast({
        title: "Sucesso",
        description: "Sua avaliação foi enviada com sucesso.",
      });
      onClose();
    } catch (err: any) {
      toast({
        title: "Falha no Envio",
        description: err.message || "An error occurred while submitting your review.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Escrever Avaliação</DialogTitle>
          <DialogDescription>
            {professorId && courseId ? (
              <>
                Avaliando <strong className="text-foreground">{professorId}</strong> na disciplina{" "}
                <strong className="text-foreground">{courseId}</strong>
              </>
            ) : (
              "Carregando detalhes..."
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Nota Geral</Label>
              <StarRating value={overall} onChange={setOverall} />
            </div>
            <div className="space-y-2">
              <Label>Dificuldade</Label>
              <StarRating value={difficulty} onChange={setDifficulty} />
            </div>
            <div className="space-y-2">
              <Label>Didática</Label>
              <StarRating value={didactics} onChange={setDidactics} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <Label htmlFor="review-text">Comentários da Avaliação</Label>
              <span className={`text-xs ${text.length > 500 ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                {text.length} / 500
              </span>
            </div>
            <Textarea
              id="review-text"
              placeholder="Compartilhe sua experiência com este professor..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-[120px] resize-none"
              maxLength={500}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || text.length > 500 || text.length === 0}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar Avaliação
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
