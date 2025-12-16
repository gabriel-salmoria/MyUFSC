// Helper UI Components
import { CheckIcon, SearchIcon, XIcon } from "lucide-react";
import { ReactNode } from "react";

export function FormSection({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5">
      {title && <h2 className="text-lg font-medium">{title}</h2>}
      {children}
    </div>
  );
}

export function FormField({
  label,
  id,
  optional = false,
  type = "text",
  value,
  onChange,
  required = false,
  placeholder,
  style,
}: {
  label: string;
  id: string;
  optional?: boolean;
  type?: string;
  value: any;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}{" "}
        {optional && (
          <span className="text-sm font-medium text-blue-500">(opcional)</span>
        )}
      </label>
      <input
        type={type}
        id={id}
        value={value}
        onChange={onChange}
        className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2"
        placeholder={placeholder}
        required={required}
        style={style}
      />
    </div>
  );
}

export function DegreeProgramSelector({
  ref,
  label,
  selectedDegree,
  isOpen,
  searchTerm,
  searchInputRef,
  activeIndex,
  filteredPrograms,
  onOpenDropdown,
  onSearchChange,
  onKeyDown,
  onSelectProgram,
  onClearSelection,
  getProgramName,
}: {
  ref: React.RefObject<HTMLDivElement | null>;
  label: string;
  selectedDegree: string;
  isOpen: boolean;
  searchTerm: string;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  activeIndex: number;
  filteredPrograms: Array<{ id: string; name: string }>;
  onOpenDropdown: () => void;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSelectProgram: (programId: string) => void;
  onClearSelection: () => void;
  getProgramName: (id: string) => string;
}) {
  return (
    <div ref={ref} className="relative">
      <label
        htmlFor="currentDegree"
        className="block text-sm font-medium text-foreground"
      >
        {label}
      </label>

      {selectedDegree && (
        <div className="flex items-center mt-1 mb-2">
          <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs">
            <span>{getProgramName(selectedDegree)}</span>
            <button
              type="button"
              onClick={onClearSelection}
              className="hover:text-primary/70"
            >
              <XIcon className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      <div
        className="mt-1 flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm cursor-pointer"
        onClick={onOpenDropdown}
      >
        <span style={{ color: "#888888" }}>
          {selectedDegree
            ? "Alterar curso"
            : "Buscar cursos..."}
        </span>
        <SearchIcon className="h-4 w-4 opacity-50" />
      </div>

      {isOpen && (
        <SearchDropdown
          searchInputRef={searchInputRef}
          searchTerm={searchTerm}
          onSearchChange={onSearchChange}
          onKeyDown={onKeyDown}
          activeIndex={activeIndex}
          filteredPrograms={filteredPrograms}
          onSelectItem={(programId) => onSelectProgram(programId)}
          selectedIds={selectedDegree ? [selectedDegree] : []}
        />
      )}
    </div>
  );
}

export function DegreesOfInterestSelector({
  ref,
  label,
  optional,
  selectedDegrees,
  isOpen,
  searchTerm,
  searchInputRef,
  activeIndex,
  filteredPrograms,
  onOpenDropdown,
  onSearchChange,
  onKeyDown,
  onToggleProgram,
  getProgramName,
}: {
  ref: React.RefObject<HTMLDivElement | null>;
  label: string;
  optional?: boolean;
  selectedDegrees: string[];
  isOpen: boolean;
  searchTerm: string;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  activeIndex: number;
  filteredPrograms: Array<{ id: string; name: string }>;
  onOpenDropdown: () => void;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onToggleProgram: (id: string) => void;
  getProgramName: (id: string) => string;
}) {
  return (
    <div ref={ref} className="relative">
      <label className="block text-sm font-medium text-foreground">
        {label}{" "}
        {optional && (
          <span className="text-sm font-medium text-blue-500">(opcional)</span>
        )}
      </label>

      {/* Selected interests display */}
      {selectedDegrees.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1 mb-2">
          {selectedDegrees.map((id) => (
            <div
              key={id}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs"
            >
              <span>{getProgramName(id)}</span>
              <button
                type="button"
                onClick={() => onToggleProgram(id)}
                className="hover:text-primary/70"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className="mt-1 flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm cursor-pointer"
        onClick={onOpenDropdown}
      >
        <span style={{ color: "#888888" }}>Buscar cursos...</span>
        <SearchIcon className="h-4 w-4 opacity-50" />
      </div>

      {isOpen && (
        <SearchDropdown
          searchInputRef={searchInputRef}
          searchTerm={searchTerm}
          onSearchChange={onSearchChange}
          onKeyDown={onKeyDown}
          activeIndex={activeIndex}
          filteredPrograms={filteredPrograms}
          onSelectItem={onToggleProgram}
          selectedIds={selectedDegrees}
        />
      )}
    </div>
  );
}

export function SearchDropdown({
  searchInputRef,
  searchTerm,
  onSearchChange,
  onKeyDown,
  activeIndex,
  filteredPrograms,
  onSelectItem,
  selectedIds,
}: {
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  searchTerm: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  activeIndex: number;
  filteredPrograms: Array<{ id: string; name: string }>;
  onSelectItem: (id: string) => void;
  selectedIds: string[];
}) {
  return (
    <div className="absolute z-10 mt-1 w-full bg-card rounded-md shadow-lg border border-border overflow-auto max-h-60">
      <div className="sticky top-0 bg-background-secondary border-b border-border p-2">
        <div className="relative">
          <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Buscar programas..."
            className="w-full py-2 pl-8 pr-4 text-sm border border-border rounded-md bg-background"
            value={searchTerm}
            onChange={onSearchChange}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
      <ul className="py-1">
        {filteredPrograms.length === 0 ? (
          <li className="px-4 py-2 text-sm text-muted-foreground">
            Nenhum curso encontrado
          </li>
        ) : (
          filteredPrograms.map((program, index) => (
            <li
              key={program.id}
              className={`px-4 py-2 text-sm cursor-pointer flex items-center justify-between ${index === activeIndex ? "bg-accent text-accent-foreground" : ""
                } ${selectedIds.includes(program.id) ? "bg-primary/10" : ""}`}
              onClick={() => onSelectItem(program.id)}
            >
              <span>{program.name}</span>
              {selectedIds.includes(program.id) && (
                <CheckIcon className="h-4 w-4" />
              )}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
