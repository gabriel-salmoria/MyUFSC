"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TIMETABLE } from "@/styles/visualization";
import { TIMETABLE_COLOR_CLASSES } from "@/styles/course-theme";
import type { CustomScheduleEntry } from "@/types/student-plan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Copy, Trash2, X } from "lucide-react";
import { toHHMM, toMinutes } from "@/lib/timetable-time";

function generateId() {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// Default end = one hour after the start (events are free-time now, not snapped
// to the UFSC period slots).
function defaultEnd(startTime: string): string {
  return toHHMM(toMinutes(startTime) + 60);
}

interface CustomEventModalProps {
  open: boolean;
  onClose: () => void;
  initialEntry?: Partial<CustomScheduleEntry>;
  lastEntry?: Partial<CustomScheduleEntry> | null;
  currentPhase: number;
  onSave: (entry: CustomScheduleEntry) => void;
  onDelete?: (id: string) => void;
}

export default function CustomEventModal({
  open,
  onClose,
  initialEntry,
  lastEntry,
  currentPhase,
  onSave,
  onDelete,
}: CustomEventModalProps) {
  const defaultStart = initialEntry?.startTime ?? TIMETABLE.TIME_SLOTS[0].id;
  const [title, setTitle] = useState(initialEntry?.title ?? "");
  const [subtitle, setSubtitle] = useState(initialEntry?.subtitle ?? "");
  const [day, setDay] = useState<number>(initialEntry?.day ?? 0);
  const [startTime, setStartTime] = useState(defaultStart);
  const [endTime, setEndTime] = useState(
    initialEntry?.endTime ?? defaultEnd(defaultStart),
  );
  const [color, setColor] = useState(
    initialEntry?.color ?? TIMETABLE_COLOR_CLASSES[0],
  );
  const [recurring, setRecurring] = useState(initialEntry?.recurring ?? true);

  useEffect(() => {
    if (open) {
      const newStart = initialEntry?.startTime ?? TIMETABLE.TIME_SLOTS[0].id;
      setTitle(initialEntry?.title ?? "");
      setSubtitle(initialEntry?.subtitle ?? "");
      setDay(initialEntry?.day ?? 0);
      setStartTime(newStart);
      // Default end = one hour after start (unless editing an existing entry)
      setEndTime(initialEntry?.endTime ?? defaultEnd(newStart));
      setColor(initialEntry?.color ?? TIMETABLE_COLOR_CLASSES[0]);
      setRecurring(initialEntry?.recurring ?? true);
    }
  }, [open, initialEntry]);

  // When user changes start time, auto-bump end time if it's now <= start
  const handleStartTimeChange = (newStart: string) => {
    setStartTime(newStart);
    if (toMinutes(endTime) <= toMinutes(newStart)) {
      setEndTime(defaultEnd(newStart));
    }
  };

  const handleCopyFromLast = () => {
    if (!lastEntry) return;
    if (lastEntry.title) setTitle(lastEntry.title);
    if (lastEntry.subtitle !== undefined) setSubtitle(lastEntry.subtitle ?? "");
    if (lastEntry.color) setColor(lastEntry.color);
  };

  const handleSave = () => {
    if (!title.trim()) return;
    // Free time inputs allow end <= start; keep at least a 30-min block.
    const safeEnd =
      toMinutes(endTime) > toMinutes(startTime)
        ? endTime
        : toHHMM(toMinutes(startTime) + 30);
    onSave({
      id: initialEntry?.id ?? generateId(),
      title: title.trim(),
      subtitle: subtitle.trim() || undefined,
      day,
      startTime,
      endTime: safeEnd,
      color,
      recurring,
      scopedToPhase: recurring ? undefined : currentPhase,
    });
    onClose();
  };

  const isEditing = !!initialEntry?.id;

  // Listen for Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && open) {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
    <motion.div
      key="custom-event-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 bg-black/20 dark:bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="bg-background border border-border sm:rounded-lg shadow-xl w-full max-w-md p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Fechar</span>
        </button>

        {/* Title */}
        <div className="flex flex-col space-y-1.5 mb-4">
          <h2 className="text-lg font-semibold leading-none tracking-tight">
            {isEditing ? "Editar Evento" : "Novo Evento"}
          </h2>
          <p className="sr-only">
            Formulário para adicionar ou editar um evento customizado no seu cronograma.
          </p>
        </div>

          <div className="grid gap-4 py-2">
            {/* Nome */}
            <div className="grid gap-1.5">
              <Label htmlFor="ce-title">Nome</Label>
              <div className="flex gap-2">
                <Input
                  id="ce-title"
                  placeholder="Ex.: Academia, Trabalho, Estudo..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="flex-1"
                  autoFocus
                />
                {lastEntry && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleCopyFromLast}
                    title="Copiar nome e detalhes do último evento"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Detalhes (opcional) */}
            <div className="grid gap-1.5">
              <Label htmlFor="ce-subtitle">
                Detalhes{" "}
                <span className="text-muted-foreground text-xs">(opcional)</span>
              </Label>
              <Input
                id="ce-subtitle"
                placeholder="Ex.: Academia Central, Casa, Bloco B..."
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
              />
            </div>

            {/* Dia */}
            <div className="grid gap-1.5">
              <Label>Dia</Label>
              <Select
                value={String(day)}
                onValueChange={(v) => setDay(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMETABLE.DAYS.map((d, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Início / Fim — free times (any minute), no longer snapped to
                the UFSC period slots. */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="ce-start">Início</Label>
                <Input
                  id="ce-start"
                  type="time"
                  step={300}
                  value={startTime}
                  onChange={(e) => handleStartTimeChange(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ce-end">Fim</Label>
                <Input
                  id="ce-end"
                  type="time"
                  step={300}
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>

            {/* Cor */}
            <div className="grid gap-1.5">
              <Label>Cor</Label>
              <div className="flex gap-2 flex-wrap">
                {TIMETABLE_COLOR_CLASSES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`timetable-course ${c} w-8 h-8 rounded-md border-2 transition-all ${
                      color === c
                        ? "border-foreground scale-110 shadow-md"
                        : "border-transparent opacity-60 hover:opacity-90"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Recorrência */}
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div className="grid gap-0.5">
                <Label htmlFor="ce-recurring" className="cursor-pointer">
                  Repetir em todas as fases
                </Label>
                <p className="text-xs text-muted-foreground">
                  {recurring
                    ? "Aparece em todas as fases"
                    : `Apenas na fase ${currentPhase}`}
                </p>
              </div>
              <Switch
                id="ce-recurring"
                checked={recurring}
                onCheckedChange={setRecurring}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-row justify-between">
            <div>
              {isEditing && onDelete && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    onDelete(initialEntry!.id!);
                    onClose();
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Remover
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={!title.trim()}>
                {isEditing ? "Salvar" : "Adicionar"}
              </Button>
            </div>
          </div>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}
