'use client';

/**
 * Верхняя панель — зона раздела 5.1: загрузка файлов, меню примеров (две
 * системы 14.4 ТЗ v0.01.01), «+ Домен», «+ Внешняя система», переключатель
 * темы (тёмная по умолчанию), экспорт, сброс, отмена/возврат, индикатор
 * статуса валидации.
 */

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Boxes,
  CircleHelp,
  FileArchive,
  FileDown,
  FilePlus2,
  FolderOpen,
  Moon,
  Redo2,
  ShieldCheck,
  Sun,
  Undo2,
  Upload,
  Layers,
  AlertTriangle,
  CircleCheck,
  CircleX,
} from 'lucide-react';
import { ru } from '../i18n/ru';
import { APP_VERSION } from '../engine/types';
import { useSkibTheme } from './theme';

export type ValidationStatus = 'clean' | 'warnings' | 'errors';

export interface TopBarProps {
  onImportArchitecture: (file: File) => void;
  onImportSecurity: (file: File) => void;
  onImportPuml: (file: File) => void;
  onImportState: (file: File) => void;
  onDemo: (kind: 'robot' | 'vessel') => void;
  onAddDomain: () => void;
  onAddExternal: () => void;
  onExport: (kind: 'architecture' | 'puml' | 'state') => void;
  onReset: () => void;
  onUndo: () => void;
  onRedo: () => void;
  /** Открытие краткой справки по интерфейсу (v0.01.02). */
  onHelp: () => void;
  canUndo: boolean;
  canRedo: boolean;
  validationStatus: ValidationStatus;
}

