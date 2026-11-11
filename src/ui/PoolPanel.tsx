'use client';

/**
 * Пул карточек — зона «Пул карточек» раздела 5.1, Ф-7: имя, стоимость,
 * точечные индикаторы целей, статус; фильтры «все / свободные / размещённые».
 * Перетаскивание карточки в домен создаёт размещение (Ф-8).
 */

import { useMemo, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSkibStore } from '../store/projectStore';
import { recalcCoverage } from '../engine/coverage';
import type { SecurityFunction, Status } from '../engine/types';
import { STATUS_COLORS, StatusDot } from './status';
import { ru } from '../i18n/ru';

type Filter = 'all' | 'free' | 'placed';

export function CardItem({
  fn,
  status,
  goalStatuses,
  placementBlockName,
}: {
  fn: SecurityFunction;
  status: Status;
  goalStatuses: Map<string, Status>;
  placementBlockName?: string;
}) {
  const setSelection = useSkibStore((s) => s.setSelection);
  const selection = useSkibStore((s) => s.selection);
  const isSelected = selection?.kind === 'card' && selection.id === fn.id;
  const links = fn.implements ?? [];

  return (
    <div
      className={`rounded-md border px-3 py-2 ${isSelected ? 'border-foreground' : 'border-border'} bg-card shadow-sm transition-colors`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('application/x-skib-function', fn.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => setSelection({ kind: 'card', id: fn.id })}
      data-testid={`pool-card-${fn.id}`}
      title={`${fn.name} — стоимость ${fn.cost}. ${ru.pool.dragHint}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {fn.name}
        </span>
        <span
          className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
          title={`${ru.pool.cost}: ${fn.cost}`}
        >
          {fn.cost} у.е.
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="flex shrink-0 items-center gap-1">
          {links.length === 0 && <span className="text-xs italic text-muted-foreground">—</span>}
          {links.map((link, index) => (
            <span
              key={index}
              className="h-3 w-3 rounded-full ring-1 ring-white"
              style={{ backgroundColor: STATUS_COLORS[goalStatuses.get(link.goal) ?? 'red'] }}
              title={link.weight === 'mandatory' ? ru.goals.mandatory : ru.goals.optional}
            />
          ))}
        </span>
        <span
          className={`min-w-0 truncate text-right text-xs ${placementBlockName ? 'text-sky-600 dark:text-sky-400' : 'text-emerald-600 dark:text-emerald-400'}`}
          title={placementBlockName ? ru.pool.placedIn(placementBlockName) : ru.pool.free}
        >
          {placementBlockName ? ru.pool.placedIn(placementBlockName) : ru.pool.free}
        </span>
      </div>
      {status !== 'neutral' && (
        <div className="mt-1">
          <StatusDot status={status} />
        </div>
      )}
    </div>
  );
}

export function PoolPanel() {
  const project = useSkibStore((s) => s.project);
  const [filter, setFilter] = useState<Filter>('all');

  const { goalStatuses } = useMemo(() => recalcCoverage(project), [project]);

  const placementByFn = useMemo(() => {
    const map = new Map<string, string>();
    for (const assignment of project.assignments) map.set(assignment.function, assignment.block);
    return map;
  }, [project.assignments]);

  const blockNameById = useMemo(
    () => new Map(project.architecture.blocks.map((b) => [b.id, b.name])),
    [project.architecture.blocks],
  );

  const visible = project.security.functions.filter((fn) => {
    const placed = placementByFn.has(fn.id);
    if (filter === 'free') return !placed;
    if (filter === 'placed') return placed;
    return true;
  });

  const freeCount = project.security.functions.filter((fn) => !placementByFn.has(fn.id)).length;

  return (
    <aside className="flex min-h-0 flex-1 flex-col" aria-label={ru.pool.title}>
      <div className="px-4 pt-3 pb-2">
        <h2 className="text-sm font-semibold text-foreground">{ru.pool.title}</h2>
        <div className="mt-2 flex items-center gap-1" role="tablist">
          {(['all', 'free', 'placed'] as Filter[]).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              className={`rounded px-2.5 py-1 text-xs ${
                filter === value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:bg-accent'
              } border border-border`}
              onClick={() => setFilter(value)}
            >
              {value === 'all' ? ru.pool.filterAll : value === 'free' ? ru.pool.filterFree : ru.pool.filterPlaced}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {ru.pool.counter(freeCount, project.security.functions.length)}
        </p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 p-3 pt-0">
          {visible.length === 0 && (
            <p className="px-1 text-xs italic text-muted-foreground">{ru.pool.empty}</p>
          )}
          {visible.map((fn) => (
            <CardItem
              key={fn.id}
              fn={fn}
              status="neutral"
              goalStatuses={goalStatuses}
              placementBlockName={
                placementByFn.has(fn.id)
                  ? (blockNameById.get(placementByFn.get(fn.id)!) ?? '')
                  : undefined
              }
            />
          ))}
        </div>
      </ScrollArea>
      <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">{ru.pool.dragHint}</div>
    </aside>
  );
}
