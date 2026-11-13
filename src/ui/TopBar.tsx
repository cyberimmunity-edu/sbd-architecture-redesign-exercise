'use client';

/**
 * Верхняя зона тулбаров — раздел 5.1 ТЗ; тулбары v0.02.02.
 *
 * Пять перетаскиваемых групп (тулбаров): «Правка» (отменить/восстановить,
 * + Домен, + Внешняя система), «Режим» (переключатель ДАП/ДП, «Цвета из
 * ДАП»), «Файлы и примеры» (загрузка архитектуры/PlantUML/целей/состояния,
 * примеры, экспорт, сброс проекта), «Валидация» («Проверить», индикатор
 * статуса), «Настройки» (тема, автоскрытие тулбаров, автоскрытие боковых
 * панелей, «Только значки», справка). Тулбары переносятся на несколько
 * строк при сужении окна; порядок меняется перетаскиванием за рукоятку
 * (dnd-kit), раскладка и скрытие групп сохраняются в localStorage
 * (skib-appearance-v1). Скрыть/показать тулбары: правый клик по зоне или
 * кнопка с тремя горизонтальными линиями (≡) справа.
 *
 * Настройки оформления (v0.02.02): тема (тёмная по умолчанию, 5.1 v0.01.01);
 * «Скрывать тулбары автоматически» — верхняя зона сворачивается в тонкую
 * полоску и разворачивается при наведении, максимизируя поле редактирования;
 * «Автоскрытие панелей» — боковые панели сворачиваются в рейки;
 * «Только значки» — подписи кнопок скрыты, название кнопки показывается
 * во всплывающей подсказке при наведении.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertTriangle,
  Boxes,
  CircleCheck,
  CircleHelp,
  CircleX,
  Eye,
  EyeOff,
  FileArchive,
  FileDown,
  FilePlus2,
  FolderOpen,
  GripVertical,
  Layers,
  Menu,
  MessagesSquare,
  Moon,
  PanelLeft,
  PanelLeftClose,
  PanelTop,
  PanelTopClose,
  Redo2,
  SearchCheck,
  ShieldCheck,
  Sun,
  Undo2,
  Upload,
  Workflow,
  Palette,
  type LucideIcon,
} from 'lucide-react';
import { ru } from '../i18n/ru';
import { APP_VERSION } from '../engine/types';
import { useSkibTheme } from './theme';
import { useAppearanceStore, type ToolbarId } from '../store/appearanceStore';

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
  /** Проверка диаграммы: трассировка «цель → функция → домен» (v0.01.08). */
  onCheckDiagram: () => void;
  onUndo: () => void;
  onRedo: () => void;
  /** Открытие краткой справки по интерфейсу (v0.01.02). */
  onHelp: () => void;
  canUndo: boolean;
  canRedo: boolean;
  validationStatus: ValidationStatus;
  /** Переключатель режимов и опция «Цвета из ДАП» (v0.02.01, Ф-37, Ф-59). */
  mode: 'architecture' | 'sequence';
  onModeChange: (mode: 'architecture' | 'sequence') => void;
  seqColorsFromDap: boolean;
  onToggleSeqColors: () => void;
}

const TOOLBAR_IDS: ToolbarId[] = ['edit', 'mode', 'io', 'validate', 'settings'];

/* ------------------------------------------------------------------ */
/* Кнопка тулбара: подпись скрывается в режиме «Только значки»         */
/* ------------------------------------------------------------------ */

interface TbButtonProps extends Omit<React.ComponentProps<typeof Button>, 'children'> {
  icon: LucideIcon;
  label: string;
  iconOnly: boolean;
  /** Подсказка, отличная от подписи (например, состояние переключателя). */
  hint?: string;
}

