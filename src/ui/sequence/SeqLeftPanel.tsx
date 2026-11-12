'use client';

/**
 * Левая панель режима «Диаграммы последовательности» — Ф-39 ТЗ v0.02.01,
 * Ф-65…Ф-66 (v0.02.01b): список ДП (имя, счётчики «линий жизни/стрелок»),
 * выбор — переключение диаграмм; «Создать» (имя уникализируется) и
 * «Очистить ДП» с подтверждением (имя, счётчики линий жизни/стрелок/блоков);
 * «Удалить ДП» с подтверждением (имя и число стрелок); список целей
 * безопасности (ЦБ): перетаскивание ЦБ на канву — при отсутствии ДП
 * создаётся ДП с именем ЦБ и линиями жизни её критичных доменов, иначе
 * критичные домены добавляются в текущую ДП (можно набросить несколько
 * ЦБ, Ф-65); блок импорта/экспорта: «Импорт YAML» (sequences.yaml — все
 * ДП), «Импорт PlantUML» (одна ДП), «Экспорт YAML» (все ДП), «Экспорт
 * PlantUML» (выбранная ДП). Ширина панели регулируется разделителем.
 */

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import {
  Download,
  Eraser,
  FileDown,
  FileUp,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { useSkibStore } from '../../store/projectStore';
import { useViewStore } from '../../store/viewStore';
import { ru } from '../../i18n/ru';

export interface SeqLeftPanelProps {
  onImportYaml: (file: File) => void;
  onImportPuml: (file: File) => void;
  onExportYaml: () => void;
  onExportPuml: () => void;
}

export function SeqLeftPanel({ onImportYaml, onImportPuml, onExportYaml, onExportPuml }: SeqLeftPanelProps) {
  const project = useSkibStore((s) => s.project);
  const createSequence = useSkibStore((s) => s.createSequence);
  const deleteSequence = useSkibStore((s) => s.deleteSequence);
  const clearSequence = useSkibStore((s) => s.clearSequence);
  const activeSequenceId = useViewStore((s) => s.activeSequenceId);
  const setActiveSequence = useViewStore((s) => s.setActiveSequence);

  const sequences = project.sequences ?? [];
  const active = sequences.find((s) => s.id === activeSequenceId) ?? null;
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [pendingClear, setPendingClear] = useState<string | null>(null);
  const yamlInput = useRef<HTMLInputElement>(null);
  const pumlInput = useRef<HTMLInputElement>(null);

  const pending = pendingDelete ? sequences.find((s) => s.id === pendingDelete) : null;
  const clearing = pendingClear ? sequences.find((s) => s.id === pendingClear) : null;

  const fileHandler = (handler: (file: File) => void) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) handler(file);
      event.target.value = '';
    };

  return (
    <div className="flex h-full flex-col" data-testid="seq-left-panel">
      <div className="border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">{ru.seq.leftTitle}</span>
        <div className="mt-1.5 flex gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 flex-1"
            data-testid="seq-create"
            onClick={() => createSequence()}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> {ru.seq.createSequence}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 flex-1"
            data-testid="seq-clear"
            disabled={!active || (active.lifelines.length === 0 && active.arrows.length === 0 && active.blocks.length === 0)}
            onClick={() => active && setPendingClear(active.id)}
            title={ru.seq.clearSequence}
          >
            <Eraser className="mr-1 h-3.5 w-3.5" /> {ru.seq.clearSequence}
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1 p-2">
          {sequences.length === 0 && (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">{ru.seq.emptyList}</p>
          )}
          {sequences.map((seq) => {
            const isActive = seq.id === activeSequenceId;
            return (
              <div
                key={seq.id}
                className={`group flex items-center gap-1 rounded-md border px-2 py-1.5 ${
                  isActive ? 'border-sky-400 bg-sky-400/10' : 'border-transparent hover:bg-muted/50'
                }`}
                data-testid={`seq-item-${seq.id}`}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setActiveSequence(seq.id)}
                >
                  <span className="block truncate text-sm font-medium" title={seq.name}>
                    {seq.name}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {ru.seq.lifelinesArrows(seq.lifelines.length, seq.arrows.length)}
                  </span>
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 shrink-0 px-0 opacity-0 transition-opacity group-hover:opacity-100"
                  data-testid={`seq-delete-${seq.id}`}
                  aria-label={ru.seq.deleteSequence}
                  onClick={() => setPendingDelete(seq.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Список ЦБ (Ф-65): набрасывание на канву — ДП по имени ЦБ
          или пополнение линий жизни критичными доменами. */}
      <div className="flex min-h-[110px] flex-col border-t border-border" style={{ flexBasis: '34%' }}>
        <div className="px-3 pb-1 pt-2">
          <span className="text-sm font-semibold">{ru.seq.goalsTitle}</span>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{ru.seq.goalsHint}</p>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-1 p-2 pt-0">
            {project.security.goals.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">{ru.seq.goalsEmpty}</p>
            )}
            {project.security.goals.map((goal) => (
              <div
                key={goal.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', `skib-goal:${goal.id}`);
                  event.dataTransfer.effectAllowed = 'copy';
                }}
                className="cursor-grab rounded-md border border-border bg-card px-2 py-1.5 text-xs hover:bg-muted/60"
                data-testid={`seq-goal-card-${goal.id}`}
                title={goal.description ?? goal.name}
              >
                <span className="block truncate">{goal.name}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Блок импорта/экспорта (Ф-39, П-8). */}
      <div className="border-t border-border p-2">
        <div className="grid grid-cols-2 gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 justify-start px-2 text-xs"
            data-testid="seq-import-yaml"
            title={ru.seq.importYamlTitle}
            onClick={() => yamlInput.current?.click()}
          >
            <FileUp className="mr-1 h-3.5 w-3.5" /> {ru.seq.importYaml}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 justify-start px-2 text-xs"
            data-testid="seq-import-puml"
            title={ru.seq.importPumlTitle}
            onClick={() => pumlInput.current?.click()}
          >
            <Upload className="mr-1 h-3.5 w-3.5" /> {ru.seq.importPuml}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 justify-start px-2 text-xs"
            data-testid="seq-export-yaml"
            title={ru.seq.exportYamlTitle}
            onClick={onExportYaml}
          >
            <Download className="mr-1 h-3.5 w-3.5" /> {ru.seq.exportYaml}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 justify-start px-2 text-xs"
            data-testid="seq-export-puml"
            title={ru.seq.exportPumlTitle}
            onClick={onExportPuml}
          >
            <FileDown className="mr-1 h-3.5 w-3.5" /> {ru.seq.exportPuml}
          </Button>
        </div>
        <input
          type="file"
          accept=".yaml,.yml"
          hidden
          ref={yamlInput}
          data-testid="file-sequences"
          aria-hidden
          onChange={fileHandler(onImportYaml)}
        />
        <input
          type="file"
          accept=".puml,.plantuml,.txt"
          hidden
          ref={pumlInput}
          data-testid="file-seq-puml"
          aria-hidden
          onChange={fileHandler(onImportPuml)}
        />
      </div>

      {/* Подтверждение удаления ДП (Ф-39): имя и число стрелок. */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ru.seq.confirmDeleteSeqTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending ? ru.seq.confirmDeleteSeq(pending.name, pending.arrows.length) : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{ru.dialogs.no}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) deleteSequence(pendingDelete);
                setPendingDelete(null);
              }}
            >
              {ru.dialogs.yes}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Подтверждение очистки ДП (Ф-66): имя и счётчики содержимого. */}
      <AlertDialog open={!!pendingClear} onOpenChange={(open) => !open && setPendingClear(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ru.seq.clearSequenceTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {clearing
                ? ru.seq.confirmClearSeq(clearing.name, clearing.lifelines.length, clearing.arrows.length, clearing.blocks.length)
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{ru.dialogs.no}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingClear) clearSequence(pendingClear);
                setPendingClear(null);
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
