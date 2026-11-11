'use client';

/**
 * Компоновка окна — раздел 5.1 ТЗ v0.01.01: верхняя панель (48 px),
 * левая панель (пул карточек + цели безопасности), канва, правая панель
 * (инспектор + панель расчёта и статуса укрупнённым шрифтом). Ширины боковых
 * панелей раздвижные (v0.01.05): react-resizable-panels с запоминанием
 * ширин в localStorage (autoSaveId «skib-lab-panels-v1», диапазон 16–36 %).
 * Оркестрирует импорт/экспорт файлов, подтверждения замен (Ф-1, Ф-4, Ф-5,
 * Ф-23), горячие клавиши (НФ-10) и диалог декомпозиции (Ф-16).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useToast } from '@/hooks/use-toast';
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
import { useSkibStore } from '../store/projectStore';
import { MAX_FILE_SIZE } from '../engine/types';
import type { Architecture, Project, SecuritySpec } from '../engine/types';
import { frameBounds } from '../engine/trust';
import {
  parseArchitectureYaml,
  parseSecurityYaml,
  parseStateYaml,
  parsePlantUml,
  serializeArchitectureYaml,
  serializePuml,
  serializeStateYaml,
} from '../io';
import { DEMO_ARCHITECTURE_YAML as ROBOT_ARCH, DEMO_SECURITY_YAML as ROBOT_SECURITY } from '../samples/robot/content';
import { DEMO_ARCHITECTURE_YAML as VESSEL_ARCH, DEMO_SECURITY_YAML as VESSEL_SECURITY } from '../samples/vessel/content';
import { TopBar, type ValidationStatus } from './TopBar';
import { PoolPanel } from './PoolPanel';
import { GoalsPanel } from './GoalsPanel';
import { Canvas } from './Canvas';
import { InspectorPanel } from './InspectorPanel';
import { SummaryPanel } from './SummaryPanel';
import { DvbPanel } from './DvbPanel';
import { DecomposeDialog } from './DecomposeDialog';
import { ValidationPanel } from './ValidationPanel';
import { HelpDialog } from './HelpDialog';
import { ru } from '../i18n/ru';

type DemoKind = 'robot' | 'vessel';

type PendingAction =
  | { kind: 'architecture'; model: Architecture; warnings: import('../engine/types').ImportMessage[]; file: string }
  | { kind: 'state'; project: Project; warnings: import('../engine/types').ImportMessage[]; file: string }
  | { kind: 'demo'; demo: DemoKind }
  | { kind: 'reset' };

/** Демо-комплекты примеров 14.4 ТЗ v0.01.01. */
const DEMOS: Record<DemoKind, { architecture: string; security: string }> = {
  robot: { architecture: ROBOT_ARCH, security: ROBOT_SECURITY },
  vessel: { architecture: VESSEL_ARCH, security: VESSEL_SECURITY },
};