function TbButton({ icon: Icon, label, iconOnly, hint, ...rest }: TbButtonProps) {
  return (
    <Button
      size="sm"
      variant="outline"
      className={iconOnly ? 'h-8 w-8 shrink-0 px-0' : 'h-8 shrink-0 whitespace-nowrap'}
      title={hint ?? label}
      aria-label={label}
      {...rest}
    >
      <Icon className="h-3.5 w-3.5" />
      {!iconOnly && <span className="ml-1">{label}</span>}
    </Button>
  );
}

/* ------------------------------------------------------------------ */
/* Перетаскиваемый тулбар                                              */
/* ------------------------------------------------------------------ */

function SortableToolbar({ id, title, iconOnly, children }: {
  id: ToolbarId;
  title: string;
  iconOnly: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 40 : undefined }}
      className={`group flex max-w-full flex-wrap items-center gap-1 rounded-md border px-1 py-0.5 ${
        isDragging ? 'border-primary/60 bg-card shadow-lg' : 'border-transparent hover:border-border'
      }`}
      data-testid={`toolbar-${id}`}
      aria-label={title}
    >
      <button
        type="button"
        className="-ml-0.5 flex h-6 w-4 cursor-grab touch-none items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        aria-label={`${ru.topBar.toolbarsGripTitle} — ${title}`}
        title={ru.topBar.toolbarsGripTitle}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {children}
      {iconOnly && <span className="sr-only">{title}</span>}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Верхняя зона тулбаров                                               */
/* ------------------------------------------------------------------ */

