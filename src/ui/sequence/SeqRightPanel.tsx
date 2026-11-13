'use client';

/**
 * Правая панель режима «Диаграммы последовательности» — Ф-40, Ф-41, Ф-48
 * ТЗ v0.02.01; Ф-67 (v0.02.01b). Три блока с регулируемыми высотами
 * (вертикальная группа с запоминанием «skib-lab-seq-right-v1»); ширина
 * панели — разделителем родительской группы:
 *
 * 1. «Набор доменов» — карточки всех доменов ДАП: внутренние с полным
 *    названием («01. Связь»), внешние с пометкой «внешняя»; горячий
 *    фильтр по подстроке (Ф-67). Перетаскивание карточки на канву
 *    создаёт линию жизни; домен, уже включённый в ДП, помечен «в ДП»
 *    и повторно не добавляется (П-12).
 * 2. «Инспектор» (П-10): карточка ДП без выбора; линия жизни (полное
 *    название, «внутренний/внешняя», «Убрать из ДП»); стрелка (номер,
 *    направление «A → B», подпись до 60 символов, блок с «Покинуть блок»,
 *    «Удалить стрелку»); группа/цикл (имя, палитра 8 цветов, число
 *    стрелок, «Разгруппировать», «Удалить блок со стрелками»); условный
 *    блок (условие, подписи веток, число стрелок каждой ветки, те же
 *    команды). Поля обновляются при смене выбранного объекта и
 *    применяются по Enter (v0.02.01b).
 * 3. «Валидация» — «Проверить ДП» и таблица результатов (6.2): секции
 *    «Расхождения связей» (E-601) и «Неиспользуемые домены» (W-008);
 *    кнопка «Добавить недостающие связи в ДАП» при наличии E-601 (Ф-50).
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CircleCheck, CircleX, LogOut, SearchCheck, Trash2, Unlink } from 'lucide-react';
import { useSkibStore } from '../../store/projectStore';
import { useViewStore } from '../../store/viewStore';
import { seqDndPayload } from './seqDnd';
import { validateSequencesRows } from '../../engine/sequence';
import type { SeqValidationRow } from '../../engine/sequence';
import { SEQ_BLOCK_COLORS, SEQ_TEXT_LIMIT } from '../../engine/types';
import { ru } from '../../i18n/ru';
import { useToast } from '@/hooks/use-toast';

export function SeqRightPanel() {
  return (
    <ResizablePanelGroup direction="vertical" autoSaveId="skib-lab-seq-right-v1" className="min-h-0 flex-1">
      {/* v0.02.02: доля «Набора доменов» увеличена (34 → 40) — при длинных
          названиях доменов список оставался в полоске в пару пикселей. */}
      <ResizablePanel defaultSize={40} minSize={8} className="flex flex-col">
        <DomainsPool />
      </ResizablePanel>
      <ResizableHandle
        className="h-1.5 transition-colors hover:bg-primary/40 data-[resize-handle-active=pointer]:bg-primary/60"
        aria-label={ru.canvas.resizeSummaryTitle}
        title={ru.canvas.resizeSummaryTitle}
      />
      <ResizablePanel defaultSize={38} minSize={8} className="flex flex-col">
        <SeqInspector />
      </ResizablePanel>
      <ResizableHandle
        className="h-1.5 transition-colors hover:bg-primary/40 data-[resize-handle-active=pointer]:bg-primary/60"
        aria-label={ru.canvas.resizeSummaryTitle}
        title={ru.canvas.resizeSummaryTitle}
      />
      <ResizablePanel defaultSize={28} minSize={6} className="flex flex-col">
        <SeqValidation />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

/* ------------------------------------------------------------------ */
/* Набор доменов (Ф-40, П-12; горячий фильтр — Ф-67 v0.02.01b)          */
/* ------------------------------------------------------------------ */