export function TopBar(props: TopBarProps) {
  const appVersion =
    (process.env.NEXT_PUBLIC_APP_VERSION as string | undefined) ?? `v${APP_VERSION}`;
  const [theme, setTheme] = useSkibTheme();
  const archInput = useRef<HTMLInputElement>(null);
  const securityInput = useRef<HTMLInputElement>(null);
  const pumlInput = useRef<HTMLInputElement>(null);
  const stateInput = useRef<HTMLInputElement>(null);

  const fileHandler = (handler: (file: File) => void) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) handler(file);
      event.target.value = '';
    };

  const open = (ref: React.RefObject<HTMLInputElement | null>) => ref.current?.click();

  const validationChip =
    props.validationStatus === 'errors' ? (
      <span
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-white"
        style={{ backgroundColor: '#D32F2F' }}
        title={ru.topBar.validationErrors}
      >
        <CircleX className="h-3.5 w-3.5" /> {ru.topBar.validationErrors}
      </span>
    ) : props.validationStatus === 'warnings' ? (
      <span
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-white"
        style={{ backgroundColor: '#F9A825' }}
        title={ru.topBar.validationWarnings}
      >
        <AlertTriangle className="h-3.5 w-3.5" /> {ru.topBar.validationWarnings}
      </span>
    ) : (
      <span
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-white"
        style={{ backgroundColor: '#43A047' }}
        title={ru.topBar.validationClean}
      >
        <CircleCheck className="h-3.5 w-3.5" /> {ru.topBar.validationClean}
      </span>
    );

  return (
    <header className="flex h-12 shrink-0 items-center gap-1.5 overflow-x-auto whitespace-nowrap border-b border-border bg-card px-3 text-foreground" aria-label={ru.appTitle}>
      <div className="mr-2 flex items-center gap-1.5">
        <ShieldCheck className="h-5 w-5" aria-hidden />
        <span className="text-sm font-bold">{ru.appTitle}</span>
        <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">{appVersion}</span>
      </div>

      <input
        type="file"
        accept=".yaml,.yml"
        hidden
        ref={archInput}
        data-testid="file-architecture"
        aria-hidden
        onChange={fileHandler(props.onImportArchitecture)}
      />
      <input
        type="file"
        accept=".yaml,.yml"
        hidden
        ref={securityInput}
        data-testid="file-security"
        aria-hidden
        onChange={fileHandler(props.onImportSecurity)}
      />
      <input
        type="file"
        accept=".puml,.plantuml,.txt"
        hidden
        ref={pumlInput}
        data-testid="file-puml"
        aria-hidden
        onChange={fileHandler(props.onImportPuml)}
      />
      <input
        type="file"
        accept=".yaml,.yml"
        hidden
        ref={stateInput}
        data-testid="file-state"
        aria-hidden
        onChange={fileHandler(props.onImportState)}
      />

      <Button
        size="sm"
        variant="outline"
        className="h-8"
        data-testid="load-architecture"
        onClick={() => open(archInput)}
      >
        <Upload className="mr-1 h-3.5 w-3.5" /> {ru.topBar.loadArchitecture}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8"
        data-testid="load-puml"
        onClick={() => open(pumlInput)}
      >
        <Upload className="mr-1 h-3.5 w-3.5" /> {ru.topBar.loadPuml}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8"
        data-testid="load-security"
        onClick={() => open(securityInput)}
      >
        <Upload className="mr-1 h-3.5 w-3.5" /> {ru.topBar.loadSecurity}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8"
        data-testid="load-state"
        onClick={() => open(stateInput)}
      >
        <FolderOpen className="mr-1 h-3.5 w-3.5" /> {ru.topBar.openState}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-8" data-testid="demo-project">
            <Boxes className="mr-1 h-3.5 w-3.5" /> {ru.topBar.demoMenu}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem data-testid="demo-robot" onClick={() => props.onDemo('robot')}>
            {ru.topBar.demoRobot}
          </DropdownMenuItem>
          <DropdownMenuItem data-testid="demo-vessel" onClick={() => props.onDemo('vessel')}>
            {ru.topBar.demoVessel}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button size="sm" variant="outline" className="h-8" data-testid="add-domain" onClick={props.onAddDomain}>
        <Layers className="mr-1 h-3.5 w-3.5" /> {ru.topBar.addDomain}
      </Button>
      <Button size="sm" variant="outline" className="h-8" data-testid="add-external" onClick={props.onAddExternal}>
        <FilePlus2 className="mr-1 h-3.5 w-3.5" /> {ru.topBar.addExternal}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-8" data-testid="export-menu">
            <FileDown className="mr-1 h-3.5 w-3.5" /> {ru.topBar.export}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem data-testid="export-architecture" onClick={() => props.onExport('architecture')}>
            {ru.topBar.exportArchitecture}
          </DropdownMenuItem>
          <DropdownMenuItem data-testid="export-puml" onClick={() => props.onExport('puml')}>
            {ru.topBar.exportPuml}
          </DropdownMenuItem>
          <DropdownMenuItem data-testid="export-state" onClick={() => props.onExport('state')}>
            {ru.topBar.exportState}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="mx-1 h-6 w-px bg-border" aria-hidden />

      <Button
        size="sm"
        variant="outline"
        className="h-8 w-8 px-0"
        onClick={props.onUndo}
        disabled={!props.canUndo}
        data-testid="undo"
        title={`${ru.topBar.undo} (Ctrl+Z)`}
        aria-label={ru.topBar.undo}
      >
        <Undo2 className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 w-8 px-0"
        onClick={props.onRedo}
        disabled={!props.canRedo}
        data-testid="redo"
        title={`${ru.topBar.redo} (Ctrl+Y)`}
        aria-label={ru.topBar.redo}
      >
        <Redo2 className="h-3.5 w-3.5" />
      </Button>

      {/* Переключатель темы: тёмная по умолчанию (5.1 v0.01.01). */}
      <Button
        size="sm"
        variant="outline"
        className="h-8 w-8 px-0"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        data-testid="theme-toggle"
        title={theme === 'dark' ? ru.topBar.themeLight : ru.topBar.themeDark}
        aria-label={theme === 'dark' ? ru.topBar.themeLight : ru.topBar.themeDark}
      >
        {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
      </Button>

      <div className="ml-auto flex items-center gap-2 pl-2">
        {validationChip}
        {/* Кнопка справки по интерфейсу: порядок работы, S/M/K, самопроверка (v0.01.02). */}
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          data-testid="help-button"
          onClick={props.onHelp}
          title={ru.topBar.help}
          aria-label={ru.topBar.help}
          aria-haspopup="dialog"
        >
          <CircleHelp className="mr-1 h-3.5 w-3.5" /> {ru.topBar.help}
        </Button>
        <Button size="sm" variant="outline" className="h-8" data-testid="reset-project" onClick={props.onReset}>
          <FileArchive className="mr-1 h-3.5 w-3.5" /> {ru.topBar.reset}
        </Button>
      </div>
    </header>
  );
}
