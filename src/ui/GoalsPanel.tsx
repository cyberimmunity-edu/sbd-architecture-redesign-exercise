'use client';

/**
 * Панель целей — Ф-19: список целей со светофором и составом связанных
 * функций. В v0.01.01 размещается в левой панели под пулом карточек
 * (раздел 5.1 v0.01.01). Предположения безопасности и признак ПЛО (*)
 * у целей — v0.01.05; левая панель раздвижная — текст помещается целиком.
 */

import { useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSkibStore } from '../store/projectStore';
import { recalcCoverage } from '../engine/coverage';
import { ru } from '../i18n/ru';
import { StatusDot } from './status';

export function GoalsPanel() {
  const project = useSkibStore((s) => s.project);
  const { goalStatuses } = useMemo(() => recalcCoverage(project), [project]);

  const placementByFn = useMemo(() => {
    const map = new Map<string, string>();
    for (const assignment of project.assignments) map.set(assignment.function, assignment.block);
    return map;
  }, [project.assignments]);

  const covered = project.security.goals.filter(
    (goal) => goalStatuses.get(goal.id) === 'green',
  ).length;

  return (
    <div className="flex min-h-0 flex-[2] flex-col border-t border-border" data-testid="goals-panel">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{ru.goals.title}</h2>
        <span className="text-xs text-muted-foreground">
          {ru.goals.coveredOf(covered, project.security.goals.length)}
        </span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {/* Предположения безопасности (v0.01.05): принимаются как данность
            при формулировании целей; выводятся над списком целей. */}
        {(project.security.assumptions ?? []).length > 0 && (
          <div className="px-4 pt-1 pb-1" data-testid="assumptions-panel">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {ru.goals.assumptionsTitle}
            </h3>
            <ul className="mt-1.5 space-y-1.5">
              {(project.security.assumptions ?? []).map((assumption) => (
                <li
                  key={assumption.id}
                  className="rounded border border-dashed border-border bg-muted/40 px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground"
                  title={assumption.text}
                >
                  {assumption.text}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="space-y-2 px-4 pb-4">
          {project.security.goals.length === 0 && (
            <p className="text-xs italic text-muted-foreground">{ru.goals.empty}</p>
          )}
          {project.security.goals.map((goal) => {
            const linked = project.security.functions.filter((fn) =>
              (fn.implements ?? []).some((link) => link.goal === goal.id),
            );
            return (
              <div key={goal.id} className="rounded border border-border bg-card px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <StatusDot status={goalStatuses.get(goal.id) ?? 'red'} />
                  {/* ПЛО: значок (*) из коротких формулировок убран (v0.01.08) —
                      признак остаётся в файлах (unconditional) и в подсказке. */}
                  <span
                    className="min-w-0 flex-1 text-xs font-medium text-foreground"
                    title={
                      goal.unconditional
                        ? `${ru.goals.unconditionalHint}${goal.description ? ` — ${goal.description}` : ''}`
                        : (goal.description ?? goal.name)
                    }
                  >
                    {goal.name}
                  </span>
                </div>
                {/* Полная формулировка инварианта — видима на карточке (v0.01.06):
                    полные тексты целей важны для восприятия, не только в подсказке. */}
                {goal.description && (
                  <p
                    className="mt-1.5 border-t border-dashed border-border/60 pt-1.5 text-[11px] leading-snug text-muted-foreground"
                    data-testid={`goal-desc-${goal.id}`}
                    title={ru.goals.invariantHint}
                  >
                    {goal.description}
                  </p>
                )}
                {linked.length === 0 && (
                  <p className="mt-1 text-[11px] italic text-muted-foreground">{ru.goals.noFunctions}</p>
                )}
                <ul className="mt-1.5 space-y-0.5">
                  {linked.map((fn) => {
                    const weight =
                      (fn.implements ?? []).find((l) => l.goal === goal.id)?.weight ?? 'mandatory';
                    const placed = placementByFn.has(fn.id);
                    return (
                      <li key={fn.id} className="flex items-center justify-between gap-1.5 text-[11px]">
                        <span className="min-w-0 truncate text-muted-foreground" title={fn.name}>
                          {fn.name}
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <span
                            className={`shrink-0 rounded px-1 py-0.5 text-[10px] ${
                              weight === 'mandatory'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-secondary text-secondary-foreground'
                            }`}
                          >
                            {weight === 'mandatory' ? ru.goals.mandatory : ru.goals.optional}
                          </span>
                          <span className={placed ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}>
                            {placed ? ru.goals.placed : ru.goals.notPlaced}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