export function ToolApp() {
  const hydrate = useSkibStore((s) => s.hydrate);
  const hydrated = useSkibStore((s) => s.hydrated);
  const project = useSkibStore((s) => s.project);
  const past = useSkibStore((s) => s.past);
  const future = useSkibStore((s) => s.future);
  const validation = useSkibStore((s) => s.validation);
  const loadArchitecture = useSkibStore((s) => s.loadArchitecture);
  const loadSecurity = useSkibStore((s) => s.loadSecurity);
  const loadState = useSkibStore((s) => s.loadState);
  const addDomain = useSkibStore((s) => s.addDomain);
  const addExternalDomain = useSkibStore((s) => s.addExternalDomain);
  const resetProject = useSkibStore((s) => s.resetProject);
  const undo = useSkibStore((s) => s.undo);
  const redo = useSkibStore((s) => s.redo);
  const setValidation = useSkibStore((s) => s.setValidation);
  const { toast } = useToast();

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [decomposeBlockId, setDecomposeBlockId] = useState<string | null>(null);
  // Диалог краткой справки по интерфейсу (v0.01.02).
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Диалог декомпозиции открывается кнопкой на узле канвы (Ф-12).
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail) setDecomposeBlockId(detail);
    };
    window.addEventListener('skib-decompose', handler);
    return () => window.removeEventListener('skib-decompose', handler);
  }, []);

  // Горячие клавиши: Ctrl+Z — отмена, Ctrl+Y — повтор (НФ-10).
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      event.preventDefault();
      if (key === 'z') undo();
      else redo();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  const isEmpty = project.architecture.blocks.length === 0 && project.security.functions.length === 0;
  const hasEdits = project.assignments.length > 0 || past.length > 0;

  const validationStatus: ValidationStatus = useMemo(() => {
    if (!validation) return 'clean';
    if (validation.errors.length > 0) return 'errors';
    if (validation.warnings.length > 0) return 'warnings';
    return 'clean';
  }, [validation]);

  /** Скачивание файла средствами браузера (Ф-24). */
  const download = useCallback((name: string, content: string) => {
    const blob = new Blob([content], { type: 'text/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const readText = useCallback(async (file: File): Promise<string | null> => {
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: ru.errors.fileTooLarge('5 МБ'), variant: 'destructive' });
      return null;
    }
    return await file.text();
  }, [toast]);

  const handleImportArchitecture = useCallback(
    async (file: File) => {
      const text = await readText(file);
      if (text === null) return;
      const result = parseArchitectureYaml(text);
      if (result.errors.length > 0) {
        setValidation({ errors: result.errors, warnings: result.warnings, file: file.name });
        return;
      }
      if (isEmpty || !hasEdits) {
        loadArchitecture(result.model!, file.name);
        setValidation({ errors: [], warnings: result.warnings, file: file.name });
      } else {
        setPending({ kind: 'architecture', model: result.model!, warnings: result.warnings, file: file.name });
      }
    },
    [hasEdits, isEmpty, loadArchitecture, readText, setValidation],
  );

  const handleImportPuml = useCallback(
    async (file: File) => {
      const text = await readText(file);
      if (text === null) return;
      const result = parsePlantUml(text);
      if (result.errors.length > 0) {
        setValidation({ errors: result.errors, warnings: result.warnings, file: file.name });
        return;
      }
      if (isEmpty || !hasEdits) {
        loadArchitecture(result.model!, file.name);
        setValidation({ errors: [], warnings: result.warnings, file: file.name });
      } else {
        setPending({ kind: 'architecture', model: result.model!, warnings: result.warnings, file: file.name });
      }
    },
    [hasEdits, isEmpty, loadArchitecture, readText, setValidation],
  );

  /** Ф-2: загрузка security.yaml без подтверждения, совместимые размещения сохраняются. */
  const handleImportSecurity = useCallback(
    async (file: File) => {
      const text = await readText(file);
      if (text === null) return;
      const result = parseSecurityYaml(text);
      if (result.errors.length > 0) {
        setValidation({ errors: result.errors, warnings: result.warnings, file: file.name });
        return;
      }
      loadSecurity(result.model!, file.name);
      setValidation({ errors: [], warnings: result.warnings, file: file.name });
    },
    [loadSecurity, readText, setValidation],
  );

  const handleImportState = useCallback(
    async (file: File) => {
      const text = await readText(file);
      if (text === null) return;
      const result = parseStateYaml(text);
      if (result.errors.length > 0) {
        setValidation({ errors: result.errors, warnings: result.warnings, file: file.name });
        return;
      }
      // Ф-4/Ф-25: замена выполняется целиком после подтверждения.
      if (isEmpty) {
        loadState(result.model!);
        setValidation({ errors: [], warnings: result.warnings, file: file.name });
      } else {
        setPending({ kind: 'state', project: result.model!, warnings: result.warnings, file: file.name });
      }
    },
    [isEmpty, loadState, readText, setValidation],
  );

  /** Ф-5: демо-проект одной командой; без подтверждения, если проект пуст. */
  const loadDemoProject = useCallback(
    (kind: DemoKind) => {
      const demo = DEMOS[kind];
      const arch = parseArchitectureYaml(demo.architecture);
      const security = parseSecurityYaml(demo.security);
      if (arch.errors.length > 0 || security.errors.length > 0) {
        // Демо-комплект встроен и валиден; ветка недостижима, но безопасна.
        setValidation({
          errors: [...arch.errors, ...security.errors],
          warnings: [],
          file: kind,
        });
        return;
      }
      loadState({
        architecture: arch.model!,
        security: security.model!,
        assignments: [],
        meta: { source: kind === 'robot' ? ru.topBar.demoRobot : ru.topBar.demoVessel },
      });
      setValidation({ errors: [], warnings: [...arch.warnings, ...security.warnings] });
    },
    [loadState, setValidation],
  );

  const handleDemo = useCallback(
    (kind: DemoKind) => {
      if (isEmpty) {
        loadDemoProject(kind);
      } else {
        setPending({ kind: 'demo', demo: kind });
      }
    },
    [isEmpty, loadDemoProject],
  );

  /** «+ Внешняя система»: позиция по умолчанию — справа за рамкой периметра (3.5). */
  const handleAddExternal = useCallback(() => {
    const frame = frameBounds(useSkibStore.getState().project.architecture);
    const position = frame
      ? { x: frame.x + frame.width + 80, y: frame.y + 40 }
      : { x: 200, y: 160 };
    addExternalDomain(position);
  }, [addExternalDomain]);

  const handleExport = useCallback(
    (kind: 'architecture' | 'puml' | 'state') => {
      if (kind === 'architecture') {
        download('architecture.yaml', serializeArchitectureYaml(project.architecture));
      } else if (kind === 'puml') {
        download('architecture.puml', serializePuml(project.architecture));
      } else {
        download(
          'state.yaml',
          serializeStateYaml({
            ...project,
            meta: { ...project.meta, savedAt: new Date().toISOString() },
          }),
        );
      }
    },
    [download, project],
  );

  const handleReset = useCallback(() => {
    if (isEmpty) {
      resetProject();
    } else {
      setPending({ kind: 'reset' });
    }
  }, [isEmpty, resetProject]);

  const confirmPending = useCallback(() => {
    if (!pending) return;
    if (pending.kind === 'architecture') {
      loadArchitecture(pending.model, pending.file);
      setValidation({ errors: [], warnings: pending.warnings, file: pending.file });
    } else if (pending.kind === 'state') {
      loadState(pending.project);
      setValidation({ errors: [], warnings: pending.warnings, file: pending.file });
    } else if (pending.kind === 'demo') {
      loadDemoProject(pending.demo);
    } else if (pending.kind === 'reset') {
      resetProject();
    }
    setPending(null);
  }, [loadArchitecture, loadState, loadDemoProject, pending, resetProject, setValidation]);

  const pendingMessage = useMemo(() => {
    if (!pending) return '';
    if (pending.kind === 'architecture') return ru.dialogs.confirmReplaceArchitecture;
    if (pending.kind === 'state') return ru.dialogs.confirmReplaceState;
    if (pending.kind === 'demo') {
      return pending.demo === 'robot' ? ru.dialogs.confirmDemoRobot : ru.dialogs.confirmDemoVessel;
    }
    return ru.dialogs.confirmReset;
  }, [pending]);

  const pendingTitle = useMemo(() => {
    if (!pending) return '';
    if (pending.kind === 'architecture') return ru.dialogs.confirmReplaceTitle;
    if (pending.kind === 'state') return ru.dialogs.confirmStateTitle;
    if (pending.kind === 'demo') return ru.dialogs.confirmDemoTitle;
    return ru.dialogs.confirmResetTitle;
  }, [pending]);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground" style={{ minWidth: 1280 }}>
      <TopBar
        onImportArchitecture={handleImportArchitecture}
        onImportSecurity={handleImportSecurity}
        onImportPuml={handleImportPuml}
        onImportState={handleImportState}
        onDemo={handleDemo}
        onAddDomain={() => addDomain({ x: 200, y: 160 })}
        onAddExternal={handleAddExternal}
        onExport={handleExport}
        onReset={handleReset}
        onUndo={undo}
        onRedo={redo}
        onHelp={() => setHelpOpen(true)}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        validationStatus={validationStatus}
      />
      {/* Раздвижные панели (v0.01.05): ширину боковых панелей можно менять
          перетаскиванием разделителя — текст карточек и целей помещается
          целиком; ширины запоминаются в localStorage (autoSaveId). */}
      <ResizablePanelGroup
        direction="horizontal"
        autoSaveId="skib-lab-panels-v1"
        className="min-h-0 flex-1"
      >
        {/* Левая панель: пул карточек + цели безопасности (5.1 v0.01.01). */}
        <ResizablePanel
          defaultSize={22}
          minSize={16}
          maxSize={36}
          className="flex flex-col border-r border-border bg-card"
        >
          <PoolPanel />
          <GoalsPanel />
        </ResizablePanel>
        <ResizableHandle
          className="w-1.5 transition-colors hover:bg-primary/40 data-[resize-handle-active=pointer]:bg-primary/60"
          aria-label={ru.canvas.resizeLeftTitle}
          title={ru.canvas.resizeLeftTitle}
        />
        <ResizablePanel defaultSize={54} minSize={28}>
          <div className="relative flex h-full w-full">
            <ValidationPanel />
            <Canvas />
          </div>
        </ResizablePanel>
        <ResizableHandle
          className="w-1.5 transition-colors hover:bg-primary/40 data-[resize-handle-active=pointer]:bg-primary/60"
          aria-label={ru.canvas.resizeRightTitle}
          title={ru.canvas.resizeRightTitle}
        />
        {/* Правая панель: инспектор + расчёт и статус системы + расширенный
            анализ ДВБ (5.1 v0.01.01, v0.01.03). */}
        <ResizablePanel
          defaultSize={24}
          minSize={16}
          maxSize={36}
          className="flex flex-col border-l border-border bg-card"
        >
          <InspectorPanel />
          <SummaryPanel />
          <DvbPanel />
        </ResizablePanel>
      </ResizablePanelGroup>
      <DecomposeDialog
        key={decomposeBlockId ?? 'closed'}
        blockId={decomposeBlockId}
        onClose={() => setDecomposeBlockId(null)}
      />
      {/* Краткая справка по интерфейсу (v0.01.02). */}
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />

      <AlertDialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingTitle}</AlertDialogTitle>
            <AlertDialogDescription>{pendingMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{ru.dialogs.no}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPending}>{ru.dialogs.yes}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
