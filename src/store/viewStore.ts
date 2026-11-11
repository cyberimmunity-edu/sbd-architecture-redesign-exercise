/**
 * Хранилище настроек вида канвы — v0.01.02, свёрнутые порты — v0.01.03,
 * подсветка домена из таблиц ДВБ — v0.01.04.
 *
 * Настройки вида (показ стрелок-связей, фокус на внутреннем периметре,
 * свёрнутые порты стрелок, подсветка из таблиц) не входят в модель проекта:
 * они не влияют на расчёты стоимости и доверия, не пишутся в историю
 * операций (Ф-21) и не сохраняются в localStorage (Ф-22). Сознательно
 * сбрасываются при перезагрузке страницы — диаграмма всегда стартует
 * в полном виде, скрытые связи невозможно забыть между сеансами.
 *
 * Свёрнутые порты (v0.01.03): пользователь сворачивает стрелки порта
 * кнопкой «−» у порта домена; свёрнутые стрелки не отображаются, пока
 * он явно не откроет их кнопкой «+» или не сменит режим вида — смена
 * режима (кнопки «Стрелки» и «Периметр») возвращает все стрелки.
 *
 * Подсветка из таблиц (v0.01.04): наведение на строку домена в таблице
 * «Расширенный анализ ДВБ» подсвечивает домен на диаграмме и в
 * мини-навигаторе; клик по строке отправляет канве событие
 * FOCUS_NODE_EVENT — фокус на домене (в центр, с укрупнением) и выбор.
 */

import { create } from 'zustand';

/** Ключ свёрнутого порта: `${blockId}:in` или `${blockId}:out`. */
export type PortKey = string;

/** Событие канвы «фокус на домене» (деталь — blockId) — v0.01.04. */
export const FOCUS_NODE_EVENT = 'skib-focus-node';

export interface ViewState {
  /** Показ стрелок-связей на канве (v0.01.02). */
  showEdges: boolean;
  /** Фокус на внутреннем периметре: внешние системы и их связи скрыты (v0.01.02). */
  focusInternal: boolean;
  /** Свёрнутые порты стрелок (v0.01.03): ключ порта → свёрнут. */
  collapsedPorts: Record<PortKey, boolean>;
  /** Домен, подсвеченный из таблиц правой панели (v0.01.04): наведение на строку. */
  highlightedDomainId: string | null;
  toggleShowEdges: () => void;
  toggleFocusInternal: () => void;
  /** Свернуть/развернуть стрелки порта (v0.01.03). */
  togglePort: (key: PortKey) => void;
  /** Развернуть все свёрнутые порты (v0.01.03). */
  expandAllPorts: () => void;
  /** Установить/снять подсветку домена из таблицы (v0.01.04). */
  setHighlightedDomain: (id: string | null) => void;
}

export const useViewStore = create<ViewState>((set, get) => ({
  showEdges: true,
  focusInternal: false,
  collapsedPorts: {},
  highlightedDomainId: null,
  toggleShowEdges: () =>
    // Смена режима вида возвращает свёрнутые стрелки (v0.01.03).
    set({ showEdges: !get().showEdges, collapsedPorts: {} }),
  toggleFocusInternal: () =>
    set({ focusInternal: !get().focusInternal, collapsedPorts: {} }),
  togglePort: (key) =>
    set({
      collapsedPorts: { ...get().collapsedPorts, [key]: !get().collapsedPorts[key] },
    }),
  expandAllPorts: () => set({ collapsedPorts: {} }),
  setHighlightedDomain: (id) => set({ highlightedDomainId: id }),
}));
