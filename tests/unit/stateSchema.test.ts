/**
 * Тесты JSON-схемы state.yaml — v0.03.01 (интеграция с ИИ-агентами,
 * топ-5 задача №3). Схема docs/state.schema.json — проекция zod-схем
 * src/io/schema.ts и констант движка: она обязана покрывать все допустимые
 * поля парсера и не описывать поля, которых парсер не знает, а её
 * ограничения — совпадать с константами движка.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  FILE_VERSION,
  ID_PATTERN,
  LG_COLORS,
  MAX_DOMAINS,
  MAX_EDGES,
  MAX_DOMAIN_GROUPS,
  MAX_SEQUENCES,
  MAX_LIFELINES,
  MAX_SEQ_ARROWS,
  MAX_SEQ_BLOCKS,
} from '../../src/engine/types';
import { allowedKeys } from '../../src/io/schema';

const schema = JSON.parse(
  readFileSync(new URL('../../docs/state.schema.json', import.meta.url), 'utf8'),
);

/** Все имена полей JSON-схемы (под деревьями properties/items). */
function schemaFieldNames(node, acc = new Set()) {
  if (node === null || typeof node !== 'object') return acc;
  if (Array.isArray(node)) {
    for (const item of node) schemaFieldNames(item, acc);
    return acc;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [name, child] of Object.entries(value)) {
        acc.add(name);
        schemaFieldNames(child, acc);
      }
    } else if (key === 'items') {
      schemaFieldNames(value, acc);
    }
  }
  return acc;
}

/** Все имена полей дерева допустимых ключей парсера (allowedKeys). */
function allowedFieldNames(tree, acc = new Set()) {
  for (const [key, value] of Object.entries(tree)) {
    acc.add(key);
    if (value && typeof value === 'object') allowedFieldNames(value, acc);
  }
  return acc;
}

describe('JSON-схема state.yaml — согласованность с движком (v0.03.01)', () => {
  it('схема корректный JSON с черновиком 2020-12 и $id', () => {
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.$id).toBe('skib-lab/state-v1');
    expect(schema.type).toBe('object');
  });

  it('обязательные разделы совпадают с parseStateData', () => {
    expect(schema.required).toEqual(['version', 'architecture', 'security', 'assignments']);
    expect(schema.properties.version.const).toBe(FILE_VERSION);
  });

  it('лимиты схемы равны константам движка', () => {
    expect(schema.properties.architecture.properties.blocks.maxItems).toBe(MAX_DOMAINS);
    expect(schema.properties.architecture.properties.edges.maxItems).toBe(MAX_EDGES);
    expect(schema.properties.architecture.properties.groups.maxItems).toBe(MAX_DOMAIN_GROUPS);
    expect(schema.properties.sequences.maxItems).toBe(MAX_SEQUENCES);
    expect(schema.properties.sequences.items.properties.lifelines.maxItems).toBe(MAX_LIFELINES);
    expect(schema.properties.sequences.items.properties.arrows.maxItems).toBe(MAX_SEQ_ARROWS);
    expect(schema.properties.sequences.items.properties.blocks.maxItems).toBe(MAX_SEQ_BLOCKS);
  });

  it('шаблон id и палитра ЛГ совпадают с константами движка', () => {
    expect(schema.properties.architecture.properties.blocks.items.properties.id.pattern).toBe(
      ID_PATTERN.source,
    );
    expect(schema.properties.architecture.properties.groups.items.properties.color.enum).toEqual([
      ...LG_COLORS,
    ]);
  });

  it('схема не описывает поля, которых нет в дереве парсера (без W-001 у агентов)', () => {
    const allowed = allowedFieldNames(allowedKeys.state);
    for (const name of schemaFieldNames(schema)) {
      expect(allowed.has(name), `поле схемы вне парсера: ${name}`).toBe(true);
    }
  });

  it('схема покрывает все допустимые поля парсера (агент не пропустит поле)', () => {
    const described = schemaFieldNames(schema);
    for (const name of allowedFieldNames(allowedKeys.state)) {
      // version в state.yaml есть; вложенный architecture.version парсером
      // допускается (архивная совместимость), но сериализатор его не пишет.
      expect(described.has(name), `поле парсера не описано схемой: ${name}`).toBe(true);
    }
  });
});
