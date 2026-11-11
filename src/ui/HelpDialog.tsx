'use client';

/**
 * Диалог краткой справки по интерфейсу — v0.01.02: путеводитель по порядку
 * работы, обозначения характеристик блока (C_блока, S, M, K, C_домена,
 * C_системы), цвета доверия и потоков, управление видом канвы и приёмы
 * самопроверки. Все строки — в словаре i18n (НФ-8).
 */

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ru } from '../i18n/ru';

function HelpSection({
  title,
  items,
  ordered = false,
}: {
  title: string;
  items: readonly string[];
  ordered?: boolean;
}) {
  const ListTag = ordered ? 'ol' : 'ul';
  return (
    <section>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <ListTag
        className={`mt-1.5 space-y-1 pl-4 text-[13px] leading-snug text-muted-foreground ${
          ordered ? 'list-decimal' : 'list-disc'
        } marker:text-muted-foreground/70`}
      >
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ListTag>
    </section>
  );
}

export function HelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="help-dialog" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{ru.help.title}</DialogTitle>
          <DialogDescription>{ru.help.subtitle}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-2">
          <HelpSection title={ru.help.workflowTitle} items={ru.help.workflow} ordered />
          <HelpSection title={ru.help.blockCharTitle} items={ru.help.blockChar} />
          <HelpSection title={ru.help.colorsTitle} items={ru.help.colors} />
          <HelpSection title={ru.help.viewTitle} items={ru.help.view} />
          <HelpSection title={ru.help.checkTitle} items={ru.help.check} />
        </div>
        <DialogFooter>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            data-testid="help-close"
            onClick={() => onOpenChange(false)}
          >
            {ru.help.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
