'use client';

/**
 * Цветовая система статусов и доверия — раздел 5.3 ТЗ. К каждому статусу
 * прилагается не только цвет, но и графический либо текстовый признак (НФ-9):
 * красный — крест и «не покрыта», жёлтый — половина круга и «частично»,
 * зелёный — галочка и «полностью», нейтральный — «нет функций».
 * Цвета доверия (3.5 v0.01.01): НДБ — полупрозрачная красная заливка,
 * ДДБ — зелёная, ДДБПЦД — жёлтая; текст домена чёрный в светлой теме
 * и светлый в тёмной (токен --foreground).
 */

import { Check, Contrast, Minus, X } from 'lucide-react';
import type { Status } from '../engine/types';
import { ru } from '../i18n/ru';

export const STATUS_COLORS: Record<Status, string> = {
  red: '#D32F2F',
  yellow: '#F9A825',
  green: '#43A047',
  neutral: '#9E9E9E',
};

export const STATUS_LABELS: Record<Status, string> = {
  red: ru.canvas.statusRed,
  yellow: ru.canvas.statusYellow,
  green: ru.canvas.statusGreen,
  neutral: ru.canvas.statusNeutral,
};

/** Цвета доверия — заливка (полупрозрачная) и контур доменов/стрелок (3.5). */
export const TRUST_COLORS = {
  red: { fill: 'rgba(211, 47, 47, 0.14)', border: '#D32F2F' },
  yellow: { fill: 'rgba(249, 168, 37, 0.22)', border: '#F9A825' },
  green: { fill: 'rgba(67, 160, 71, 0.18)', border: '#43A047' },
} as const;

/**
 * Цвет подсветки домена, выбранного из таблиц правой панели (v0.01.04):
 * наведение на строку в «Расширенном анализе ДВБ» подсвечивает домен
 * на диаграмме и в мини-навигаторе. Небесно-голубой — не совпадает ни
 * с одним цветом доверия/статуса, чтобы не путаться со светофором.
 */
export const HIGHLIGHT_COLOR = '#38BDF8';

export function statusIcon(status: Status): React.ReactNode {
  switch (status) {
    case 'red':
      return <X className="h-3 w-3" strokeWidth={3} aria-hidden />;
    case 'yellow':
      return <Contrast className="h-3 w-3" aria-hidden />;
    case 'green':
      return <Check className="h-3 w-3" strokeWidth={3} aria-hidden />;
    default:
      return <Minus className="h-3 w-3" aria-hidden />;
  }
}

/** Точка статуса с графическим дублёром внутри (для компактных мест). */
export function StatusDot({ status, label }: { status: Status; label?: string }) {
  return (
    <span
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white"
      style={{ backgroundColor: STATUS_COLORS[status] }}
      title={label ?? STATUS_LABELS[status]}
      aria-label={label ?? STATUS_LABELS[status]}
      role="img"
    >
      {statusIcon(status)}
    </span>
  );
}

/** Статус с точкой и текстовой подписью. */
export function StatusBadge({ status }: { status: Status }) {
  const label = STATUS_LABELS[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" title={label}>
      <StatusDot status={status} />
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
