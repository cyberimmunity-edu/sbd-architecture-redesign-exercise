'use client';

/**
 * Панель расчёта и статуса — зона правой панели под инспектором
 * (раздел 5.1 v0.01.01). Метрики оценки архитектуры — крупным текстом
 * (v0.01.02), чтобы результаты переработки бросались в глаза: C_системы —
 * самым крупным шрифтом панели, статус системы — с крупным цветовым индикатором
 * и полным предложением вместо обрыва «полностью» (v0.01.03),
 * размещения/покрытие/домены/внешние системы — плитками с полужирными значениями.
 * Внешние системы не входят в C_системы и показываются отдельным счётчиком.
 */

import { useMemo } from 'react';
import { useSkibStore } from '../store/projectStore';
import { recalcCosts } from '../engine/cost';
import { recalcCoverage } from '../engine/coverage';
import { ru } from '../i18n/ru';
import { STATUS_COLORS } from './status';

/** Плитка метрики с крупным значением (v0.01.02). */
function MetricTile({
  testId,
  value,
}: {
  testId: string;
  value: string;
}) {
  return (
    <div
      className="rounded-lg border border-border bg-background/40 px-2.5 py-2"
      data-testid={testId}
    >
      <div className="text-base font-bold leading-snug text-foreground">{value}</div>
    </div>
  );
}

export function SummaryPanel() {
  const project = useSkibStore((s) => s.project);
  const { systemCost, costs } = useMemo(() => recalcCosts(project), [project]);
  const { goalStatuses, systemStatus } = useMemo(() => recalcCoverage(project), [project]);

  const placed = project.assignments.length;
  const totalFunctions = project.security.functions.length;
  const covered = project.security.goals.filter((g) => goalStatuses.get(g.id) === 'green').length;
  const totalGoals = project.security.goals.length;

  const blocks = project.architecture.blocks;
  const internal = blocks.filter((b) => !b.external);
  const externals = blocks.filter((b) => b.external);

  const counts = useMemo(() => {
    let ndb = 0;
    let ddb = 0;
    let ddbpcd = 0;
    let trustedExternals = 0;
    for (const block of blocks) {
      if (block.external) {
        if (block.trusted) trustedExternals += 1;
        continue;
      }
      const cls = costs.get(block.id)?.trustCoefficient;
      // Класс доверия пересчитан в recalcCosts: 0.1 — НДБ, 5 — ДДБ, 10 — ДДБПЦД.
      if (cls === 0.1) ndb += 1;
      else if (cls === 5) ddb += 1;
      else if (cls === 10) ddbpcd += 1;
      else ndb += 1;
    }
    return { ndb, ddb, ddbpcd, trustedExternals };
  }, [blocks, costs]);

  const statusColor = totalGoals === 0 ? STATUS_COLORS.neutral : STATUS_COLORS[systemStatus];

  return (
    <section
      className="shrink-0 border-t border-border bg-card px-4 py-3"
      aria-label={ru.summary.title}
      data-testid="summary-bar"
    >
      <h2 className="text-sm font-semibold text-foreground">{ru.summary.title}</h2>

      {/* Главная метрика — C_системы самым крупным шрифтом панели (v0.01.02). */}
      <div className="mt-2 rounded-lg border border-border bg-background/40 px-3 py-2.5">
        <div
          className="text-4xl font-extrabold leading-none tracking-tight text-foreground"
          data-testid="summary-system-cost"
        >
          {ru.summary.systemCost(systemCost)}
        </div>
        <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{ru.summary.systemCostHint}</div>
        {/* Статус системы — полным предложением, что именно означает цвет (v0.01.03). */}
        <div className="mt-2.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {ru.summary.statusCaption}
          </div>
          <div className="mt-1 flex items-start gap-2" data-testid="summary-status">
            <span
              className="mt-0.5 h-5 w-5 shrink-0 rounded-full"
              style={{ backgroundColor: statusColor }}
              aria-hidden
            />
            <span className="text-base font-semibold leading-tight text-foreground">
              {totalGoals === 0
                ? ru.summary.systemStatusNeutral
                : ru.summary.systemStatus(systemStatus as 'red' | 'yellow' | 'green')}
            </span>
          </div>
        </div>
      </div>

      {/* Метрики оценки архитектуры — плитки с крупными значениями (v0.01.02). */}
      <div className="mt-2 grid grid-cols-2 gap-2" data-testid="summary-details">
        <MetricTile testId="summary-placed" value={ru.summary.placed(placed, totalFunctions)} />
        <MetricTile testId="summary-covered" value={ru.summary.covered(covered, totalGoals)} />
        <MetricTile testId="summary-domains" value={ru.summary.domains(internal.length)} />
        <MetricTile testId="summary-externals" value={ru.summary.externals(externals.length)} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs" data-testid="summary-trust">
        <span className="text-muted-foreground">{ru.summary.trustTitle}:</span>
        <span
          className="rounded px-1.5 py-0.5 font-medium"
          style={{ background: 'rgba(211, 47, 47, 0.14)', border: '1px solid #D32F2F' }}
          title="НДБ — недоверенные домены, коэффициент 0.1"
        >
          {ru.summary.legendNdb(counts.ndb)}
        </span>
        <span
          className="rounded px-1.5 py-0.5 font-medium"
          style={{ background: 'rgba(249, 168, 37, 0.22)', border: '1px solid #F9A825' }}
          title="ДДБПЦД — доверенные домены, повышающие целостность данных, коэффициент 10"
        >
          {ru.summary.legendDdbPcd(counts.ddbpcd)}
        </span>
        <span
          className="rounded px-1.5 py-0.5 font-medium"
          style={{ background: 'rgba(67, 160, 71, 0.18)', border: '1px solid #43A047' }}
          title="ДДБ — доверенные домены безопасности, коэффициент 5"
        >
          {ru.summary.legendDdb(counts.ddb)}
        </span>
        {counts.trustedExternals > 0 && (
          <span
            className="rounded px-1.5 py-0.5 font-medium"
            style={{ background: 'rgba(67, 160, 71, 0.18)', border: '1px dashed #43A047' }}
            title="Доверенные внешние системы"
          >
            доверенных внешних: {counts.trustedExternals}
          </span>
        )}
      </div>
    </section>
  );
}
