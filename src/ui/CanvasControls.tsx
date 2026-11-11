'use client';

/**
 * Кнопки масштаба канвы — v0.01.03: «+», «−» и «Вместить всю диаграмму
 * на экран». Заменяют штатные Controls React Flow, иконки которых не
 * отображались: здесь иконки Lucide отрисовываются гарантированно
 * (так же, как во всех кнопках интерфейса). Панель — правый нижний угол;
 * мини-навигатор занимает левый нижний (см. Canvas.tsx).
 * Кнопки реагируют и на событие skib-fit-view — «вместить» вызывается
 * после автоматической раскладки.
 */

import { useEffect } from 'react';
import { Panel, useReactFlow } from '@xyflow/react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ru } from '../i18n/ru';

export function CanvasControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  // «Вместить» по событию канвы (например, после авто-раскладки).
  useEffect(() => {
    const handler = () => {
      void fitView({ padding: 0.12, duration: 320 });
    };
    window.addEventListener('skib-fit-view', handler);
    return () => window.removeEventListener('skib-fit-view', handler);
  }, [fitView]);

  const buttonClass = 'h-8 w-8 bg-popover/95 p-0 shadow-sm';

  return (
    <Panel
      position="bottom-right"
      className="flex flex-col gap-1 rounded-md border border-border bg-background/60 p-1 shadow-sm"
      data-testid="canvas-zoom"
    >
      <Button
        size="sm"
        variant="outline"
        className={buttonClass}
        data-testid="zoom-in"
        title={ru.canvas.zoomIn}
        aria-label={ru.canvas.zoomIn}
        onClick={() => void zoomIn({ duration: 160 })}
      >
        <Plus className="h-4 w-4" aria-hidden />
      </Button>
      <Button
        size="sm"
        variant="outline"
        className={buttonClass}
        data-testid="zoom-out"
        title={ru.canvas.zoomOut}
        aria-label={ru.canvas.zoomOut}
        onClick={() => void zoomOut({ duration: 160 })}
      >
        <Minus className="h-4 w-4" aria-hidden />
      </Button>
      <Button
        size="sm"
        variant="outline"
        className={buttonClass}
        data-testid="fit-view"
        title={ru.canvas.fitView}
        aria-label={ru.canvas.fitView}
        onClick={() => void fitView({ padding: 0.12, duration: 320 })}
      >
        <Maximize className="h-4 w-4" aria-hidden />
      </Button>
    </Panel>
  );
}
