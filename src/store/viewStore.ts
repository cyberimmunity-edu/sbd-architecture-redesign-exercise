/**
 * Хранилище настроек вида канвы — v0.01.02, свёрнутые порты — v0.01.03,
 * подсветка домена из таблиц ДВБ — v0.01.04, краткая подсветка критичных
 * доменов цели — v0.01.09, вмещение доменов цели — v0.01.10.
 *
 * Настройки вида (показ стрелок-связей, фокус на внутреннем периметре,
 * свёрнутые порты стрелок, подсветка из таблиц, краткая подсветка доменов)
 * не входят в модель проекта: они не влияют на расчёты стоимости и доверия,
 * не пишутся в историю операций (Ф-21) и не сохраняются в localStorage
 * (Ф-22). Сознательно сбрасываются при перезагрузке страницы — диаграмма
 * всегда стартует в полном виде, скрытые связи невозможно забыть между
 * сеансами.
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
 *
 * Краткая подсветка критичных доменов цели (v0.01.09): клик по цели
 * безопасности в левой панели подсвечивает все критичные для неё домены
 * (голубое кольцо, остальные домены приглушены — как при подсветке
 * стрелок) на FLASH_DURATION_MS, затем подсветка гаснет сама.
 *
 * Вмещение обеспечивающих доменов цели (v0.01.10): тот же клик по цели
 * отправляет канве событие FOCUS_RECT_EVENT — масштаб подбирается так,
 * чтобы все критичные домены цели помещались в видимую область диаграммы.
 * Клик по функции безопасности подсвечивает домен её размещения и центрирует
 * его (FOCUS_NODE_EVENT).
 */

import { create } from 'zustand';
import type { SizeMode } from '../engine/sizing';

/** Ключ свёрнутого порта: `${blockId}:in` или `${blockId}:out`. */
export type PortKey = string;

/** Событие канвы «фокус на домене» (деталь — blockId) — v0.01.04. */
export const FOCUS_NODE_EVENT = 'skib-focus-node';

/**
 * Событие канвы «вместить домены в видимую область» (деталь — список blockId)
 * — v0.01.10: клик по цели безопасности подгоняет масштаб так, чтобы все
 * критичные для неё домены помещались в видимую область диаграммы.
 */
export const FOCUS_RECT_EVENT = 'skib-focus-rect';

/** Длительность краткой подсветки критичных доменов цели (v0.01.09), мс. */
export const FLASH_DURATION_MS = 2200;

/** Цикл режимов размеров доменов (v0.01.08): выкл → стоимость → блок. */
export const SIZE_MODE_CYCLE: SizeMode[] = ['off', 'cost', 'block'];

export interface ViewState {
  /** Показ стрелок-связей на канве (v0.01.02). */
  showEdges: boolean;
  /** Фокус на внутреннем периметре: внешние системы и их связи скрыты (v0.01.02). */
  focusInternal: boolean;
  /** Свёрнутые порты стрелок (v0.01.03): ключ порта → свёрнут. */
  collapsedPorts: Record<PortKey, boolean>;
  /** Домен, подсвеченный из таблиц правой панели (v0.01.04): наведение на строку. */
  highlightedDomainId: string | null;
  /** Режим автоматических размеров доменов (v0.01.08). */
  sizeMode: SizeMode;
  /** Критичные домены цели, кратко подсвеченные кликом по ЦБ (v0.01.09):
   *  голубое кольцо на канве и в мини-навигаторе, остальные домены приглушены. */
  flashDomainIds: ReadonlySet<string> | null;
  toggleShowEdges: () => void;
  toggleFocusInternal: () => void;
  /** Свернуть/развернуть стрелки порта (v0.01.03). */
  togglePort: (key: PortKey) => void;
  /** Развернуть все свёрнутые порты (v0.01.03). */
  expandAllPorts: () => void;
  /** Установить/снять подсветку домена из таблицы (v0.01.04). */
  setHighlightedDomain: (id: string | null) => void;
  /** Кратко подсветить домены (v0.01.09): клик по цели безопасности —
   *  критичные для неё домены подсвечиваются на FLASH_DURATION_MS,
   *  затем подсветка гаснет сама; повторный клик перезапускает отсчёт. */
  flashDomains: (ids: string[]) => void;
  /** Переключить режим размеров доменов по циклу (v0.01.08). */
  cycleSizeMode: () => void;
  /** Задать режим размеров напрямую (v0.01.08). */
  setSizeMode: (mode: SizeMode) => void;
}

/** Таймер гашения краткой подсветки (v0.01.09) — вне состояния zustand. */
let flashTimer: ReturnType<typeof setTimeout> | null = null;

export const useViewStore = create<ViewState>((set, get) => ({
  showEdges: true,
  focusInternal: false,
  collapsedPorts: {},
  highlightedDomainId: null,
  sizeMode: 'off',
  flashDomainIds: null,
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
  flashDomains: (ids) => {
    if (flashTimer) clearTimeout(flashTimer);
    // Пустой набор (у цели нет критичных доменов) — подсветки нет: иначе
    // были бы приглушены все домены диаграммы без единого выделенного.
    if (ids.length === 0) {
      flashTimer = null;
      set({ flashDomainIds: null });
      return;
    }
    set({ flashDomainIds: new Set(ids) });
    flashTimer = setTimeout(() => {
      flashTimer = null;
      set({ flashDomainIds: null });
    }, FLASH_DURATION_MS);
  },
  cycleSizeMode: () => {
    const current = SIZE_MODE_CYCLE.indexOf(get().sizeMode);
    const next = SIZE_MODE_CYCLE[(current + 1) % SIZE_MODE_CYCLE.length];
    set({ sizeMode: next });
  },
  setSizeMode: (mode) => set({ sizeMode: mode }),
}));
