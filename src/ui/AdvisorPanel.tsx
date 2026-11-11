'use client';

/**
 * Панель советов по архитектуре — v0.01.08. Советы генерирует чистая
 * computeAdvice (src/engine/advisor.ts): эвристики улучшения модели с
 * оценкой экономии C_системы через пересчёт кандидата «что-если».
 * Советы — не ошибки: ничего не блокируют и не применяют автоматически;
 * наведение подсвечивает домен-адресат на диаграмме и в мини-навигаторе
 * (механизм v0.01.04), клик — фокус на домене и выбор в инспекторе.
 */

import { useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Lightbulb } from 'lucide-react';
import { useSkibStore } from '../store/projectStore';
import { useViewStore, FOCUS_NODE_EVENT } from '../store/viewStore';
import { computeAdvice, type Advice } from '../engine/advisor';
import { ru } from '../i18n/ru';

/** Формулировка совета по виду и адресатам (НФ-8: строки — в i18n). */
function adviceText(advice: Advice, blockName: (id: string) => string): string {
  const name = blockName(advice.blocks[0] ?? '');
  switch (advice.kind) {
    case 'goal-coverage': {
      const goalName = advice.goals[0] ?? '';
      return advice.severity === 'yellow'
        ? ru.advisor.goalCoverageYellow(goalName)
        : ru.advisor.goalCoverageRed(goalName);
    }
    case 'unlinked-function':
      return ru.advisor.unlinkedFunction(advice.functions[0] ?? '');
    case 'empty-domain':
      return ru.advisor.emptyDomain(name);
    case 'isolated-domain':
      return ru.advisor.isolatedDomain(name);
    case 'ddbpcd-split':
      return ru.advisor.ddbpcdSplit(name, advice.params.moved ?? 0);
    case 'ddb-regroup':
      return ru.advisor.ddbRegroup(name, advice.params.moved ?? 0);
    case 'filter-domain':
      return ru.advisor.filterDomain(name, advice.params.redIncoming ?? 0);
    case 'cost-leader':
      return ru.advisor.costLeader(name, advice.params.percent ?? 0);
    default:
      return advice.kind;
  }
}

export function AdvisorPanel() {
  const project = useSkibStore((s) => s.project);
  const setSelection = useSkibStore((s) => s.setSelection);
  const setHighlightedDomain = useViewStore((s) => s.setHighlightedDomain);

  const advices = useMemo(() => computeAdvice(project), [project]);
  const blockName = useMemo(() => {
    const names = new Map(project.architecture.blocks.map((b) => [b.id, b.name] as const));
    return (id: string) => names.get(id) ?? id;
  }, [project.architecture.blocks]);

  return (
    <section
      className="shrink-0 border-t border-border bg-card px-4 py-3"
      aria-label={ru.advisor.title}
      data-testid="advisor-panel"
    >
      <div className="flex items-center gap-1.5">
        <Lightbulb className="h-4 w-4 text-amber-500" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">{ru.advisor.title}</h2>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{ru.advisor.subtitle}</p>
      {/* Связь с канвой: подсветка и фокус по совету — как в таблице ДВБ. */}
      <p className="mt-1 text-xs text-muted-foreground">{ru.advisor.interactionHint}</p>

      {advices.length === 0 ? (
        <p
          className="mt-2 rounded-lg border border-dashed border-border bg-background/40 px-3 py-2.5 text-xs text-muted-foreground"
          data-testid="advisor-empty"
        >
          {ru.advisor.empty}
        </p>
      ) : (
        <ScrollArea className="mt-2 max-h-56">
          <ul className="space-y-1.5 pr-1" data-testid="advisor-list">
            {advices.map((advice, index) => {
              const hasTarget = (advice.blocks[0] ?? '').length > 0;
              return (
                <li
                  key={`${advice.kind}-${advice.blocks.join('~')}-${index}`}
                  className="rounded border border-border bg-background/40 px-2.5 py-1.5 text-[11px] leading-snug"
                  data-testid={`advice-${advice.kind}`}
                  onMouseEnter={() => hasTarget && setHighlightedDomain(advice.blocks[0])}
                  onMouseLeave={() => hasTarget && setHighlightedDomain(null)}
                  onClick={() => {
                    if (!hasTarget) return;
                    setSelection({ kind: 'domain', id: advice.blocks[0] });
                    window.dispatchEvent(
                      new CustomEvent(FOCUS_NODE_EVENT, { detail: advice.blocks[0] }),
                    );
                  }}
                  title={
                    hasTarget
                      ? ru.dvb.rowHint(blockName(advice.blocks[0]))
                      : undefined
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 text-foreground">
                      {adviceText(advice, blockName)}
                    </span>
                    {advice.deltaC !== null && advice.deltaC > 0 && (
                      <span
                        className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300"
                        title={ru.advisor.savingTitle}
                        data-testid="advice-saving"
                      >
                        {ru.advisor.saving(advice.deltaC)}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}
    </section>
  );
}
