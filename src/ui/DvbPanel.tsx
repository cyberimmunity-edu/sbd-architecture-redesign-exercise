'use client';

/**
 * Панель расширенного анализа ДВБ — v0.01.03, подсветка и фокус — v0.01.04.
 * ДВБ — доверенная вычислительная база: совокупность доверенных внутренних
 * доменов (ДДБ и ДДБПЦД). По каждому доверенному домену выводится строка:
 * тип (ДДБ/ДДБПЦД), C_блока, S, M, K и C_домена; строки сортируются
 * по стоимости домена — самые дорогие сверху, чтобы было видно, с чего
 * начинать сокращение C_системы.
 * Связь с канвой (v0.01.04): наведение на строку подсвечивает домен
 * на диаграмме и в мини-навигаторе (viewStore.highlightedDomainId), клик —
 * фокус на домене (в центр, с укрупнением, событие FOCUS_NODE_EVENT)
 * и выбор домена в инспекторе. Панель только читает модель: пересчёт
 * чистый (recalcCosts), расчёты и история операций не меняются.
 * v0.01.06: принудительно введённые в ДВБ домены (forceTrusted) помечаются
 * звёздочкой у типа; внутренний скролл таблицы убран — высота области
 * правой панели изменяема по вертикали, прокрутку ведёт ScrollArea.
 */

import { useMemo } from 'react';
import { useSkibStore } from '../store/projectStore';
import { FOCUS_NODE_EVENT, useViewStore } from '../store/viewStore';
import { recalcCosts } from '../engine/cost';
import type { DomainCostResult } from '../engine/cost';
import type { DomainTrustClass } from '../engine/trust';
import { TRUST_COLORS } from './status';
import { ru } from '../i18n/ru';

/** Строка таблицы ДВБ. */
interface DvbRow {
  id: string;
  name: string;
  trustClass: DomainTrustClass;
  cost: DomainCostResult;
  /** Принудительный ввод в ДВБ без критичной функции (v0.01.06). */
  forced: boolean;
}

function formatMultiplier(m: number): string {
  return Number.isInteger(m) ? String(m) : m.toFixed(1);
}

export function DvbPanel() {
  const project = useSkibStore((s) => s.project);
  const setSelection = useSkibStore((s) => s.setSelection);
  const setHighlightedDomain = useViewStore((s) => s.setHighlightedDomain);
  const rows = useMemo<DvbRow[]>(() => {
    const { costs, trust } = recalcCosts(project);
    const list: DvbRow[] = [];
    for (const block of project.architecture.blocks) {
      if (block.external) continue;
      const trustClass = trust.internal.get(block.id);
      const cost = costs.get(block.id);
      if ((trustClass === 'ddb' || trustClass === 'ddbpcd') && cost) {
        list.push({ id: block.id, name: block.name, trustClass, cost, forced: block.forceTrusted === true });
      }
    }
    // Сортировка по стоимости домена: самые дорогие сверху (v0.01.03).
    return list.sort(
      (a, b) => b.cost.domainCost - a.cost.domainCost || a.name.localeCompare(b.name),
    );
  }, [project]);

  const typeColor = (trustClass: DomainTrustClass) =>
    trustClass === 'ddbpcd' ? TRUST_COLORS.yellow : TRUST_COLORS.green;

  return (
    <section
      className="shrink-0 border-t border-border bg-card px-4 py-3"
      aria-label={ru.dvb.title}
      data-testid="dvb-panel"
    >
      <h2 className="text-sm font-semibold text-foreground">{ru.dvb.title}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">{ru.dvb.subtitle}</p>
      {/* Связь с канвой (v0.01.04): подсветка и фокус по строке. */}
      <p className="mt-1 text-xs text-muted-foreground">{ru.dvb.interactionHint}</p>

      {rows.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-border bg-background/40 px-3 py-2.5 text-xs text-muted-foreground" data-testid="dvb-empty">
          {ru.dvb.empty}
        </p>
      ) : (
        <div className="mt-2 rounded-lg border border-border bg-background/40">
          <table className="w-full text-left text-[11px]" data-testid="dvb-table">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-1 py-1 font-medium">{ru.dvb.columnDomain}</th>
                <th className="px-1 py-1 font-medium">{ru.dvb.columnType}</th>
                <th className="px-1 py-1 text-right font-medium" title={ru.dvb.columnBlockCostTitle}>
                  {ru.dvb.columnBlockCost}
                </th>
                <th className="px-1 py-1 text-right font-medium">{ru.dvb.columnS}</th>
                <th className="px-1 py-1 text-right font-medium">{ru.dvb.columnM}</th>
                <th className="px-1 py-1 text-right font-medium">{ru.dvb.columnK}</th>
                <th className="px-1 py-1 text-right font-medium" title={ru.dvb.columnCostTitle}>
                  {ru.dvb.columnCost}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const color = typeColor(row.trustClass);
                return (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-b border-border/60 transition-colors last:border-b-0 hover:bg-accent/50"
                    data-testid={`dvb-row-${row.id}`}
                    title={ru.dvb.rowHint(row.name)}
                    onMouseEnter={() => setHighlightedDomain(row.id)}
                    onMouseLeave={() => setHighlightedDomain(null)}
                    onClick={() => {
                      // Фокус на домене (в центр, с укрупнением) и выбор —
                      // событие ловит FocusController внутри канвы (v0.01.04).
                      setSelection({ kind: 'domain', id: row.id });
                      window.dispatchEvent(new CustomEvent(FOCUS_NODE_EVENT, { detail: row.id }));
                    }}
                  >
                    <td className="whitespace-normal break-words px-1 py-1 font-medium text-foreground" title={row.name}>
                      {row.name}
                    </td>
                    <td className="px-1 py-1">
                      <span
                        className="rounded px-1 py-0.5 text-[9px] font-semibold"
                        style={{ border: `1px solid ${color.border}`, background: color.fill }}
                        title={row.forced ? ru.dvb.forcedRowTitle : undefined}
                      >
                        {row.trustClass === 'ddb' ? 'ДДБ' : 'ДДБПЦД'}
                        {row.forced ? ' *' : ''}
                      </span>
                    </td>
                    <td className="px-1 py-1 text-right tabular-nums" title={ru.dvb.columnBlockCostTitle}>{row.cost.blockCost}</td>
                    <td className="px-1 py-1 text-right tabular-nums">{row.cost.functionsCost}</td>
                    <td className="px-1 py-1 text-right tabular-nums">
                      {formatMultiplier(row.cost.multiplier)}
                    </td>
                    <td className="px-1 py-1 text-right tabular-nums">{row.cost.trustCoefficient}</td>
                    <td className="px-1 py-1 text-right font-bold tabular-nums text-foreground" title={ru.dvb.columnCostTitle}>
                      {row.cost.domainCost}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
