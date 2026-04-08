"use client";

import { useState, useRef } from "react";
import type { TranscriptData } from "@/parsers/transcript-parser";

interface TranscriptUploaderProps {
  onParsed: (data: TranscriptData) => void;
}

export function TranscriptUploader({ onParsed }: TranscriptUploaderProps) {
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [summary, setSummary] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("loading");
    setErrorMsg("");
    setSummary("");

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/transcript/upload", {
        method: "POST",
        body: form,
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Erro ao processar PDF");
      }

      const data: TranscriptData = json.data;
      setStatus("success");
      setSummary(
        `${data.completed.length} cursadas, ${data.inProgress.length} em andamento, ${data.exempted.length} dispensadas`,
      );
      onParsed(data);
    } catch (err: unknown) {
      setStatus("error");
      setErrorMsg(
        err instanceof Error ? err.message : "Erro desconhecido",
      );
    }
  };

  const reset = () => {
    setStatus("idle");
    setErrorMsg("");
    setSummary("");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-foreground">
        Importar Histórico (PDF)
        <span className="block text-xs text-muted-foreground mt-0.5">
          Faça upload do seu Controle Curricular (PDF) para importar automaticamente suas disciplinas cursadas.
        </span>
      </label>

      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          onChange={handleUpload}
          disabled={status === "loading"}
          className="block w-full text-sm text-muted-foreground
            file:mr-3 file:py-1.5 file:px-3
            file:rounded-md file:border-0
            file:text-sm file:font-medium
            file:bg-primary file:text-primary-foreground
            file:cursor-pointer hover:file:bg-primary/90
            file:transition disabled:opacity-50"
        />
        {status !== "idle" && (
          <button
            onClick={reset}
            className="text-xs text-muted-foreground hover:text-foreground transition"
          >
            Limpar
          </button>
        )}
      </div>

      {status === "loading" && (
        <p className="text-sm text-muted-foreground animate-pulse">
          Processando PDF...
        </p>
      )}

      {status === "success" && (
        <p className="text-sm text-green-600 dark:text-green-400">
          Importado com sucesso: {summary}
        </p>
      )}

      {status === "error" && (
        <p className="text-sm text-red-600 dark:text-red-400">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
