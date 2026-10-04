// Local-first project library in IndexedDB. Nothing leaves the browser unless the user exports or shares.
import { createStore, del, entries, get, set } from 'idb-keyval';
import type { Project } from '../model/types';

const store = createStore('openkitchen3d', 'projects');

export interface ProjectSummary { id: string; name: string; updatedAt: string; cabinets: number; catalogId: string }

export async function listProjects(): Promise<ProjectSummary[]> {
  const all = (await entries<string, Project>(store)).map(([, p]) => p);
  return all
    .map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, cabinets: p.kitchen.cabinets.length, catalogId: p.catalogId }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export const loadProject = (id: string) => get<Project>(id, store);
export const saveProject = (p: Project) => set(p.id, JSON.parse(JSON.stringify(p)), store);
export const deleteProject = (id: string) => del(id, store);
