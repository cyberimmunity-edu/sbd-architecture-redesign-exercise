/**
 * Метрики системы — v0.03.01 (интеграция с ИИ-агентами, топ-5 задача №4).
 *
 * Машиночитаемый снимок модели для внешних инструментов (CLI/MCP/скрипты):
 * стоимость, состав и бюджет ДВБ, покрытие целей, лимиты ДП, советы.
 * Все значения выводятся из чистых функций движка — recalcCosts,
 * computeTrust, goalStatus, computeAdvice — метрика не дублирует модель,
 * а агрегирует её (одинаковый проект — одинаковые числа).
 *
 * «Бюджет ДВБ» — ключевые числа для экономики архитектуры: размер
 * доверенной зоны (число ДДБ + ДДБПЦД), её доля C_системы, площадь
 * границы (рёбра через границу доверия) и переходы классов доверия.
 */

import type { Project } from './types';
import { recalcCosts } from './cost';
import { computeTrust, type DomainTrustClass } from './trust';
import { goalStatus } from './coverage';
import { computeAdvice } from './advisor';
import { groupDepths } from './groups';

/** Метрики бюджетa ДВБ: размер доверенной зоны и её границы. */
export interface DvbMetrics {
  /** Число внутренних доменов в ДВБ (ДДБ + ДДБПЦД). */
  size: number;
  /** C_системы доверенных доменов (сумма их C_домена). */
  cost: number;
  /** Доля доверенных доменов в C_системы, % (0…100). */
  costPercent: number;
  /** Рёбра через границу ДВБ: доверенный конец ↔ недоверенный (внутр. или внешняя система). */
  boundaryEdges: number;
  /** Переходы класса доверия между доверенными доменами (ДДБ ↔ ДДБПЦД). */
  trustTransitions: number;
}

/** Состав доменов и функций модели. */
export interface CompositionMetrics {
  domains: {
    total: number;
    internal: number;
    external: number;
    byTrust: Record<DomainTrustClass, number>;
  };
  functions: { total: number; placed: number; unplaced: number };
  edges: { total: number; red: number; green: number };
}

/** Покрытие целей безопасности (светофор цели, С6). */
export interface GoalsMetrics {
  total: number;
  red: number;
  yellow: number;
  green: number;
  neutral: number;
}

/** Метрики диаграмм последовательности (Ф-55…, лимиты Ф-58). */
export interface SequencesMetrics {
  count: number;
  lifelines: number;
  arrows: number;
  groups: number;
}

/** Логические группы ДБ (v0.02.03). */
export interface GroupsMetrics {
  count: number;
  /** Максимальная глубина вложенности ЛГ (0 — групп нет). */
  maxDepth: number;
}

/** Советы советчика (v0.01.08): количество и экономия (v0.03.01b). */
export interface AdviceMetrics {
  count: number;
  /** Сумма deltaC советов с положительной оценкой: потенциал каталога
   *  независимых кандидатов (каждый кандидат считается от текущей модели,
   *  варианты перебора не суммируются между собой — число может
   *  превышать C_системы и не является обещанием одновременного эффекта). */
  totalSaving: number;
  /** Суммарный потенциал каталога как доля C_системы, % (может быть > 100). */
  totalSavingPercent: number;
  /** Экономия лучшего одиночного совета (v0.03.01b, вариантный перебор).
   *  Гарантированно не превышает C_системы. */
  bestSaving: number;
  /** Доля лучшего одиночного совета в C_системы, % (0…100). */
  bestSavingPercent: number;
}

/** Полный снимок метрик проекта (computeMetrics). */
export interface SystemMetrics {
  systemCost: number;
  dvb: DvbMetrics;
  composition: CompositionMetrics;
  goals: GoalsMetrics;
  sequences: SequencesMetrics | null;
  groups: GroupsMetrics;
  advice: AdviceMetrics;
}

/**
 * Полные метрики проекта. Чистая и детерминированная функция.
 */
