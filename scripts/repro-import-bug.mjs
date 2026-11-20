/**
 * Диагностика round-trip «экспорт → импорт» ДП (v0.03.01e).
 * Разбирает регрессионные фикстуры (файлы из баг-отчёта v0.03.01d)
 * реальными парсерами io и печатает ошибки/предупреждения.
 * Запуск: node scripts/repro-import-bug.mjs
 */
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

register(new URL('../cli/ts-hook.mjs', import.meta.url));

const { parseStateYaml } = await import('../src/io/stateFile.ts');
const { parseSequencesYaml } = await import('../src/io/sequencesYaml.ts');
const { dump, load } = await import('js-yaml');

const stateText = readFileSync(new URL('../tests/fixtures/seq-regression/state.yaml', import.meta.url), 'utf8');
const seqText = readFileSync(new URL('../tests/fixtures/seq-regression/sequences.yaml', import.meta.url), 'utf8');

console.log('=== 1. Импорт state (5).yaml ===');
const state = parseStateYaml(stateText);
console.log('errors:', JSON.stringify(state.errors, null, 2));
console.log('warnings:', state.warnings.map((w) => `${w.code} ${w.path ?? ''}`));
if (state.model) {
  console.log('model ok: blocks =', state.model.architecture.blocks.length,
    ', sequences =', state.model.sequences?.length ?? 0);
}

// Архитектура без секции sequences — чтобы получить блоки ДАП для шага 2.
const stateNoSeq = structuredClone(load(stateText));
delete stateNoSeq.sequences;
const archOnly = parseStateYaml(dump(stateNoSeq));
console.log('\n=== 2. Импорт sequences (1).yaml (по блокам ДАП) ===');
if (archOnly.model) {
  const seq = parseSequencesYaml(seqText, archOnly.model.architecture.blocks);
  console.log('errors:', JSON.stringify(seq.errors, null, 2));
  console.log('warnings:', seq.warnings.map((w) => `${w.code} ${w.path ?? ''}`));
  console.log('model ok: sequences =', seq.model?.length ?? 0);
} else {
  console.log('архитектура не разобралась:', archOnly.errors);
}

console.log('\n=== 3. Round-trip: serialize → parse (модель из state без sequences + sequences) ===');
if (archOnly.model && archOnly.model.sequences === undefined) {
  const { serializeStateYaml } = await import('../src/io/stateFile.ts');
  const { serializeSequencesYaml } = await import('../src/io/sequencesYaml.ts');
  const blocks = archOnly.model.architecture.blocks;
  // Собираем последовательности вручную из текста файла через parse без валидации E-605 невозможен,
  // поэтому round-trip делаем по примерам движка: берём ДП из sequences (1).yaml как есть нельзя.
  // Вместо этого проверяем round-trip на валидном подмножестве: seq-1 и seq-3.
  const validSubset = load(seqText);
  validSubset.sequences = validSubset.sequences.filter((s) => s.id !== 'seq-2');
  const reSeq = parseSequencesYaml(
    serializeSequencesYaml(parseSequencesYaml(dump(validSubset), blocks).model ?? [], blocks),
    blocks,
  );
  console.log('sequences (seq-1, seq-3) round-trip errors:', reSeq.errors.length ? reSeq.errors : 'нет');
  void serializeStateYaml;
}
