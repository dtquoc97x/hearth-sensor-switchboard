import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EyeOff, GripHorizontal, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function ModuleShell({
  id, title, editing, span, onHide, onRemove, children,
}: {
  id: string; title: string; editing: boolean; span: string;
  onHide: () => void; onRemove?: () => void; children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !editing });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative", span, isDragging && "z-20 opacity-80", editing && "rounded-[var(--radius-panel,1rem)] ring-2 ring-dashed ring-signal/40 ring-offset-2 ring-offset-background")}
    >
      {editing && (
        <div className="absolute inset-x-2 -top-3 z-10 flex items-center justify-between">
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Drag ${title}`}
            className="flex cursor-grab touch-none items-center gap-1 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground shadow-sm active:cursor-grabbing"
          >
            <GripHorizontal className="size-4" /> {title}
          </button>
          <div className="flex gap-1">
            <button type="button" onClick={onHide} aria-label={`Hide ${title}`} className="rounded-full border bg-card p-1.5 text-muted-foreground shadow-sm hover:text-foreground">
              <EyeOff className="size-3.5" />
            </button>
            {onRemove && (
              <button type="button" onClick={onRemove} aria-label={`Remove ${title}`} className="rounded-full border bg-card p-1.5 text-muted-foreground shadow-sm hover:text-destructive">
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
      <div className={cn("h-full [&>*]:h-full", editing && "pointer-events-none select-none")}>{children}</div>
    </div>
  );
}