function DomainsPool() {
  const project = useSkibStore((s) => s.project);
  const activeSequenceId = useViewStore((s) => s.activeSequenceId);
  const [filter, setFilter] = useState('');
  const active = (project.sequences ?? []).find((s) => s.id === activeSequenceId) ?? null;
  const included = new Set(active?.lifelines ?? []);
  // Горячий фильтр (Ф-67): подстрока названия без учёта регистра.
  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? project.architecture.blocks.filter((b) => b.name.toLowerCase().includes(needle))
    : project.architecture.blocks;

  return (
    <div className="flex h-full flex-col" data-testid="seq-domains-pool">
      <div className="border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">{ru.seq.domainsTitle}</span>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={ru.seq.domainsFilterPlaceholder}
          className="mt-1.5 h-7 text-xs"
          data-testid="seq-domains-filter"
          aria-label={ru.seq.domainsFilterPlaceholder}
        />
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{ru.seq.domainsHint}</p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1 p-2">
          {project.architecture.blocks.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">{ru.seq.domainsEmpty}</p>
          )}
          {project.architecture.blocks.length > 0 && visible.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">{ru.seq.domainsFilterEmpty}</p>
          )}
          {visible.map((block) => {
            const isIncluded = included.has(block.id);
            return (
              <div
                key={block.id}
                draggable={!isIncluded}
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', `skib-domain:${block.id}`);
                  event.dataTransfer.effectAllowed = 'copy';
                  // Payload доступен канве до drop — индикатор места вставки (v0.02.02).
                  seqDndPayload.current = `skib-domain:${block.id}`;
                }}
                onDragEnd={() => {
                  seqDndPayload.current = null;
                }}
                className={`flex items-center justify-between gap-1 rounded-md border border-border px-2 py-1.5 text-xs ${
                  isIncluded ? 'opacity-45' : 'cursor-grab bg-card hover:bg-muted/60'
                }`}
                data-testid={`seq-domain-card-${block.id}`}
                data-in-sequence={isIncluded ? 'true' : 'false'}
                title={isIncluded ? ru.seq.inSequence : ru.seq.domainsHint}
              >
                <span className="min-w-0 flex-1 break-words leading-snug">{block.name}</span>
                {block.external ? (
                  <span className="ml-1 shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {ru.seq.externalBadge}
                  </span>
                ) : isIncluded ? (
                  <span className="ml-1 shrink-0 rounded bg-sky-400/15 px-1.5 py-0.5 text-[10px] text-sky-600 dark:text-sky-400">
                    {ru.seq.inSequence}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Инспектор (П-10)                                                    */
/* ------------------------------------------------------------------ */

function SeqInspector() {
  const project = useSkibStore((s) => s.project);
  const removeLifeline = useSkibStore((s) => s.removeLifeline);
  const updateSeqArrow = useSkibStore((s) => s.updateSeqArrow);
  const deleteSeqArrow = useSkibStore((s) => s.deleteSeqArrow);
  const updateSeqBlock = useSkibStore((s) => s.updateSeqBlock);
  const ungroupSeqBlock = useSkibStore((s) => s.ungroupSeqBlock);
  const leaveSeqBlock = useSkibStore((s) => s.leaveSeqBlock);
  const deleteSeqBlockWithArrows = useSkibStore((s) => s.deleteSeqBlockWithArrows);
  const renameSequence = useSkibStore((s) => s.renameSequence);
  const activeSequenceId = useViewStore((s) => s.activeSequenceId);
  const seqSelection = useViewStore((s) => s.seqSelection);
  const setSeqSelection = useViewStore((s) => s.setSeqSelection);
  const setSeqSelectedArrows = useViewStore((s) => s.setSeqSelectedArrows);
  const { toast } = useToast();

  const sequences = project.sequences ?? [];
  const active = sequences.find((s) => s.id === activeSequenceId) ?? null;
  const nameOf = (id: string) => project.architecture.blocks.find((b) => b.id === id)?.name ?? id;

  const [pendingBlockDelete, setPendingBlockDelete] = useState<string | null>(null);

  /** Применение правки текста по Enter (v0.02.01b): Enter приводит к
   *  потере фокуса — срабатывает onBlur с сохранением значения. */
  const enterApplies = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
  };

  if (!active) {
    return (
      <div className="flex h-full flex-col" data-testid="seq-inspector">
        <PanelTitle title={ru.seq.inspectorTitle} />
        <p className="px-3 py-4 text-xs text-muted-foreground">{ru.seq.noSequenceSelected}</p>
      </div>
    );
  }

  const blockOfArrow = (arrowId: string) =>
    active.blocks.find((b) => b.arrows.includes(arrowId)) ?? null;

  return (
    <div className="flex h-full flex-col" data-testid="seq-inspector">
      <PanelTitle title={ru.seq.inspectorTitle} />
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-3">
          {/* Карточка ДП (без выбора, П-10). */}
          {(seqSelection === null || seqSelection.kind === 'sequence') && (
            <div className="flex flex-col gap-2" data-testid="seq-inspector-sequence">
              <span className="text-xs font-semibold text-muted-foreground">{ru.seq.sequenceCard}</span>
              <label className="text-xs text-muted-foreground" htmlFor="seq-name-input">
                {ru.seq.seqName}
              </label>
              <Input
                key={active.id}
                id="seq-name-input"
                className="h-8 text-sm"
                data-testid="seq-name-input"
                defaultValue={active.name}
                maxLength={SEQ_TEXT_LIMIT}
                onBlur={(e) => renameSequence(active.id, e.target.value)}
                onKeyDown={enterApplies}
              />
              <p className="text-xs text-muted-foreground">
                {ru.seq.lifelinesArrows(active.lifelines.length, active.arrows.length)}
              </p>
            </div>
          )}

          {/* Линия жизни. */}
          {seqSelection?.kind === 'lifeline' && (
            <div className="flex flex-col gap-2" data-testid="seq-inspector-lifeline">
              <span className="text-xs font-semibold text-muted-foreground">{ru.seq.lifelineTitle}</span>
              <span className="text-sm font-medium">{nameOf(seqSelection.id)}</span>
              <span className="text-xs text-muted-foreground">
                {project.architecture.blocks.find((b) => b.id === seqSelection.id)?.external
                  ? ru.seq.externalBadge
                  : ru.canvas.domainLabel}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-auto min-h-8 justify-start whitespace-normal! px-2 py-1 text-left text-sm leading-snug wrap-anywhere"
                data-testid="seq-remove-lifeline"
                onClick={() => {
                  removeLifeline(active.id, seqSelection.id);
                  setSeqSelection(null);
                }}
              >
                <LogOut className="mr-1 h-3.5 w-3.5" /> {ru.seq.removeLifeline}
              </Button>
            </div>
          )}

          {/* Стрелка. */}
          {seqSelection?.kind === 'arrow' && (() => {
            const index = active.arrows.findIndex((a) => a.id === seqSelection.id);
            const arrow = active.arrows[index];
            if (!arrow) return null;
            const block = blockOfArrow(arrow.id);
            return (
              <div className="flex flex-col gap-2" data-testid="seq-inspector-arrow">
                <span className="text-xs font-semibold text-muted-foreground">{ru.seq.arrowTitle}</span>
                <span className="text-xs text-muted-foreground">
                  {ru.seq.arrowNumber}: {index + 1}
                </span>
                <span className="text-sm font-medium">
                  {nameOf(arrow.from)} → {nameOf(arrow.to)}
                </span>
                <label className="text-xs text-muted-foreground" htmlFor="seq-arrow-label">
                  {ru.seq.arrowLabel}
                </label>
                <Input
                  key={arrow.id}
                  id="seq-arrow-label"
                  className="h-8 text-sm"
                  data-testid="seq-arrow-label"
                  defaultValue={arrow.label ?? ''}
                  maxLength={SEQ_TEXT_LIMIT}
                  placeholder={ru.seq.arrowLabel}
                  onBlur={(e) => updateSeqArrow(active.id, arrow.id, e.target.value)}
                  onKeyDown={enterApplies}
                />
                {block && (
                  <div className="flex flex-col gap-1 rounded-md border border-border p-2">
                    <span className="text-xs text-muted-foreground">
                      {ru.seq.arrowBlock}: {block.name}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-auto min-h-7 justify-start whitespace-normal! px-2 py-1 text-left text-xs leading-snug wrap-anywhere"
                      data-testid="seq-leave-block"
                      onClick={() => {
                        // «Покинуть блок»: блок пересобирается без этой стрелки (5.4).
                        leaveSeqBlock(active.id, block.id, arrow.id);
                      }}
                    >
                      <Unlink className="mr-1 h-3 w-3" /> {ru.seq.leaveBlock}
                    </Button>
                  </div>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-auto min-h-8 justify-start whitespace-normal! px-2 py-1 text-left text-sm leading-snug wrap-anywhere text-red-600 dark:text-red-400"
                  data-testid="seq-delete-arrow"
                  onClick={() => {
                    deleteSeqArrow(active.id, arrow.id);
                    setSeqSelection(null);
                    setSeqSelectedArrows([]);
                  }}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> {ru.seq.deleteArrow}
                </Button>
              </div>
            );
          })()}

          {/* Блок: группа/цикл или условный блок. */}
          {seqSelection?.kind === 'block' && (() => {
            const block = active.blocks.find((b) => b.id === seqSelection.id);
            if (!block) return null;
            const elseIndex = block.elseFrom ? block.arrows.indexOf(block.elseFrom) : -1;
            const thenCount = elseIndex > 0 ? elseIndex : block.arrows.length;
            const elseCount = elseIndex > 0 ? block.arrows.length - elseIndex : 0;
            const isCond = block.kind === 'cond';
            return (
              <div className="flex flex-col gap-2" data-testid="seq-inspector-block">
                <span className="text-xs font-semibold text-muted-foreground">
                  {isCond ? ru.seq.cond : block.kind === 'loop' ? ru.seq.loop : ru.seq.group}
                </span>
                {isCond ? (
                  <>
                    <label className="text-xs text-muted-foreground" htmlFor="seq-block-name">
                      {ru.seq.blockCondition}
                    </label>
                    <Input
                      key={`cond-${block.id}`}
                      id="seq-block-name"
                      className="h-8 text-sm"
                      data-testid="seq-block-condition"
                      defaultValue={block.name}
                      maxLength={SEQ_TEXT_LIMIT}
                      onBlur={(e) => updateSeqBlock(active.id, block.id, { name: e.target.value })}
                      onKeyDown={enterApplies}
                    />
                    <label className="text-xs text-muted-foreground" htmlFor="seq-block-then">
                      {ru.seq.blockThenLabel}
                    </label>
                    <Input
                      key={`then-${block.id}`}
                      id="seq-block-then"
                      className="h-8 text-sm"
                      data-testid="seq-block-then-label"
                      defaultValue={block.thenLabel ?? ''}
                      maxLength={SEQ_TEXT_LIMIT}
                      onBlur={(e) => updateSeqBlock(active.id, block.id, { thenLabel: e.target.value })}
                      onKeyDown={enterApplies}
                    />
                    <label className="text-xs text-muted-foreground" htmlFor="seq-block-else">
                      {ru.seq.blockElseLabel}
                    </label>
                    <Input
                      key={`else-${block.id}`}
                      id="seq-block-else"
                      className="h-8 text-sm"
                      data-testid="seq-block-else-label"
                      defaultValue={block.elseLabel ?? ''}
                      maxLength={SEQ_TEXT_LIMIT}
                      onBlur={(e) => updateSeqBlock(active.id, block.id, { elseLabel: e.target.value })}
                      onKeyDown={enterApplies}
                    />
                    <p className="text-xs text-muted-foreground">
                      {ru.seq.blockThenCount(thenCount)} · {ru.seq.blockElseCount(elseCount)}
                    </p>
                  </>
                ) : (
                  <>
                    <label className="text-xs text-muted-foreground" htmlFor="seq-block-name">
                      {ru.seq.blockName}
                    </label>
                    <Input
                      key={`name-${block.id}`}
                      id="seq-block-name"
                      className="h-8 text-sm"
                      data-testid="seq-block-name"
                      defaultValue={block.name}
                      maxLength={SEQ_TEXT_LIMIT}
                      onBlur={(e) => updateSeqBlock(active.id, block.id, { name: e.target.value })}
                      onKeyDown={enterApplies}
                    />
                    <span className="text-xs text-muted-foreground">{ru.seq.blockColor}</span>
                    <div className="flex flex-wrap gap-1.5" data-testid="seq-block-colors">
                      {SEQ_BLOCK_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`h-6 w-6 rounded-full border-2 ${
                            block.color.toLowerCase() === color.toLowerCase()
                              ? 'border-foreground'
                              : 'border-transparent'
                          }`}
                          style={{ background: color }}
                          aria-label={color}
                          data-testid={`seq-block-color-${color}`}
                          onClick={() => updateSeqBlock(active.id, block.id, { color })}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{ru.seq.blockArrowsCount(block.arrows.length)}</p>
                  </>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-auto min-h-8 justify-start whitespace-normal! px-2 py-1 text-left text-sm leading-snug wrap-anywhere"
                  data-testid="seq-ungroup"
                  onClick={() => {
                    ungroupSeqBlock(active.id, block.id);
                    setSeqSelection(null);
                  }}
                >
                  <Unlink className="mr-1 h-3.5 w-3.5" /> {ru.seq.ungroup}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-auto min-h-8 justify-start whitespace-normal! px-2 py-1 text-left text-sm leading-snug wrap-anywhere text-red-600 dark:text-red-400"
                  data-testid="seq-delete-block"
                  onClick={() => setPendingBlockDelete(block.id)}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> {ru.seq.deleteBlock}
                </Button>
              </div>
            );
          })()}
        </div>
      </ScrollArea>

      <AlertDialog open={!!pendingBlockDelete} onOpenChange={(open) => !open && setPendingBlockDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ru.seq.confirmDeleteBlockTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const block = active.blocks.find((b) => b.id === pendingBlockDelete);
                return block ? ru.seq.confirmDeleteBlock(block.name, block.arrows.length) : '';
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{ru.dialogs.no}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingBlockDelete) deleteSeqBlockWithArrows(active.id, pendingBlockDelete);
                setPendingBlockDelete(null);
                setSeqSelection(null);
              }}
            >
              {ru.dialogs.yes}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Валидация (6.1–6.3)                                                 */
/* ------------------------------------------------------------------ */

function SeqValidation() {
  const project = useSkibStore((s) => s.project);
  const addMissingEdgesToDap = useSkibStore((s) => s.addMissingEdgesToDap);
  const { toast } = useToast();
  const [rows, setRows] = useState<SeqValidationRow[] | null>(null);

  const errors = rows?.filter((r) => r.code.startsWith('E-')) ?? [];
  const warnings = rows?.filter((r) => r.code === 'W-008') ?? [];

  const runCheck = () => {
    setRows(validateSequencesRows(project));
  };

  const applyFix = () => {
    const result = addMissingEdgesToDap();
    if (!result.ok) {
      toast({ title: result.error ?? 'Ошибка', variant: 'destructive' });
      return;
    }
    toast({ title: ru.seq.addMissingEdgesDone(result.added ?? 0) });
    // После применения валидация перезапускается автоматически (6.3).
    setRows(validateSequencesRows(useSkibStore.getState().project));
  };

  return (
    <div className="flex h-full flex-col" data-testid="seq-validation">
      {/* flex-wrap: при узкой панели «Проверить ДП» уходит под заголовок
          вместо обрезки (v0.02.02). */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">{ru.seq.validationTitle}</span>
        <Button size="sm" variant="outline" className="h-7" data-testid="seq-check" onClick={runCheck}>
          <SearchCheck className="mr-1 h-3.5 w-3.5" /> {ru.seq.checkSequences}
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2">
          {rows === null && (
            <p className="px-1 py-3 text-xs text-muted-foreground">
              Нажмите «Проверить ДП»: расхождения связей (E-601) и неиспользуемые домены (W-008)
            </p>
          )}
          {rows !== null && rows.length === 0 && (
            <p
              className="flex items-center gap-1.5 px-1 py-2 text-xs text-green-600 dark:text-green-400"
              data-testid="seq-validation-clean"
            >
              <CircleCheck className="h-3.5 w-3.5" /> {ru.seq.checkClean}
            </p>
          )}
          {errors.length > 0 && (
            <div className="mb-2">
              <p className="px-1 py-1 text-xs font-semibold text-muted-foreground">{ru.seq.sectionMismatches}</p>
              <table className="w-full text-left text-[11px]" data-testid="seq-validation-table">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="px-1 py-0.5 font-medium">{ru.seq.colCode}</th>
                    <th className="px-1 py-0.5 font-medium">{ru.seq.colDiagram}</th>
                    <th className="px-1 py-0.5 font-medium">{ru.seq.colArrow}</th>
                    <th className="px-1 py-0.5 font-medium">{ru.seq.colMessage}</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.map((row, index) => (
                    <tr key={`e-${index}`} className="align-top text-red-600 dark:text-red-400">
                      <td className="px-1 py-0.5 font-mono font-semibold">{row.code}</td>
                      <td className="px-1 py-0.5">{row.diagram}</td>
                      <td className="px-1 py-0.5">{row.arrow}</td>
                      <td className="px-1 py-0.5">{row.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {warnings.length > 0 && (
            <div className="mb-2">
              <p className="px-1 py-1 text-xs font-semibold text-muted-foreground">{ru.seq.sectionUnused}</p>
              <ul className="space-y-0.5">
                {warnings.map((row, index) => (
                  <li key={`w-${index}`} className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <CircleX className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                    <span className="font-mono font-semibold">{row.code}</span>
                    <span>: {row.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {errors.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="mt-1 h-8 w-full justify-center"
              data-testid="seq-add-missing-edges"
              onClick={applyFix}
            >
              {ru.seq.addMissingEdges}
            </Button>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/** Заголовок секции правой панели. */
function PanelTitle({ title }: { title: string }) {
  return (
    <div className="border-b border-border px-3 py-2">
      <span className="text-sm font-semibold">{title}</span>
    </div>
  );
}
