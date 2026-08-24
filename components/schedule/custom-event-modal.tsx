"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TIMETABLE } from "@/styles/visualization";
import { TIMETABLE_COLOR_CLASSES } from "@/styles/course-theme";
import type { CustomScheduleEntry } from "@/types/student-plan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Copy, Trash2, X } from "lucide-react";
import { PERIOD_MINUTES, toHHMM, toMinutes } from "@/lib/timetable-time";

function generateId() {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Every period start on the grid, 24h — "07:30" … "21:10". */
const PERIOD_STARTS: string[] = TIMETABLE.TIME_SLOTS.map((s) => s.id);

/**
 * Every period END, 24h. A period is 50 minutes, so these are the slot starts
 * shifted by one period — including 11:50 (end of the pre-lunch block) and
 * 22:00 (end of the last one), neither of which is a slot start.
 */
const PERIOD_ENDS: string[] = PERIOD_STARTS.map((t) =>
  toHHMM(toMinutes(t) + PERIOD_MINUTES),
);

/** Default end = the end of the period the event starts in. */
function defaultEnd(startTime: string): string {
  return toHHMM(toMinutes(startTime) + PERIOD_MINUTES);
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
  const [days, setDays] = useState<number[]>(initialEntry?.days ?? []);
  const [startTime, setStartTime] = useState(defaultStart);
  const [endTime, setEndTime] = useState(
    initialEntry?.endTime ?? defaultEnd(defaultStart),
  );
  const [color, setColor] = useState(
    initialEntry?.color ?? TIMETABLE_COLOR_CLASSES[0],
  );
  // Default OFF: a personal event belongs to the semester you are living
  // through, not to every phase of the whole degree. Repeating it forever is
  // the exception, so it should be the deliberate choice.
  const [recurring, setRecurring] = useState(initialEntry?.recurring ?? false);

  // Only ends after the chosen start. Keeps the stored value visible even when
  // it is a legacy free-form time that isn't on a period boundary.
  const endOptions = useMemo(() => {
    const startMin = toMinutes(startTime);
    const options = PERIOD_ENDS.filter((t) => toMinutes(t) > startMin);
    return options.includes(endTime)
      ? options
      : [endTime, ...options].sort((a, b) => toMinutes(a) - toMinutes(b));
  }, [startTime, endTime]);

  useEffect(() => {
    if (open) {
      const newStart = initialEntry?.startTime ?? TIMETABLE.TIME_SLOTS[0].id;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deferred: avoidable derived-state effect, tracked in #31
      setTitle(initialEntry?.title ?? "");
      setSubtitle(initialEntry?.subtitle ?? "");
      setDays(initialEntry?.days ?? []);
      setStartTime(newStart);
      // Default end = end of the starting period (unless editing an entry)
      setEndTime(initialEntry?.endTime ?? defaultEnd(newStart));
      setColor(initialEntry?.color ?? TIMETABLE_COLOR_CLASSES[0]);
      setRecurring(initialEntry?.recurring ?? false);
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

  const toggleDay = (d: number) => {
    setDays((prev) =>
      prev.includes(d)
        ? prev.filter((x) => x !== d)
        : [...prev, d].sort((a, b) => a - b),
    );
  };

  const handleSave = () => {
    if (!title.trim() || days.length < 1) return;
    // Free time inputs allow end <= start; keep at least a 30-min block.
    const safeEnd =
      toMinutes(endTime) > toMinutes(startTime)
        ? endTime
        : toHHMM(toMinutes(startTime) + 30);
    onSave({
      id: initialEntry?.id ?? generateId(),
      title: title.trim(),
      subtitle: subtitle.trim() || undefined,
      days,
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
        className="bg-background border border-border sm:rounded-lg shadow-xl w-full max-w-lg p-6 relative"
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

            {/* Dias */}
            <div className="grid gap-1.5">
              <Label>Dias</Label>
              {/* `flex-auto` (basis: auto), not `flex-1` (basis: 0). With a
                  0-basis plus an explicit `min-w`, every button got the SAME
                  width regardless of its label and CSS's default
                  `min-width: auto` was overridden — so "Segunda", the longest
                  weekday, was squeezed and its text spilled past the border.
                  Sizing from content lets each button be as wide as its label
                  needs, and `flex-wrap` handles a narrow viewport. */}
              <div className="flex gap-1.5 flex-wrap">
                {TIMETABLE.DAYS.map((d, i) => {
                  const selected = days.includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleDay(i)}
                      className={`flex-auto whitespace-nowrap rounded-md border px-2 py-1.5 text-sm font-medium transition-colors ${
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Início / Fim — the grid's own period slots, in 24h.
                Previously two native <input type="time">: those render in the
                browser's locale, so a pt-BR user got a segmented "10:10 AM /
                01:-- PM" that cannot be forced to 24h from HTML, and every
                edit meant tabbing through HH / MM / AM-PM. Selects show exactly
                "17:10", and picking real period boundaries is also what makes
                the event land cleanly on grid cells. */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="ce-start">Início</Label>
                <select
                  id="ce-start"
                  value={startTime}
                  onChange={(e) => handleStartTimeChange(e.target.value)}
                  className="bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground tabular-nums"
                >
                  {PERIOD_STARTS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ce-end">Fim</Label>
                <select
                  id="ce-end"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground tabular-nums"
                >
                  {endOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
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
              <Button
                onClick={handleSave}
                disabled={!title.trim() || days.length < 1}
              >
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
