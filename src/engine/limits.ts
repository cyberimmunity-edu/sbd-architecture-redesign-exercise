/**
 * Лимиты модели — Ф-17: не более 200 доменов, не более 500 стрелок.
 * Проверяются перед операциями добавления; превышение блокирует операцию.
 */

import type { Project } from './types';
import { MAX_DOMAINS, MAX_EDGES } from './types';

export function canAddDomain(project: Project): boolean {
  return project.architecture.blocks.length < MAX_DOMAINS;
}

export function canAddEdge(project: Project): boolean {
  return project.architecture.edges.length < MAX_EDGES;
}

export function limitsReport(project: Project): string[] {
  const messages: string[] = [];
  if (project.architecture.blocks.length >= MAX_DOMAINS) {
    messages.push(`Достигнут лимит доменов (${MAX_DOMAINS})`);
  }
  if (project.architecture.edges.length >= MAX_EDGES) {
    messages.push(`Достигнут лимит стрелок (${MAX_EDGES})`);
  }
  return messages;
}
