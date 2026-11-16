'use client';

/**
 * Диалог логической группы (ЛГ) — v0.02.03, Ф-70: создание ЛГ из выбранных
 * ДБ (имя, цвет палитры П-15, при правом клике внутри рамки — вложенная ЛГ)
 * и переименование/перекраска существующей. Красный, жёлтый и зелёный
 * недоступны — зарезервированы под уровни доверия ДБ (П-15).
 * Диалог открывается событием skib-lg-dialog из канвы, тулбара «Правка»
 * и инспектора; монтируется в ToolApp по образцу диалога декомпозиции.
 */

import { useState } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import { useSkibStore } from '../store/projectStore';
import { ru } from '../i18n/ru';
import { LG_COLORS, LG_DEFAULT_COLOR, MAX_DOMAIN_GROUPS, MAX_LG_DEPTH } from '../engine/types';

/** Запрос открытия диалога (деталь события skib-lg-dialog). */
export interface LgDialogRequest {
  mode: 'create' | 'rename';
  memberIds?: string[];
  parentId?: string | null;
  groupId?: string;
}

/** Событие «открыть диалог ЛГ» (ToolApp слушает). */
export const LG_DIALOG_EVENT = 'skib-lg-dialog';

export function GroupDialog({
  request,
  onClose,
}: {
  request: LgDialogRequest | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  // Селектор без «?? []»: новый массив при каждом вызове ломает кэш снапшота.
  const groups = useSkibStore((s) => s.project.architecture.groups) ?? [];
  const [name, setName] = useState(() => {
    if (request?.mode === 'rename') {
      return groups.find((g) => g.id === request.groupId)?.name ?? '';
    }
    return '';
  });
  const [color, setColor] = useState(() => {
    if (request?.mode === 'rename') {
      return groups.find((g) => g.id === request.groupId)?.color ?? LG_DEFAULT_COLOR;
    }
    return LG_DEFAULT_COLOR;
  });

  if (!request) return null;

  const editing =
    request.mode === 'rename' ? groups.find((g) => g.id === request.groupId) : undefined;

  const apply = () => {
    const store = useSkibStore.getState();
    if (request.mode === 'rename') {
      if (!request.groupId) return;
      store.updateGroup(request.groupId, { name, color });
      onClose();
      return;
    }
    const memberIds = request.memberIds ?? [];
    const id = store.createGroup({ name, color, memberIds, parentId: request.parentId ?? null });
    if (id === null) {
      toast({
        title: ru.errors.lgFailed(MAX_DOMAIN_GROUPS, MAX_LG_DEPTH),
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: ru.lg.created(store.project.architecture.groups?.find((g) => g.id === id)?.name ?? '', memberIds.length),
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? ru.dialogs.groupRenameTitle : ru.dialogs.groupCreateTitle}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? ru.dialogs.groupRenameHint
              : ru.dialogs.groupCreateHint(request.memberIds?.length ?? 0)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="lg-name" className="text-xs">
              {ru.dialogs.groupName}
            </Label>
            <Input
              id="lg-name"
              className="mt-1 h-8"
              value={name}
              maxLength={60}
              placeholder={ru.lg.namePlaceholder}
              data-testid="lg-name-input"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') apply();
              }}
            />
          </div>
          <div>
            <Label className="text-xs">{ru.dialogs.groupColor}</Label>
            <div className="mt-1 flex flex-wrap gap-2" data-testid="lg-color-palette">
              {LG_COLORS.map((paletteColor) => (
                <button
                  key={paletteColor}
                  type="button"
                  className={`h-7 w-7 rounded-full border ${
                    color === paletteColor ? 'ring-2 ring-primary ring-offset-1' : 'border-black/20'
                  }`}
                  style={{ background: paletteColor }}
                  title={
                    paletteColor === LG_DEFAULT_COLOR
                      ? ru.dialogs.groupColorDefault
                      : ru.dialogs.groupColorSwatch
                  }
                  aria-label={ru.dialogs.groupColorSwatch}
                  aria-pressed={color === paletteColor}
                  data-testid={`lg-color-${paletteColor.slice(1).toLowerCase()}`}
                  onClick={() => setColor(paletteColor)}
                />
              ))}
            </div>
            <p className="mt-1.5 text-xs italic text-muted-foreground">
              {ru.dialogs.groupColorHint}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {ru.inspector.cancel}
          </Button>
          <Button onClick={apply} data-testid="lg-apply">
            {editing ? ru.dialogs.groupSave : ru.dialogs.groupCreate}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
