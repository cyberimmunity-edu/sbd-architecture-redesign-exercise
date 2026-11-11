'use client';

/** Строка итогов — зона раздела 5.1, Ф-20: C_системы, домены, размещения, покрытие. */

import { useMemo } from 'react';
import { useSkibStore } from '../store/projectStore';
import { recalcCosts } from '../engine/cost';
import { recalcCoverage } from '../engine/coverage';
import { ru } from '../i18n/ru';
import { StatusDot, STATUS_COLORS } from './status';

export function SummaryBar() {
  const project = useSkibStore((s) => s.project);
  const { systemCost } = useMemo(() => recalcCosts(project), [project]);
  const { goalStatuses, systemStatus } = useMemo(() => recalcCoverage(project), [project]);

  const placed = project.assignments.length;
  const totalFunctions = project.security.functions.length;
  const covered = project.security.goals.filter((g) => goalStatuses.get(g.id) === 'green').length;
  const totalGoals = project.security.goals.length;

  return (
    <footer
      className="flex h-8 items-center gap-4 border-t border-slate-300 bg-white px-4 text-xs text-slate-700"
      data-testid="summary-bar"
    >
      <span className="font-semibold" data-testid="summary-system-cost">
        {ru.summary.systemCost(systemCost)}
      </span>
      <span data-testid="summary-domains">{ru.summary.domains(project.architecture.blocks.length)}</span>
      <span data-testid="summary-placed">{ru.summary.placed(placed, totalFunctions)}</span>
      <span data-testid="summary-covered">{ru.summary.covered(covered, totalGoals)}</span>
      <span className="ml-auto flex items-center gap-1.5" data-testid="summary-status">
        <span
          className="h-3.5 w-3.5 rounded-full"
          style={{
            backgroundColor:
              totalGoals === 0
                ? STATUS_COLORS.neutral
                : STATUS_COLORS[systemStatus],
          }}
          aria-hidden
        />
        {totalGoals === 0
          ? ru.summary.systemStatusNeutral
          : ru.summary.systemStatus(systemStatus as 'red' | 'yellow' | 'green')}
      </span>
    </footer>
  );
}
