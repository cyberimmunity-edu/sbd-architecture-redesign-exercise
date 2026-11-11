'use client';

/**
 * Панель валидации — Ф-26/Ф-27: ошибки и предупреждения последней загрузки
 * в верхнем правом углу, с кодом, понятным текстом на русском языке
 * и, если применимо, номером строки файла.
 */

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, CircleX, Info, X } from 'lucide-react';
import { useSkibStore } from '../store/projectStore';
import { ru } from '../i18n/ru';

export function ValidationPanel() {
  const validation = useSkibStore((s) => s.validation);
  const setValidation = useSkibStore((s) => s.setValidation);

  if (!validation) return null;
  const { errors, warnings, file, context } = validation;
  if (errors.length === 0 && warnings.length === 0) return null;
  // Заголовки: импорт файла или проверка диаграммы кнопкой «Проверить» (v0.01.08).
  const isDiagram = context === 'diagram';
  const errorsTitle = isDiagram ? ru.validation.diagramErrorsTitle : ru.validation.errorsTitle;
  const warningsTitle = isDiagram
    ? ru.validation.diagramWarningsTitle
    : ru.validation.warningsTitle;

  return (
    <div
      className="absolute right-4 top-2 z-50 w-[420px] max-w-[calc(100%-2rem)] rounded-md border border-border bg-popover shadow-lg"
      role="alert"
      data-testid="validation-panel"
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold text-popover-foreground">
          {errors.length > 0 ? errorsTitle : warningsTitle}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 px-0"
          onClick={() => setValidation(null)}
          aria-label={ru.validation.close}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      {file && (
        <p className="px-3 pt-2 text-xs text-muted-foreground">{ru.validation.importFailed(file)}</p>
      )}
      <ScrollArea className="max-h-64">
        <ul className="space-y-1.5 p-3 text-xs">
          {errors.map((message, index) => (
            <li key={`e-${index}`} className="flex items-start gap-1.5 text-red-600 dark:text-red-400">
              <CircleX className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="font-mono font-semibold">{message.code}</span>
              <span>: {message.message}</span>
            </li>
          ))}
          {warnings.map((message, index) => (
            <li key={`w-${index}`} className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="font-mono font-semibold">{message.code}</span>
              <span>: {message.message}</span>
            </li>
          ))}
          {errors.length === 0 && warnings.length > 0 && (
            <li className="flex items-center gap-1.5 text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0" aria-hidden /> файл применён
            </li>
          )}
        </ul>
      </ScrollArea>
    </div>
  );
}
