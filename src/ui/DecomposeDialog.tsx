'use client';

/**
 * Диалог декомпозиции — Ф-16: число потомков 2–6, имена и C_блока,
 * назначение каждой стрелки исходного домена одному из потомков.
 * При отказе модель не изменяется (транзакционность 7.3, T-D-01).
 */

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSkibStore } from '../store/projectStore';
import { ru } from '../i18n/ru';

interface ChildForm {
  name: string;
  cost: string;
}

export function DecomposeDialog({
  blockId,
  onClose,
}: {
  blockId: string | null;
  onClose: () => void;
}) {
  const project = useSkibStore((s) => s.project);
  const decomposeBlock = useSkibStore((s) => s.decomposeBlock);
  // Начальные значения формы вычисляются ленивыми инициализаторами при монтировании.
  // Родитель монтирует диалог с key={blockId}, поэтому при каждом открытии
  // (и смене домена) форма гарантированно получает значения по умолчанию Ф-16
  // без setState внутри эффектов.
  const [k, setK] = useState(2);
  const [children, setChildren] = useState<ChildForm[]>(() => {
    const current = useSkibStore.getState().project;
    const block = current.architecture.blocks.find((b) => b.id === blockId);
    return block
      ? Array.from({ length: 2 }, (_, index) => ({
          name: `${block.name}.${index + 1}`,
          cost: '1',
        }))
      : [];
  });
  const [edgeAssign, setEdgeAssign] = useState<Record<string, number>>(() => {
    const current = useSkibStore.getState().project;
    const assignments: Record<string, number> = {};
    for (const edge of current.architecture.edges) {
      if (edge.from === blockId || edge.to === blockId) assignments[edge.id] = 0;
    }
    return assignments;
  });
  const [errors, setErrors] = useState<string[]>([]);

  const parent = useMemo(
    () => project.architecture.blocks.find((b) => b.id === blockId),
    [project.architecture.blocks, blockId],
  );
  const touchingEdges = useMemo(
    () =>
      project.architecture.edges.filter(
        (edge) => edge.from === blockId || edge.to === blockId,
      ),
    [project.architecture.edges, blockId],
  );

  if (!blockId || !parent) return null;

  const applyCount = (count: number) => {
    setK(count);
    setChildren((prev) => {
      const next = [...prev];
      while (next.length < count) {
        next.push({ name: `${parent.name}.${next.length + 1}`, cost: '1' });
      }
      return next.slice(0, count);
    });
    setEdgeAssign((prev) => {
      const next = { ...prev };
      for (const edge of touchingEdges) {
        if (next[edge.id] === undefined || next[edge.id] >= count) next[edge.id] = 0;
      }
      return next;
    });
  };

  const handleApply = () => {
    const result = decomposeBlock({
      blockId,
      children: children.map((child) => ({
        name: child.name.trim(),
        cost: Number(child.cost),
      })),
      edgeAssignments: Object.entries(edgeAssign).map(([edgeId, childIndex]) => ({
        edgeId,
        childIndex,
      })),
    });
    if (result.ok) {
      onClose();
    } else {
      setErrors(result.errors ?? [ru.errors.decomposeFailed]);
    }
  };

  return (
    <Dialog open={!!blockId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {ru.dialogs.decomposeTitle}: «{parent.name}»
          </DialogTitle>
          <DialogDescription>
            Домен будет заменён {k} доменами того же уровня; его функции вернутся в пул;
            стрелки переподключатся по назначению.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">{ru.dialogs.decomposeChildrenCount}</Label>
            <div className="mt-1 flex gap-1">
              {[2, 3, 4, 5, 6].map((count) => (
                <button
                  key={count}
                  type="button"
                  className={`h-8 w-8 rounded border text-sm ${
                    k === count
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-foreground hover:bg-accent'
                  }`}
                  onClick={() => applyCount(count)}
                  aria-pressed={k === count}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {children.map((child, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Label htmlFor={`child-name-${index}`} className="text-xs">
                    {ru.dialogs.decomposeChildName} {index + 1}
                  </Label>
                  <Input
                    id={`child-name-${index}`}
                    className="mt-1 h-8"
                    value={child.name}
                    onChange={(event) =>
                      setChildren((prev) =>
                        prev.map((item, i) =>
                          i === index ? { ...item, name: event.target.value } : item,
                        ),
                      )
                    }
                  />
                </div>
                <div className="w-24">
                  <Label htmlFor={`child-cost-${index}`} className="text-xs">
                    {ru.dialogs.decomposeChildCost}
                  </Label>
                  <Input
                    id={`child-cost-${index}`}
                    className="mt-1 h-8"
                    type="number"
                    min={0}
                    step={1}
                    value={child.cost}
                    onChange={(event) =>
                      setChildren((prev) =>
                        prev.map((item, i) =>
                          i === index ? { ...item, cost: event.target.value } : item,
                        ),
                      )
                    }
                  />
                </div>
              </div>
            ))}
          </div>

          <div>
            <Label className="text-xs">{ru.dialogs.decomposeEdges}</Label>
            {touchingEdges.length === 0 ? (
              <p className="mt-1 text-xs italic text-muted-foreground">{ru.dialogs.decomposeNoEdges}</p>
            ) : (
              <div className="mt-1 space-y-1.5">
                {touchingEdges.map((edge) => {
                  const fromName = project.architecture.blocks.find((b) => b.id === edge.from)?.name;
                  const toName = project.architecture.blocks.find((b) => b.id === edge.to)?.name;
                  return (
                    <div key={edge.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {fromName} → {toName}
                        {edge.label ? ` «${edge.label}»` : ''}
                      </span>
                      <Select
                        value={String(edgeAssign[edge.id] ?? 0)}
                        onValueChange={(value) =>
                          setEdgeAssign((prev) => ({ ...prev, [edge.id]: Number(value) }))
                        }
                      >
                        <SelectTrigger className="h-7 w-44 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {children.map((child, index) => (
                            <SelectItem key={index} value={String(index)}>
                              {child.name || `Потомок ${index + 1}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {errors.length > 0 && (
            <ul className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {ru.inspector.cancel}
          </Button>
          <Button onClick={handleApply}>{ru.dialogs.decomposeApply}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