export function computeMetrics(project: Project): SystemMetrics {
  const { costs, systemCost, trust } = recalcCosts(project);
  const internal = project.architecture.blocks.filter((b) => !b.external);

  const byTrust: Record<DomainTrustClass, number> = { ndb: 0, ddb: 0, ddbpcd: 0 };
  let dvbSize = 0;
  let dvbCost = 0;
  for (const block of internal) {
    const cls = trust.internal.get(block.id) ?? 'ndb';
    byTrust[cls] += 1;
    if (cls !== 'ndb') {
      dvbSize += 1;
      dvbCost += costs.get(block.id)?.domainCost ?? 0;
    }
  }

  const trustedClass = (id: string): DomainTrustClass | 'external-trusted' | 'external-untrusted' | null => {
    if (!trust.internal.has(id)) {
      if (!trust.external.has(id)) return null;
      return trust.external.get(id) === 'green' ? 'external-trusted' : 'external-untrusted';
    }
    return trust.internal.get(id)!;
  };
  const isTrustedEnd = (id: string): boolean => {
    const cls = trustedClass(id);
    return cls === 'ddb' || cls === 'ddbpcd' || cls === 'external-trusted';
  };
  const isInternal = (id: string): boolean => trust.internal.has(id);

  let boundaryEdges = 0;
  let trustTransitions = 0;
  let redEdges = 0;
  for (const edge of project.architecture.edges) {
    if (trust.edges.get(edge.id) === 'red') redEdges += 1;
    const fromTrusted = isTrustedEnd(edge.from);
    const toTrusted = isTrustedEnd(edge.to);
    if (fromTrusted !== toTrusted) boundaryEdges += 1;
    else if (fromTrusted && isInternal(edge.from) && isInternal(edge.to)) {
      // Оба конца доверенные внутренние: переход класса — ДДБ ↔ ДДБПЦД.
      if (trust.internal.get(edge.from) !== trust.internal.get(edge.to)) trustTransitions += 1;
    }
  }

  let redGoals = 0;
  let yellowGoals = 0;
  let greenGoals = 0;
  let neutralGoals = 0;
  for (const goal of project.security.goals) {
    const status = goalStatus(project, goal.id);
    if (status === 'red') redGoals += 1;
    else if (status === 'yellow') yellowGoals += 1;
    else if (status === 'green') greenGoals += 1;
    else neutralGoals += 1;
  }

  const sequences = project.sequences ?? [];
  const sequencesMetrics: SequencesMetrics | null =
    sequences.length > 0
      ? {
          count: sequences.length,
          lifelines: sequences.reduce((sum, s) => sum + s.lifelines.length, 0),
          arrows: sequences.reduce((sum, s) => sum + s.arrows.length, 0),
          groups: sequences.reduce((sum, s) => sum + s.blocks.length, 0),
        }
      : null;

  const groupsList = project.architecture.groups ?? [];
  const maxDepth = groupsList.length > 0 ? Math.max(...groupDepths(groupsList).values()) : 0;

  const advices = computeAdvice(project);
  const totalSaving = advices.reduce((sum, a) => sum + Math.max(0, a.deltaC ?? 0), 0);
  const bestSaving = advices.reduce((best, a) => Math.max(best, a.deltaC ?? 0), 0);

  return {
    systemCost,
    dvb: {
      size: dvbSize,
      cost: dvbCost,
      costPercent: systemCost > 0 ? Math.round((dvbCost / systemCost) * 100) : 0,
      boundaryEdges,
      trustTransitions,
    },
    composition: {
      domains: {
        total: project.architecture.blocks.length,
        internal: internal.length,
        external: project.architecture.blocks.length - internal.length,
        byTrust,
      },
      functions: {
        total: project.security.functions.length,
        placed: project.assignments.length,
        unplaced: project.security.functions.length - project.assignments.length,
      },
      edges: {
        total: project.architecture.edges.length,
        red: redEdges,
        green: project.architecture.edges.length - redEdges,
      },
    },
    goals: {
      total: project.security.goals.length,
      red: redGoals,
      yellow: yellowGoals,
      green: greenGoals,
      neutral: neutralGoals,
    },
    sequences: sequencesMetrics,
    groups: { count: groupsList.length, maxDepth },
    advice: {
      count: advices.length,
      totalSaving,
      totalSavingPercent: systemCost > 0 ? Math.round((totalSaving / systemCost) * 100) : 0,
      bestSaving,
      bestSavingPercent: systemCost > 0 ? Math.round((bestSaving / systemCost) * 100) : 0,
    },
  };
}
