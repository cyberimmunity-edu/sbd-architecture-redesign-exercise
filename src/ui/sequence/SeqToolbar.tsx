'use client';

/**
 * Панель команд блоков ДП на канве — Ф-46, Ф-61 ТЗ v0.02.01: «Сгруппировать»,
 * «Цикл», «Условный блок» для выделенных стрелок (клик с Shift/Ctrl).
 * Команды активны только для подряд идущих стрелок (иначе — подсказка).
 * Условный блок создаётся в диалоге: условие, подписи веток «то»/«иначе»,
 * граница else — номер первой стрелки ветки «иначе»; обе ветки непусты
 * (П-14). Группа — первый свободный цвет палитры; имя «Группа N».
 */

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Braces, Infinity as InfinityIcon, Split } from 'lucide-react';
import { Panel } from '@xyflow/react';
import { useSkibStore } from '../../store/projectStore';
import { useViewStore } from '../../store/viewStore';
import { isConsecutive } from '../../engine/sequence';
import { ru } from '../../i18n/ru';
import { useToast } from '@/hooks/use-toast';

export function SeqToolbar() {
  const project = useSkibStore((s) => s.project);
  const createSeqBlock = useSkibStore((s) => s.createSeqBlock);
  const activeSequenceId = useViewStore((s) => s.activeSequenceId);
  const seqSelectedArrows = useViewStore((s) => s.seqSelectedArrows);
  const setSeqSelectedArrows = useViewStore((s) => s.setSeqSelectedArrows);
  const { toast } = useToast();
  const [condOpen, setCondOpen] = useState(false);

  const active = (project.sequences ?? []).find((s) => s.id === activeSequenceId) ?? null;
  const selected = useMemo(() => {
    if (!active) return [];
    // Порядок выделения — по порядку стрелок ДП.
    return active.arrows.filter((a) => seqSelectedArrows.includes(a.id)).map((a) => a.id);
  }, [active, seqSelectedArrows]);

  const consecutive = active ? isConsecutive(active, selected) : false;
  const disabled = !active || selected.length === 0;

  const guard = (): boolean => {
    if (!active || selected.length === 0) return false;
    if (!isConsecutive(active, selected)) {
      toast({ title: ru.seq.blockHintConsecutive, variant: 'destructive' });
      return false;
    }
    return true;
  };

  const create = (kind: 'group' | 'loop') => {
    if (!guard()) return;
    const result = createSeqBlock(active!.id, kind, selected);
    if (!result.ok) {
      toast({ title: result.error ?? 'Ошибка', variant: 'destructive' });
      return;
    }
    setSeqSelectedArrows([]);
  };

  return (
    <Panel position="top-center" className="pointer-events-auto">
      <div
        className="flex items-center gap-1 rounded-md border border-border bg-popover/95 p-1 shadow-sm"
        data-testid="seq-toolbar"
      >
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          data-testid="seq-toolbar-group"
          disabled={disabled}
          onClick={() => create('group')}
          title={selected.length > 0 && !consecutive ? ru.seq.blockHintConsecutive : ru.seq.group}
        >
          <Braces className="mr-1 h-3.5 w-3.5" /> {ru.seq.group}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          data-testid="seq-toolbar-loop"
          disabled={disabled}
          onClick={() => create('loop')}
          title={selected.length > 0 && !consecutive ? ru.seq.blockHintConsecutive : ru.seq.loop}
        >
          <InfinityIcon className="mr-1 h-3.5 w-3.5" /> {ru.seq.loop}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          data-testid="seq-toolbar-cond"
          disabled={disabled || selected.length < 2}
          onClick={() => {
            if (!guard()) return;
            if (selected.length < 2) return;
            setCondOpen(true);
          }}
          title={selected.length > 0 && !consecutive ? ru.seq.blockHintConsecutive : ru.seq.cond}
        >
          <Split className="mr-1 h-3.5 w-3.5" /> {ru.seq.cond}
        </Button>
        {active && selected.length > 0 && !consecutive && (
          <span className="px-1 text-[11px] text-amber-600 dark:text-amber-400">
            {ru.seq.blockHintConsecutive}
          </span>
        )}
      </div>
      {active && (
        <SeqCondDialog
          key={condOpen ? 'open' : 'closed'}
          open={condOpen}
          onOpenChange={setCondOpen}
          seqId={active.id}
          arrowIds={selected}
        />
      )}
    </Panel>
  );
}

interface SeqCondDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seqId: string;
  arrowIds: string[];
}

/** Диалог условного блока (Ф-46, П-14): обе ветки обязательны и непусты. */
function SeqCondDialog({ open, onOpenChange, seqId, arrowIds }: SeqCondDialogProps) {
  const createSeqBlock = useSkibStore((s) => s.createSeqBlock);
  const setSeqSelectedArrows = useViewStore((s) => s.setSeqSelectedArrows);
  const setSeqSelection = useViewStore((s) => s.setSeqSelection);
  const arrows = useSkibStore((s) => (s.project.sequences ?? []).find((x) => x.id === seqId)?.arrows);
  const { toast } = useToast();

  const [condition, setCondition] = useState('');
  const [thenLabel, setThenLabel] = useState('');
  const [elseLabel, setElseLabel] = useState('');
  // Граница else: номер первой стрелки ветки «иначе»; по умолчанию — вторая
  // выделенная стрелка (обе ветки непусты).
  const [elseIndex, setElseIndex] = useState('1');

  const numbers = useMemo(() => {
    if (!arrows) return [];
    return arrowIds.map((id) => ({
      id,
      number: arrows.findIndex((a) => a.id === id) + 1,
    }));
  }, [arrowIds, arrows]);

  const apply = () => {
    const result = createSeqBlock(seqId, 'cond', arrowIds, {
      name: condition,
      thenLabel,
      elseLabel,
      elseIndex: Number(elseIndex),
    });
    if (!result.ok) {
      toast({ title: result.error ?? 'Ошибка', variant: 'destructive' });
      return;
    }
    setSeqSelectedArrows([]);
    if (result.id) setSeqSelection({ kind: 'block', id: result.id });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="seq-cond-dialog">
        <DialogHeader>
          <DialogTitle>{ru.seq.condDialogTitle}</DialogTitle>
          <DialogDescription>
            {ru.seq.blockThenCount(Number(elseIndex))} · {ru.seq.blockElseCount(arrowIds.length - Number(elseIndex))}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="seq-cond-condition">{ru.seq.condDialogCondition}</Label>
            <Input
              id="seq-cond-condition"
              data-testid="seq-cond-condition"
              value={condition}
              maxLength={60}
              onChange={(e) => setCondition(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="seq-cond-then">{ru.seq.condDialogThen}</Label>
            <Input
              id="seq-cond-then"
              data-testid="seq-cond-then"
              value={thenLabel}
              maxLength={60}
              onChange={(e) => setThenLabel(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="seq-cond-else">{ru.seq.condDialogElse}</Label>
            <Input
              id="seq-cond-else"
              data-testid="seq-cond-else"
              value={elseLabel}
              maxLength={60}
              onChange={(e) => setElseLabel(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="seq-cond-else-from">{ru.seq.condDialogElseFrom}</Label>
            <Select value={elseIndex} onValueChange={setElseIndex}>
              <SelectTrigger id="seq-cond-else-from" data-testid="seq-cond-else-from" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {numbers.slice(1).map((n) => (
                  <SelectItem key={n.id} value={String(numbers.indexOf(n))}>
                    {n.number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {ru.dialogs.no}
          </Button>
          <Button data-testid="seq-cond-apply" onClick={apply}>
            {ru.seq.condDialogApply}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
