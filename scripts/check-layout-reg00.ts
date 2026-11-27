/**
 * Диагностика (v0.03.01k→l): автораскладка на фикстуре
 * tests/fixtures/seq-colors/state_reg_00.yaml — регламент допусков.
 *
 * Проверки:
 *   1. рамки ЛГ не пересекаются (кроме полной вложенности);
 *   2. рамки ЛГ не накрывают несгруппированные ДБ;
 *   3. члены ЛГ уплотнены — площадь рамки минимальна (нет чужих ДБ в охвате);
 *   4. детерминизм (два прогона дают одинаковые позиции).
 *
 * Запуск: npx tsx scripts/check-layout-reg00.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseStateYaml } from '../src/io/stateFile';
import { computeAutoLayout } from '../src/engine/layout';
import { computeGroupGeometry, computeGroupVisibility, type LgRect } from '../src/engine/groups';
import type { Architecture, Block } from '../src/engine/types';

const FIXTURE = resolve(__dirname, '../tests/fixtures/seq-colors/state_reg_00.yaml');

function overlap(a: LgRect, b: LgRect): boolean {
  return (
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
  );
}

function contains(outer: LgRect, inner: LgRect): boolean {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.x + outer.width >= inner.x + inner.width &&
    outer.y + outer.height >= inner.y + inner.height
  );
}

function run(label: string): void {
  const text = readFileSync(FIXTURE, 'utf8');
  const parsed = parseStateYaml(text);
  if (parsed.errors.length > 0 || !parsed.model) {
    console.error(`${label}: ошибки импорта`, parsed.errors);
    process.exit(1);
  }
  const project = parsed.model!;
  const arch: Architecture = project.architecture;

  const internal = arch.blocks.filter((b: Block) => !b.external);
  const externals = arch.blocks.filter((b: Block) => b.external);
  const groups = arch.groups ?? [];
  console.log(`\n=== ${label} ===`);
  console.log(
    `внутренних ДБ: ${internal.length}, внешних: ${externals.length}, ЛГ: ${groups.length}`,
    `связей: ${arch.edges.length}`,
  );
  for (const g of groups) console.log(`  ЛГ ${g.id} (${g.name})${g.parentId ? ` ⊂ ${g.parentId}` : ' [корень]'}`);
  const grouped = new Set(internal.filter((b) => b.groupId).map((b) => b.id));
  console.log(`  несгруппированные ДБ: ${internal.filter((b) => !b.groupId).map((b) => b.id).join(', ') || '—'}`);

  // Как в Canvas: прогон с оценочными и с реальными габаритами.
  const sizes = new Map<string, { width: number; height: number }>();
  // Оценочные габариты ДБ: 300x170 (NODE_ESTIMATED_*); ЛГ не в positions.
  const positions = computeAutoLayout(arch, { sizes });

  // Охватывающие рамки ЛГ для развёрнутого состояния (как в resolveGroupOverlaps).
  const expanded = { ...arch, groups: groups.map((g) => ({ ...g, collapsed: false })) };
  const visibility = computeGroupVisibility(expanded);
  const liveRects = new Map<string, LgRect>();
  for (const [id, p] of positions) {
    const s = sizes.get(id) ?? { width: 300, height: 170 };
    liveRects.set(id, { x: p.x, y: p.y, width: s.width, height: s.height });
  }
  const geometry = computeGroupGeometry(expanded, liveRects, visibility);

  const parentOf = new Map(groups.map((g) => [g.id, g.parentId ?? null]));
  const isNestedPair = (a: string, b: string): boolean =>
    parentOf.get(a) === b || parentOf.get(b) === a;

  let violations = 0;
  const gids = groups.map((g) => g.id).sort();
  console.log('\n-- Рамки ЛГ --');
  for (const id of gids) {
    const r = geometry.get(id)?.rect;
    console.log(
      `  ${id}: ${r ? `x=${r.x.toFixed(0)} y=${r.y.toFixed(0)} w=${r.width.toFixed(0)} h=${r.height.toFixed(0)}` : 'НЕТ ГЕОМЕТРИИ'}`,
    );
  }

  console.log('\n1. Пересечения рамок ЛГ:');
  for (let i = 0; i < gids.length; i += 1) {
    for (let j = i + 1; j < gids.length; j += 1) {
      const a = geometry.get(gids[i])!.rect;
      const b = geometry.get(gids[j])!.rect;
      if (isNestedPair(gids[i], gids[j])) {
        const parent = parentOf.get(gids[i]) === gids[j] ? b : a;
        const child = parent === a ? b : a;
        const ok = contains(parent, child);
        if (!ok) {
          violations += 1;
          console.log(`  ✗ ${gids[i]} ⊂ ${gids[j]}: потомок не внутри предка`);
        }
        continue;
      }
      if (overlap(a, b)) {
        violations += 1;
        console.log(`  ✗ ${gids[i]} × ${gids[j]} пересекаются`);
      }
    }
  }
  console.log(violations === 0 ? '  ✓ нарушений нет' : `  нарушений: ${violations}`);

  console.log('2. Накрытие несгруппированных ДБ рамками:');
  for (const b of internal) {
    if (grouped.has(b.id)) continue;
    const rect = liveRects.get(b.id)!;
    for (const id of gids) {
      const frame = geometry.get(id)!.rect;
      if (overlap(frame, rect)) {
        violations += 1;
        console.log(`  ✗ рамка ${id} накрывает несгруппированный ${b.id}`);
      }
    }
  }
  console.log('   (проверено)');

  console.log('3. Чужие ДБ в охвате рамки (уплотнение; члены поддерева — своя вложенность):');
  const subtreeOf = new Map(
    groups.map((g) => {
      const ids = new Set<string>();
      for (const b of internal) {
        let cur: string | undefined = b.groupId;
        const seen = new Set<string>();
        while (cur && !seen.has(cur)) {
          seen.add(cur);
          if (cur === g.id) {
            ids.add(b.id);
            break;
          }
          cur = groups.find((x) => x.id === cur)?.parentId;
        }
      }
      return [g.id, ids] as const;
    }),
  );
  for (const g of groups) {
    const frame = geometry.get(g.id)!.rect;
    const own = subtreeOf.get(g.id)!;
    for (const b of internal) {
      if (own.has(b.id) || !liveRects.has(b.id)) continue;
      const rect = liveRects.get(b.id)!;
      if (overlap(frame, rect)) {
        violations += 1;
        console.log(`  ✗ рамка ${g.id} накрывает чужой ДБ ${b.id} (${b.groupId ?? 'несгруппированный'})`);
      }
    }
  }
  console.log('   (проверено)');

  const positions2 = computeAutoLayout(arch, { sizes });
  const deterministic =
    JSON.stringify([...positions.entries()].sort()) === JSON.stringify([...positions2.entries()].sort());
  console.log(`4. Детерминизм: ${deterministic ? '✓' : '✗ (два прогона различаются)'}`);
  if (!deterministic) violations += 1;

  console.log(violations === 0 ? `\n${label}: ВСЕ ИНВАРИАНТЫ ВЫПОЛНЕНЫ` : `\n${label}: НАРУШЕНИЙ ${violations}`);
}

run('state_reg_00.yaml');
