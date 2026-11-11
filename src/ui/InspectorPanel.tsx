'use client';

/**
 * Инспектор — зона раздела 5.1: свойства выбранного объекта (домен, карточка,
 * стрелка, цель безопасности) и доступные действия: перемещение функций
 * в другой домен (Ф-9), правка имени/стоимости, подписи стрелок (Ф-14),
 * удаление домена (Ф-15). В v0.01.01: для внешних систем показывается
 * доверенность (можно изменить) и не отображается стоимость (она не
 * определяется); правка и удаление функций доступны только внутренним
 * доменам (3.5 v0.01.01).
 * Карточка ЦБ (v0.01.09): клик по цели безопасности в левой панели открывает
 * её карточку — обеспечивающие механизмы (функции) с весом и размещением,
 * статус распределения (светофор покрытия) и критичные домены с их типами
 * доверия; клик по домену — фокус на диаграмме и выбор, клик по функции —
 * её карточка. Чистые расчёты — recalcCosts/goalDistribution (без мутаций).
 * Под инспектором — панель расчёта и статуса (SummaryPanel).
 */

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSkibStore } from '../store/projectStore';
import { FOCUS_NODE_EVENT, useViewStore } from '../store/viewStore';
import { goalDistribution } from '../engine/coverage';
import { recalcCosts } from '../engine/cost';
import type { DomainTrustClass } from '../engine/trust';
import { ru } from '../i18n/ru';
import { TRUST_COLORS, StatusBadge } from './status';

