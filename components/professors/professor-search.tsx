"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchProfessors } from "@/lib/professors-client";
import { ProfessorRatingBadge } from "./ProfessorRatingBadge";
import { cn } from "@/components/ui/utils";
import { motion, AnimatePresence } from "framer-motion";

interface ProfessorSearchResult {
  name: string;
  totalCourses: number;
  totalReviews: number;
  overall: number | null;
}

interface ProfessorSearchProps {
  onSelect: (professorName: string) => void;
  className?: string;
}

export function ProfessorSearch({ onSelect, className }: ProfessorSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfessorSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const popupRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isSelectingRef = useRef(false);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim().length >= 2) {
        setIsLoading(true);
        searchProfessors(query)
          .then((data) => {
            setResults(data);
            setActiveIndex(0);
          })
          .catch((err) => console.error("Search error:", err))
          .finally(() => setIsLoading(false));
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Focus management
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) =>
          Math.min(prev + 1, Math.min(results.length, 50) - 1),
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && results.length > 0) {
        const name = results[activeIndex].name;
        isSelectingRef.current = true;
        setIsOpen(false);
        setQuery("");
        setTimeout(() => {
          onSelect(name);
          isSelectingRef.current = false;
        }, 50);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, results, activeIndex, onSelect]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const displayedResults = results.slice(0, 50);

  return (
    <div className={cn("w-full", className)}>
      {/* Trigger Input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Buscar professores (ex: João da Silva)..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isSelectingRef.current) setIsOpen(true);
          }}
          onFocus={() => {
            if (!isSelectingRef.current) setIsOpen(true);
          }}
          className="pl-9 w-full bg-background"
        />
      </div>

      {/* Full Screen Popup (matches SearchPopup style) */}
      <AnimatePresence>
        {isOpen && (
        <motion.div
          key="search-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-black/20 dark:bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center pt-[10vh]"
        >
          <motion.div
            ref={popupRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="bg-background border border-border rounded-lg shadow-xl w-full max-w-md overflow-hidden"
            style={{ maxHeight: "60vh" }}
          >
            {/* Header / Input Area */}
            <div className="p-3 bg-background-secondary border-b border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <div className="text-sm text-muted-foreground">
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" /> Buscando...
                      </span>
                    ) : query.length >= 2 ? (
                      `Mostrando ${Math.min(results.length, 50)} de ${results.length} resultados`
                    ) : (
                      "Digite pelo menos 2 caracteres..."
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Fechar (Esc)
                </button>
              </div>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Buscar professores por nome..."
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            {/* Results Area */}
            <div
              className="overflow-y-auto"
              style={{ maxHeight: "calc(60vh - 100px)" }}
            >
              {displayedResults.length > 0 ? (
                <div className="p-1">
                  {displayedResults.map((prof, index) => (
                    <div
                      key={prof.name}
                      className={cn(
                        "p-2 rounded-md cursor-pointer hover:bg-accent flex items-center justify-between",
                        index === activeIndex &&
                          "bg-primary/10 hover:bg-primary/10",
                      )}
                      onClick={() => {
                        const name = prof.name;
                        isSelectingRef.current = true;
                        setIsOpen(false);
                        setQuery("");
                        // Defer until the search overlay has fully unmounted so
                        // Radix Dialog can open without focus-management conflicts.
                        setTimeout(() => {
                          onSelect(name);
                          isSelectingRef.current = false;
                        }, 50);
                      }}
                    >
                      <div className="flex flex-col overflow-hidden mr-2">
                        <div className="font-medium text-foreground truncate">
                          {prof.name}
                        </div>
                        <div className="text-sm text-muted-foreground truncate">
                          {prof.totalCourses}{" "}
                          {prof.totalCourses === 1
                            ? "disciplina"
                            : "disciplinas"}{" "}
                          • {prof.totalReviews}{" "}
                          {prof.totalReviews === 1 ? "avaliação" : "avaliações"}
                        </div>
                      </div>
                      <ProfessorRatingBadge
                        overall={prof.overall}
                        className="shrink-0"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                query.length >= 2 &&
                !isLoading && (
                  <div className="p-8 text-center text-muted-foreground">
                    Nenhum professor encontrado para "{query}"
                  </div>
                )
              )}
              {query.length < 2 && !isLoading && (
                <div className="p-8 text-center text-muted-foreground">
                  Comece a digitar para buscar professores.
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