export function TopBar(props: TopBarProps) {
  const appVersion =
    (process.env.NEXT_PUBLIC_APP_VERSION as string | undefined) ?? `v${APP_VERSION}`;
  const [theme, setTheme] = useSkibTheme();
  const iconOnly = useAppearanceStore((s) => s.iconOnly);
  const autoHideToolbars = useAppearanceStore((s) => s.autoHideToolbars);
  const toolbarOrder = useAppearanceStore((s) => s.toolbarOrder);
  const toolbarHidden = useAppearanceStore((s) => s.toolbarHidden);
  const toggleToolbar = useAppearanceStore((s) => s.toggleToolbar);
  const showAllToolbars = useAppearanceStore((s) => s.showAllToolbars);
  const resetLayout = useAppearanceStore((s) => s.resetLayout);
  const setToolbarOrder = useAppearanceStore((s) => s.setToolbarOrder);
  const toggleIconOnly = useAppearanceStore((s) => s.toggleIconOnly);
  const toggleAutoHideToolbars = useAppearanceStore((s) => s.toggleAutoHideToolbars);
  const toggleAutoHidePanels = useAppearanceStore((s) => s.toggleAutoHidePanels);
  const autoHidePanels = useAppearanceStore((s) => s.autoHidePanels);

  // Автоскрытие верхней зоны (v0.02.02): без наведения — полоска 12 px.
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const expanded = !autoHideToolbars || hoverExpanded;

  const archInput = useRef<HTMLInputElement>(null);
  const securityInput = useRef<HTMLInputElement>(null);
  const pumlInput = useRef<HTMLInputElement>(null);
  const stateInput = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fileHandler = (handler: (file: File) => void) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) handler(file);
      event.target.value = '';
    };

  const open = (ref: React.RefObject<HTMLInputElement | null>) => ref.current?.click();

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const from = toolbarOrder.indexOf(active.id as ToolbarId);
      const to = toolbarOrder.indexOf(over.id as ToolbarId);
      if (from < 0 || to < 0) return;
      setToolbarOrder(arrayMove(toolbarOrder, from, to));
    },
    [setToolbarOrder, toolbarOrder],
  );

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

  /* Содержимое тулбаров (v0.02.02): наборы из задания на доработку. */
  const toolbarContent: Record<ToolbarId, React.ReactNode> = useMemo(() => ({
    /* «Правка»: отменить/восстановить; рядом — создание доменов ДАП
       (в режиме ДП отключены, 5.1 v0.02.01). */
    edit: (
      <>
        <Button
          size="sm"
          variant="outline"
          className="h-8 w-8 shrink-0 px-0"
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
          className="h-8 w-8 shrink-0 px-0"
          onClick={props.onRedo}
          disabled={!props.canRedo}
          data-testid="redo"
          title={`${ru.topBar.redo} (Ctrl+Y)`}
          aria-label={ru.topBar.redo}
        >
          <Redo2 className="h-3.5 w-3.5" />
        </Button>
        <div className="mx-0.5 h-6 w-px shrink-0 bg-border" aria-hidden />
        <TbButton
          icon={Layers}
          label={ru.topBar.addDomain}
          iconOnly={iconOnly}
          data-testid="add-domain"
          onClick={props.onAddDomain}
          disabled={props.mode === 'sequence'}
          hint={props.mode === 'sequence' ? ru.seq.disabledDapButtonsTitle : undefined}
        />
        <TbButton
          icon={FilePlus2}
          label={ru.topBar.addExternal}
          iconOnly={iconOnly}
          data-testid="add-external"
          onClick={props.onAddExternal}
          disabled={props.mode === 'sequence'}
          hint={props.mode === 'sequence' ? ru.seq.disabledDapButtonsTitle : undefined}
        />
      </>
    ),
    /* «Режим»: переключатель ДАП/ДП (Ф-37) и «Цвета из ДАП» (Ф-59, только в ДП). */
    mode: (
      <>
        <div
          className="flex max-w-full flex-wrap items-center rounded-md border border-border p-0.5"
          role="group"
          aria-label={ru.seq.modeSequence}
        >
          <Button
            size="sm"
            variant={props.mode === 'architecture' ? 'secondary' : 'ghost'}
            className={`h-7 shrink-0 whitespace-nowrap ${props.mode === 'architecture' ? 'bg-primary/15 ring-1 ring-primary/40' : ''}`}
            data-testid="mode-architecture"
            onClick={() => props.onModeChange('architecture')}
            aria-label={ru.seq.modeArchitecture}
          >
            <Workflow className="h-3.5 w-3.5" />
            {!iconOnly && <span className="ml-1">{ru.seq.modeArchitecture}</span>}
          </Button>
          <Button
            size="sm"
            variant={props.mode === 'sequence' ? 'secondary' : 'ghost'}
            className={`h-7 shrink-0 whitespace-nowrap ${props.mode === 'sequence' ? 'bg-primary/15 ring-1 ring-primary/40' : ''}`}
            data-testid="mode-sequence"
            onClick={() => props.onModeChange('sequence')}
            aria-label={ru.seq.modeSequence}
          >
            <MessagesSquare className="h-3.5 w-3.5" />
            {!iconOnly && <span className="ml-1">{ru.seq.modeSequence}</span>}
          </Button>
        </div>
        {props.mode === 'sequence' && (
          <Button
            size="sm"
            variant={props.seqColorsFromDap ? 'secondary' : 'outline'}
            className={`h-8 shrink-0 whitespace-nowrap ${props.seqColorsFromDap ? 'bg-primary/15 ring-1 ring-primary/40' : ''}`}
            data-testid="seq-colors-toggle"
            onClick={props.onToggleSeqColors}
            title={ru.seq.colorsFromDapTitle}
          >
            <Palette className="h-3.5 w-3.5" />
            {!iconOnly && <span className="ml-1">{ru.seq.colorsFromDap}</span>}
          </Button>
        )}
      </>
    ),
    /* «Файлы и примеры»: импорт (4 формата), примеры, экспорт, сброс проекта. */
    io: (
      <>
        <TbButton
          icon={Upload}
          label={ru.topBar.loadArchitecture}
          iconOnly={iconOnly}
          data-testid="load-architecture"
          onClick={() => open(archInput)}
        />
        <TbButton
          icon={Upload}
          label={ru.topBar.loadPuml}
          iconOnly={iconOnly}
          data-testid="load-puml"
          onClick={() => open(pumlInput)}
        />
        <TbButton
          icon={Upload}
          label={ru.topBar.loadSecurity}
          iconOnly={iconOnly}
          data-testid="load-security"
          onClick={() => open(securityInput)}
        />
        <TbButton
          icon={FolderOpen}
          label={ru.topBar.openState}
          iconOnly={iconOnly}
          data-testid="load-state"
          onClick={() => open(stateInput)}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TbButton icon={Boxes} label={ru.topBar.demoMenu} iconOnly={iconOnly} data-testid="demo-project" />
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TbButton icon={FileDown} label={ru.topBar.export} iconOnly={iconOnly} data-testid="export-menu" />
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
        <TbButton
          icon={FileArchive}
          label={ru.topBar.reset}
          iconOnly={iconOnly}
          data-testid="reset-project"
          onClick={props.onReset}
        />
      </>
    ),
    /* «Валидация»: «Проверить» и индикатор статуса валидации. */
    validate: (
      <>
        <TbButton
          icon={SearchCheck}
          label={ru.topBar.checkDiagram}
          iconOnly={iconOnly}
          hint={ru.topBar.checkDiagramTitle}
          data-testid="check-diagram"
          onClick={props.onCheckDiagram}
        />
        {validationChip}
      </>
    ),
    /* «Настройки»: тема, автоскрытие тулбаров, автоскрытие боковых панелей,
       «Только значки», справка (v0.02.02). */
    settings: (
      <>
        <Button
          size="sm"
          variant="outline"
          className="h-8 w-8 shrink-0 px-0"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          data-testid="theme-toggle"
          title={theme === 'dark' ? ru.topBar.themeLight : ru.topBar.themeDark}
          aria-label={theme === 'dark' ? ru.topBar.themeLight : ru.topBar.themeDark}
        >
          {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </Button>
        <Button
          size="sm"
          variant={autoHideToolbars ? 'secondary' : 'outline'}
          className={`h-8 w-8 shrink-0 px-0 ${autoHideToolbars ? 'bg-primary/15 ring-1 ring-primary/40' : ''}`}
          onClick={toggleAutoHideToolbars}
          data-testid="toolbars-autohide"
          aria-pressed={autoHideToolbars}
          title={autoHideToolbars ? ru.topBar.autoHideToolbarsOnTitle : ru.topBar.autoHideToolbarsTitle}
          aria-label={ru.topBar.autoHideToolbars}
        >
          {autoHideToolbars ? <PanelTopClose className="h-3.5 w-3.5" /> : <PanelTop className="h-3.5 w-3.5" />}
        </Button>
        <Button
          size="sm"
          variant={autoHidePanels ? 'secondary' : 'outline'}
          className={`h-8 w-8 shrink-0 px-0 ${autoHidePanels ? 'bg-primary/15 ring-1 ring-primary/40' : ''}`}
          onClick={toggleAutoHidePanels}
          data-testid="panels-autohide"
          aria-pressed={autoHidePanels}
          title={autoHidePanels ? ru.topBar.panelsAutoHideOnTitle : ru.topBar.panelsAutoHideTitle}
          aria-label={ru.topBar.panelsAutoHide}
        >
          {autoHidePanels ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeft className="h-3.5 w-3.5" />}
        </Button>
        <Button
          size="sm"
          variant={iconOnly ? 'secondary' : 'outline'}
          className={`h-8 w-8 shrink-0 px-0 ${iconOnly ? 'bg-primary/15 ring-1 ring-primary/40' : ''}`}
          onClick={toggleIconOnly}
          data-testid="toolbars-icononly"
          aria-pressed={iconOnly}
          title={iconOnly ? ru.topBar.iconOnlyOnTitle : ru.topBar.iconOnlyOffTitle}
          aria-label={ru.topBar.iconOnly}
        >
          {iconOnly ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </Button>
        <TbButton
          icon={CircleHelp}
          label={ru.topBar.help}
          iconOnly={iconOnly}
          data-testid="help-button"
          onClick={props.onHelp}
          aria-haspopup="dialog"
        />
      </>
    ),
  }), [props, iconOnly, theme, setTheme, autoHideToolbars, autoHidePanels, toggleAutoHideToolbars, toggleAutoHidePanels, toggleIconOnly, validationChip]);

  const titles: Record<ToolbarId, string> = {
    edit: ru.topBar.toolbarEdit,
    mode: ru.topBar.toolbarMode,
    io: ru.topBar.toolbarIo,
    validate: ru.topBar.toolbarValidate,
    settings: ru.topBar.toolbarSettings,
  };
  void TOOLBAR_IDS;

  const items = toolbarOrder.map((id) => ({ id, title: titles[id], visible: !toolbarHidden.includes(id) }));

  /* Меню скрытия/показа тулбаров — общее для ≡ и правого клика. */
  const menuItems = (
    <>
      {items.map(({ id, title, visible }) => (
        <DropdownMenuCheckboxItem
          key={`dd-${id}`}
          checked={visible}
          onCheckedChange={() => toggleToolbar(id)}
          onSelect={(event) => event.preventDefault()}
        >
          {title}
        </DropdownMenuCheckboxItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={showAllToolbars}>{ru.topBar.toolbarsShowAll}</DropdownMenuItem>
      <DropdownMenuItem onSelect={resetLayout}>{ru.topBar.toolbarsResetLayout}</DropdownMenuItem>
    </>
  );
  const contextMenuItems = (
    <>
      {items.map(({ id, title, visible }) => (
        <ContextMenuCheckboxItem
          key={`cm-${id}`}
          checked={visible}
          onSelect={() => toggleToolbar(id)}
        >
          {title}
        </ContextMenuCheckboxItem>
      ))}
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={showAllToolbars}>{ru.topBar.toolbarsShowAll}</ContextMenuItem>
      <ContextMenuItem onSelect={resetLayout}>{ru.topBar.toolbarsResetLayout}</ContextMenuItem>
    </>
  );

  const visibleOrder = toolbarOrder.filter((id) => !toolbarHidden.includes(id));

  return (
    <header
      className="relative z-20 shrink-0 overflow-clip border-b border-border bg-card text-foreground transition-[max-height] duration-200 ease-out"
      style={{ maxHeight: expanded ? 264 : 12 }}
      onMouseEnter={() => setHoverExpanded(true)}
      onMouseLeave={() => setHoverExpanded(false)}
      data-testid="top-toolbar-zone"
      data-collapsed={expanded ? undefined : 'true'}
      title={expanded ? undefined : ru.topBar.autoHideToolbarsOnTitle}
      aria-label={ru.appTitle}
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 pr-12" role="toolbar">
              {/* Бренд и версия — вне тулбаров, всегда слева. */}
              <div className="mr-1 flex shrink-0 items-center gap-1.5">
                <ShieldCheck className="h-5 w-5" aria-hidden />
                <span className="text-sm font-bold">{ru.appTitle}</span>
                <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">{appVersion}</span>
              </div>

              <SortableContext items={visibleOrder} strategy={rectSortingStrategy}>
                {visibleOrder.map((id) => (
                  <SortableToolbar key={id} id={id} title={titles[id]} iconOnly={iconOnly}>
                    {toolbarContent[id]}
                  </SortableToolbar>
                ))}
              </SortableContext>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>{contextMenuItems}</ContextMenuContent>
        </ContextMenu>
      </DndContext>

      {/* Кнопка с тремя горизонтальными линиями: меню скрытия/показа тулбаров. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="absolute right-1.5 top-1/2 z-30 h-8 w-8 -translate-y-1/2 px-0"
            data-testid="toolbars-menu"
            aria-label={ru.topBar.toolbarsMenuTitle}
            title={ru.topBar.toolbarsMenuTitle}
            aria-haspopup="menu"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {menuItems}
        </DropdownMenuContent>
      </DropdownMenu>

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
    </header>
  );
}
