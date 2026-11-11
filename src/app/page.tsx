'use client';

/**
 * Единственный маршрут приложения — раздел 5.1 ТЗ.
 * Все вычисления выполняются на клиенте (8.2 ТЗ); после первой загрузки
 * страница полностью автономна (НФ-4).
 */

import { useEffect } from 'react';
import '@xyflow/react/dist/style.css';
import { ToolApp } from '@/ui/ToolApp';

export default function Page() {
  return <ToolApp />;
}
