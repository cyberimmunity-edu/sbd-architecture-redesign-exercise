/**
 * Автоматические размеры доменов — v0.01.08. Режим вида: размер узла
 * пропорционален стоимости или базовой стоимости блока — быстрая зрительная
 * оценка ДВБ и сравнение с не-ДВБ частью по размеру и стоимости.
 *
 * Масштаб: площадь пропорциональна значению, поэтому фактор — корень
 * квадратный из нормированной стоимости (стандарт пузырьковых диаграмм):
 * f = 1 + (SIZE_MAX_FACTOR − 1) × √((v − vmin) / (vmax − vmin)).
 * Внешние системы не тарифицируются — остаются базового размера.
 * Настройка вида не влияет на расчёты (viewStore) и не пишется в историю.
 * Чистые и детерминированные функции.
 */

import type { Block, Project } from './types';
import type { DomainCostResult } from './cost';

/** Режим размеров: выкл / по стоимости домена / по C_блока. */
export type SizeMode = 'off' | 'cost' | 'block';

/** Базовые габариты домена (раздел 5.2 ТЗ: не менее 240×120 px). */
export const SIZE_BASE_WIDTH = 240;
export const SIZE_BASE_HEIGHT = 120;

/** Верхняя граница фактора роста: 1.8 → до 432×216 px. */
export const SIZE_MAX_FACTOR = 1.8;

/**
 * Факторы роста доменов для режима размеров. Значение режима:
 * - 'cost' — C_домена (учитывает K, S, M: доверенные домены visibly дороже);
 * - 'block' — C_блока (базовая стоимость без коэффициентов).
 * Внешние системы всегда 1 (стоимость не определяется).
 * При vmax = vmin или vmax = 0 рост не имеет смысла — все факторы 1.
 */
export function domainSizeFactors(
  project: Project,
  costs: Map<string, DomainCostResult>,
  mode: SizeMode,
): Map<string, number> {
  const factors = new Map<string, number>();
  const internal = project.architecture.blocks.filter((block) => !block.external);
  for (const block of project.architecture.blocks) factors.set(block.id, 1);
  if (mode === 'off' || internal.length === 0) return factors;

  const valueOf = (block: Block): number => {
    if (mode === 'block') return Math.max(0, block.cost);
    return Math.max(0, costs.get(block.id)?.domainCost ?? 0);
  };

  let min = Infinity;
  let max = -Infinity;
  for (const block of internal) {
    const value = valueOf(block);
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= 0 || max === min) {
    return factors;
  }
  for (const block of internal) {
    const normalized = (valueOf(block) - min) / (max - min);
    factors.set(block.id, 1 + (SIZE_MAX_FACTOR - 1) * Math.sqrt(normalized));
  }
  return factors;
}

/** Габариты узла по фактору (минимальные — базовые, раздел 5.2 ТЗ). */
export function sizeForFactor(factor: number): { width: number; height: number } {
  const clamped = Math.min(SIZE_MAX_FACTOR, Math.max(1, factor));
  return {
    width: Math.round(SIZE_BASE_WIDTH * clamped),
    height: Math.round(SIZE_BASE_HEIGHT * clamped),
  };
}
