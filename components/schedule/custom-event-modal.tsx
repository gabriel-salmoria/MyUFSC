"use client";

import { useEffect, useState } from "react";
import { TIMETABLE } from "@/styles/visualization";
import { TIMETABLE_COLOR_CLASSES } from "@/styles/course-theme";
import type { CustomScheduleEntry } from "@/types/student-plan";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { DialogPortal, DialogOverlay } from "@/components/ui/dialog";
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

function generateId() {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// Returns the slot id immediately after the given slot id (stays at last if already there)
function nextSlotId(slotId: string): string {
  const idx = TIMETABLE.TIME_SLOTS.findIndex((s) => s.id === slotId);
  if (idx === -1 || idx >= TIMETABLE.TIME_SLOTS.length - 1)
    return TIMETABLE.TIME_SLOTS[Math.max(0, idx)].id;
  return TIMETABLE.TIME_SLOTS[idx + 1].id;
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
    initialEntry?.endTime ?? nextSlotId(defaultStart),
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
      // Default end = next slot after start (unless editing an existing entry)
      setEndTime(initialEntry?.endTime ?? nextSlotId(newStart));
      setColor(initialEntry?.color ?? TIMETABLE_COLOR_CLASSES[0]);
      setRecurring(initialEntry?.recurring ?? true);
    }
  }, [open, initialEntry]);

  // When user changes start time, auto-bump end time if it's now <= start
  const handleStartTimeChange = (newStart: string) => {
    setStartTime(newStart);
    const startIdx = TIMETABLE.TIME_SLOTS.findIndex((s) => s.id === newStart);
    const endIdx = TIMETABLE.TIME_SLOTS.findIndex((s) => s.id === endTime);
    if (endIdx <= startIdx) {
      setEndTime(nextSlotId(newStart));
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
    onSave({
      id: initialEntry?.id ?? generateId(),
      title: title.trim(),
      subtitle: subtitle.trim() || undefined,
      day,
      startTime,
      endTime,
      color,
      recurring,
      scopedToPhase: recurring ? undefined : currentPhase,
    });
    onClose();
  };

  const isEditing = !!initialEntry?.id;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPortal>
        <DialogOverlay />
        {/*
          Use DialogPrimitive.Content directly so we control the animation classes.
          We use ONLY zoom-in (scale from center) — no slide-from-corner classes.
        */}
        <DialogPrimitive.Content
          className="
            fixed left-[50%] top-[50%] z-50
            grid w-full max-w-md
            -translate-x-1/2 -translate-y-1/2
            gap-4 border bg-background p-6 shadow-lg sm:rounded-lg
            duration-350
            data-[state=open]:animate-in
            data-[state=open]:fade-in-0
            data-[state=open]:zoom-in-75
            data-[state=closed]:animate-out
            data-[state=closed]:fade-out-0
            data-[state=closed]:zoom-out-95
          "
        >
          {/* Close button */}
          <DialogPrimitive.Close
            onClick={onClose}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Fechar</span>
          </DialogPrimitive.Close>

          {/* Title */}
          <div className="flex flex-col space-y-1.5">
            <DialogPrimitive.Title className="text-lg font-semibold leading-none tracking-tight">
              {isEditing ? "Editar Evento" : "Novo Evento"}
            </DialogPrimitive.Title>
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

            {/* Início / Fim */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Início</Label>
                <Select value={startTime} onValueChange={handleStartTimeChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMETABLE.TIME_SLOTS.map((slot) => (
                      <SelectItem key={slot.id} value={slot.id}>
                        {slot.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Fim</Label>
                <Select value={endTime} onValueChange={setEndTime}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMETABLE.TIME_SLOTS.map((slot) => (
                      <SelectItem key={slot.id} value={slot.id}>
                        {slot.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