export function InspectorPanel() {
  const project = useSkibStore((s) => s.project);
  const selection = useSkibStore((s) => s.selection);
  const setSelection = useSkibStore((s) => s.setSelection);
  const updateDomain = useSkibStore((s) => s.updateDomain);
  const deleteDomain = useSkibStore((s) => s.deleteDomain);
  const updateEdge = useSkibStore((s) => s.updateEdge);
  const deleteEdge = useSkibStore((s) => s.deleteEdge);
  const unplaceFunction = useSkibStore((s) => s.unplaceFunction);
  const placeFunction = useSkibStore((s) => s.placeFunction);
  const setHighlightedDomain = useViewStore((s) => s.setHighlightedDomain);
  const clearFlash = useViewStore((s) => s.flashDomains);

  const blockById = useMemo(
    () => new Map(project.architecture.blocks.map((b) => [b.id, b])),
    [project.architecture.blocks],
  );
  const fnById = useMemo(
    () => new Map(project.security.functions.map((f) => [f.id, f])),
    [project.security.functions],
  );
  const goalById = useMemo(
    () => new Map(project.security.goals.map((g) => [g.id, g])),
    [project.security.goals],
  );
  const edgeById = useMemo(
    () => new Map(project.architecture.edges.map((e) => [e.id, e])),
    [project.architecture.edges],
  );
  const placementByFn = useMemo(() => {
    const map = new Map<string, string>();
    for (const assignment of project.assignments) map.set(assignment.function, assignment.block);
    return map;
  }, [project.assignments]);
  // Карточка ЦБ (v0.01.09): распределение выбранной цели и классы доверия
  // доменов (типы ДДБ/ДДБПЦД у критичных доменов). Чистые пересчёты.
  const goalDist = useMemo(
    () => (selection?.kind === 'goal' ? goalDistribution(project, selection.id) : null),
    [project, selection],
  );
  const trustByBlock = useMemo(() => recalcCosts(project).trust.internal, [project]);

  /** Тип домена доверия для строки критичного домена (v0.01.09). */
  const trustBadge = (trustClass: DomainTrustClass | undefined) => {
    if (trustClass === 'ddbpcd') return { label: 'ДДБПЦД', color: TRUST_COLORS.yellow };
    if (trustClass === 'ddb') return { label: 'ДДБ', color: TRUST_COLORS.green };
    return { label: 'НДБ', color: TRUST_COLORS.red };
  };

  let body: React.ReactNode = (
    <p className="px-1 text-xs italic text-muted-foreground">{ru.inspector.nothingSelected}</p>
  );

  if (selection?.kind === 'domain') {
    const block = blockById.get(selection.id);
    if (block) {
      const isExternal = block.external ?? false;
      // Перемещение возможно только во внутренние домены (3.5 v0.01.01).
      const otherBlocks = project.architecture.blocks.filter(
        (b) => b.id !== block.id && !b.external,
      );

      if (isExternal) {
        // Внешняя система: имя и доверенность; стоимость не определяется.
        body = (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">
              {ru.inspector.domain}: <span className="font-mono text-xs text-muted-foreground">{block.id}</span>
              <span
                className="ml-2 rounded px-1.5 py-0.5 align-middle text-[10px] font-medium"
                style={{
                  border: `1px dashed ${(block.trusted ? TRUST_COLORS.green : TRUST_COLORS.red).border}`,
                }}
              >
                {ru.inspector.externalIsExternal}
              </span>
            </h3>
            <div>
              <Label htmlFor="domain-name" className="text-xs">{ru.inspector.name}</Label>
              <Input
                id="domain-name"
                className="mt-1 h-8"
                value={block.name}
                onChange={(event) => updateDomain(block.id, { name: event.target.value.slice(0, 80) })}
              />
            </div>
            <div>
              <Label htmlFor="external-trust" className="text-xs">{ru.inspector.externalTrust}</Label>
              <Select
                value={block.trusted ? 'trusted' : 'untrusted'}
                onValueChange={(value) => updateDomain(block.id, { trusted: value === 'trusted' })}
              >
                <SelectTrigger id="external-trust" className="mt-1 h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="untrusted">{ru.inspector.externalTrustUntrusted}</SelectItem>
                  <SelectItem value="trusted">{ru.inspector.externalTrustTrusted}</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] italic text-muted-foreground">
                {ru.inspector.externalTrustHint}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">{ru.canvas.noCostExternal}</p>
            <p className="text-xs text-muted-foreground">{ru.inspector.internalOnlyHint}</p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" className="h-8">
                  {ru.inspector.deleteDomain}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{ru.dialogs.confirmReplaceTitle}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {ru.inspector.confirmDeleteDomain(block.name)}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{ru.inspector.cancel}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteDomain(block.id)}>
                    {ru.inspector.confirm}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        );
      } else {
        const cards = project.security.functions.filter(
          (fn) => placementByFn.get(fn.id) === block.id,
        );
        body = (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">
              {ru.inspector.domain}: <span className="font-mono text-xs text-muted-foreground">{block.id}</span>
            </h3>
            <div>
              <Label htmlFor="domain-name" className="text-xs">{ru.inspector.name}</Label>
              <Input
                id="domain-name"
                className="mt-1 h-8"
                value={block.name}
                onChange={(event) => updateDomain(block.id, { name: event.target.value.slice(0, 80) })}
              />
            </div>
            <div>
              <Label htmlFor="domain-cost" className="text-xs">{ru.inspector.blockCost}</Label>
              <Input
                id="domain-cost"
                className="mt-1 h-8"
                type="number"
                min={0}
                step={1}
                value={block.cost}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isInteger(value) && value >= 0) updateDomain(block.id, { cost: value });
                }}
              />
            </div>
            {/* Принудительный ввод внутреннего домена в ДВБ (v0.01.06): доверенный
                домен без функции безопасности — например, доверенные датчики. */}
            <div>
              <Label htmlFor="domain-dvb" className="text-xs">{ru.inspector.forceDvb}</Label>
              <Select
                value={block.forceTrusted ? 'forced' : 'auto'}
                onValueChange={(value) => updateDomain(block.id, { forceTrusted: value === 'forced' })}
              >
                <SelectTrigger id="domain-dvb" className="mt-1 h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{ru.inspector.forceDvbAuto}</SelectItem>
                  <SelectItem value="forced">{ru.inspector.forceDvbForced}</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] italic text-muted-foreground">
                {ru.inspector.forceDvbHint}
              </p>
            </div>
            <div>
              <Label className="text-xs">{ru.inspector.functionsInDomain} ({cards.length})</Label>
              <div className="mt-1 space-y-2">
                {cards.length === 0 && (
                  <p className="text-xs italic text-muted-foreground">{ru.canvas.statusNeutral}</p>
                )}
                {cards.map((fn) => (
                  <div key={fn.id} className="rounded border border-border bg-card px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-medium" title={fn.name}>
                        {fn.name}
                      </span>
                      <span className="text-xs text-muted-foreground">{fn.cost}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs"
                        onClick={() => unplaceFunction(fn.id)}
                      >
                        {ru.canvas.remove}
                      </Button>
                    </div>
                    {otherBlocks.length > 0 && (
                      <div className="mt-1.5">
                        <Select
                          value=""
                          onValueChange={(target) => {
                            if (target) placeFunction(fn.id, target);
                          }}
                        >
                          <SelectTrigger className="h-7 w-full text-xs" aria-label={ru.inspector.move}>
                            <SelectValue placeholder={ru.inspector.move} />
                          </SelectTrigger>
                          <SelectContent>
                            {otherBlocks.map((other) => (
                              <SelectItem key={other.id} value={other.id}>
                                {other.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[11px] italic text-muted-foreground">{ru.inspector.internalOnlyHint}</p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" className="h-8">
                  {ru.inspector.deleteDomain}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{ru.dialogs.confirmReplaceTitle}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {ru.inspector.confirmDeleteDomain(block.name)}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{ru.inspector.cancel}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteDomain(block.id)}>
                    {ru.inspector.confirm}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        );
      }
    }
  } else if (selection?.kind === 'card') {
    const fn = fnById.get(selection.id);
    if (fn) {
      const placementBlock = placementByFn.get(fn.id);
      const block = placementBlock ? blockById.get(placementBlock) : undefined;
      const otherBlocks = project.architecture.blocks.filter(
        (b) => b.id !== placementBlock && !b.external,
      );
      body = (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">
            {ru.inspector.card}: <span className="font-mono text-xs text-muted-foreground">{fn.id}</span>
          </h3>
          <p className="text-sm text-foreground">{fn.name}</p>
          <p className="text-xs text-muted-foreground">{ru.inspector.cost}: {fn.cost}</p>
          <div>
            <Label className="text-xs">{ru.inspector.goalsOfCard}</Label>
            <ul className="mt-1 space-y-1">
              {(fn.implements ?? []).length === 0 && (
                <li className="text-xs italic text-muted-foreground">—</li>
              )}
              {(fn.implements ?? []).map((link, index) => {
                const goal = goalById.get(link.goal);
                return (
                  <li key={index} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate text-muted-foreground">{goal?.name ?? link.goal}</span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 ${
                        link.weight === 'mandatory'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-secondary-foreground'
                      }`}
                    >
                      {link.weight === 'mandatory' ? ru.goals.mandatory : ru.goals.optional}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">
            {block ? ru.pool.placedIn(block.name) : ru.pool.free}
          </p>
          {otherBlocks.length > 0 && (
            <Select
              value=""
              onValueChange={(target) => {
                if (target) placeFunction(fn.id, target);
              }}
            >
              <SelectTrigger className="h-8 w-full text-xs" aria-label={ru.inspector.move}>
                <SelectValue placeholder={ru.inspector.move} />
              </SelectTrigger>
              <SelectContent>
                {otherBlocks.map((other) => (
                  <SelectItem key={other.id} value={other.id}>
                    {other.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {placementBlock && (
            <Button size="sm" variant="outline" className="h-8" onClick={() => unplaceFunction(fn.id)}>
              {ru.canvas.remove}
            </Button>
          )}
        </div>
      );
    }
  } else if (selection?.kind === 'goal' && goalDist) {
    // Карточка ЦБ (v0.01.09): обеспечивающие механизмы, статус распределения
    // и критичные домены с типами; клик по домену — фокус и выбор на канве.
    const goal = goalById.get(selection.id);
    if (goal) {
      body = (
        <div className="space-y-3" data-testid="goal-inspector">
          <h3 className="text-sm font-semibold">
            {ru.inspector.goal}: <span className="font-mono text-xs text-muted-foreground">{goal.id}</span>
            {goal.unconditional && (
              <span
                className="ml-2 rounded border border-dashed border-border px-1.5 py-0.5 align-middle text-[10px] font-medium"
                title={ru.goals.unconditionalHint}
              >
                {ru.inspector.goalPlo}
              </span>
            )}
          </h3>
          <p className="text-sm text-foreground">{goal.name}</p>
          {goal.description && (
            <p className="text-xs leading-snug text-muted-foreground">{goal.description}</p>
          )}
          <div>
            <Label className="text-xs">{ru.inspector.goalStatus}</Label>
            <div className="mt-1" data-testid="goal-status">
              <StatusBadge status={goalDist.status} />
            </div>
          </div>
          <div>
            <Label className="text-xs">
              {ru.inspector.goalFunctions} ({goalDist.functions.length})
            </Label>
            {goalDist.functions.length === 0 && (
              <p className="mt-1 text-xs italic text-muted-foreground">{ru.inspector.goalNoFunctions}</p>
            )}
            <ul className="mt-1 space-y-1" data-testid="goal-functions">
              {goalDist.functions.map((fn) => {
                const placedBlock = fn.blockId ? blockById.get(fn.blockId) : undefined;
                return (
                  <li key={fn.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded border border-border bg-card px-2 py-1.5 text-left transition-colors hover:bg-accent/50"
                      data-testid={`goal-fn-${fn.id}`}
                      title={`${fn.name} — ${placedBlock ? ru.pool.placedIn(placedBlock.name) : ru.pool.free}`}
                      onClick={() => setSelection({ kind: 'card', id: fn.id })}
                    >
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">{fn.name}</span>
                      <span className="text-xs text-muted-foreground">{fn.cost}</span>
                      <span
                        className={`shrink-0 rounded px-1 py-0.5 text-[10px] ${
                          fn.weight === 'mandatory'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-secondary-foreground'
                        }`}
                      >
                        {fn.weight === 'mandatory' ? ru.goals.mandatory : ru.goals.optional}
                      </span>
                      <span
                        className={`shrink-0 text-[11px] ${
                          placedBlock ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                        }`}
                      >
                        {placedBlock ? ru.goals.placed : ru.goals.notPlaced}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <Label className="text-xs">
              {ru.inspector.goalCriticalDomains} ({goalDist.criticalDomains.length})
            </Label>
            {goalDist.functions.length > 0 && goalDist.criticalDomains.length === 0 && (
              <p className="mt-1 text-xs italic text-muted-foreground">
                {ru.inspector.goalFunctionsNotPlaced}
              </p>
            )}
            <ul className="mt-1 space-y-1" data-testid="goal-domains">
              {goalDist.criticalDomains.map((domain) => {
                const badge = trustBadge(trustByBlock.get(domain.id));
                return (
                  <li key={domain.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded border border-border bg-card px-2 py-1.5 text-left transition-colors hover:bg-accent/50"
                      data-testid={`goal-domain-${domain.id}`}
                      title={`${domain.name}: клик — фокус на диаграмме и выбор`}
                      onClick={() => {
                        // Фокус на домене (в центр, с укрупнением) и выбор —
                        // событие ловит FocusController внутри канвы (v0.01.04).
                        // Краткая подсветка цели гаснет: выбран конкретный домен.
                        setSelection({ kind: 'domain', id: domain.id });
                        clearFlash([]);
                        window.dispatchEvent(new CustomEvent(FOCUS_NODE_EVENT, { detail: domain.id }));
                      }}
                      onMouseEnter={() => setHighlightedDomain(domain.id)}
                      onMouseLeave={() => setHighlightedDomain(null)}
                    >
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">{domain.name}</span>
                      <span
                        className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold"
                        style={{ border: `1px solid ${badge.color.border}`, background: badge.color.fill }}
                      >
                        {badge.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="text-[11px] italic text-muted-foreground">{ru.inspector.goalCardHint}</p>
        </div>
      );
    }
  } else if (selection?.kind === 'edge') {
    const edge = edgeById.get(selection.id);
    if (edge) {
      const from = blockById.get(edge.from);
      const to = blockById.get(edge.to);
      body = (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">
            {ru.inspector.edge}: <span className="font-mono text-xs text-muted-foreground">{edge.id}</span>
          </h3>
          <p className="text-xs text-muted-foreground">
            {ru.inspector.edgeFrom}: {from?.name ?? edge.from} → {ru.inspector.edgeTo}: {to?.name ?? edge.to}
          </p>
          <div>
            <Label htmlFor="edge-label" className="text-xs">{ru.inspector.edgeLabel}</Label>
            <Input
              id="edge-label"
              className="mt-1 h-8"
              value={edge.label ?? ''}
              onChange={(event) => updateEdge(edge.id, { label: event.target.value.slice(0, 60) })}
              placeholder="—"
            />
          </div>
          <Button size="sm" variant="destructive" className="h-8" onClick={() => deleteEdge(edge.id)}>
            {ru.inspector.deleteEdge}
          </Button>
          <p className="text-xs text-muted-foreground">Delete — {ru.inspector.deleteEdge.toLowerCase()}</p>
        </div>
      );
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="inspector-panel">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{ru.inspector.title}</h2>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4">{body}</div>
      </ScrollArea>
    </div>
  );
}
