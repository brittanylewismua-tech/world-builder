"use client";

import * as api from "./api";
import type { VisualReference, World } from "./world";

/**
 * Shared write handlers for the setup flow and World Profile, so both screens
 * edit the world through exactly the same code path. Each one writes to
 * Supabase, then patches local state rather than refetching the whole world.
 */
export function worldActions(
  world: World,
  patch: (p: Partial<World>) => void,
  onError: (message: string) => void,
) {
  const guard = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      onError(e instanceof Error ? e.message : "That did not save.");
    }
  };

  return {
    addSubNiche: (keyword: string) =>
      guard(async () => {
        const row = await api.addSubNiche(world.id, keyword);
        patch({ subNiches: [...world.subNiches, row] });
      }),

    addSubNiches: (keywords: string[]) =>
      guard(async () => {
        const rows = await api.addSubNiches(world.id, keywords);
        patch({ subNiches: [...world.subNiches, ...rows] });
      }),

    removeSubNiche: (id: string) =>
      guard(async () => {
        await api.removeSubNiche(id);
        patch({ subNiches: world.subNiches.filter((s) => s.id !== id) });
      }),

    addArea: (name: string) =>
      guard(async () => {
        const row = await api.addArea(world.id, name);
        patch({ areas: [...world.areas, row] });
      }),

    removeArea: (id: string) =>
      guard(async () => {
        await api.removeArea(id);
        patch({ areas: world.areas.filter((a) => a.id !== id) });
      }),

    addVisualReferences: (files: File[]) =>
      guard(async () => {
        const added: VisualReference[] = [];
        for (const f of files) {
          added.push(await api.addVisualReference(world.id, f));
        }
        patch({ visualReferences: [...world.visualReferences, ...added] });
      }),

    setSubNicheNote: async (id: string, note: string) => {
      await api.setSubNicheNote(id, note);
      patch({
        subNiches: world.subNiches.map((s) =>
          s.id === id ? { ...s, note } : s,
        ),
      });
    },

    reorderVisualReferences: async (next: VisualReference[]) => {
      // Show the new arrangement immediately; it is a drag, it must feel live.
      patch({ visualReferences: next });
      try {
        await api.reorderVisualReferences(next);
      } catch (e) {
        patch({ visualReferences: world.visualReferences });
        onError(e instanceof Error ? e.message : "That order did not save.");
      }
    },

    removeVisualReference: (ref: VisualReference) =>
      guard(async () => {
        await api.removeVisualReference(ref);
        patch({
          visualReferences: world.visualReferences.filter(
            (r) => r.id !== ref.id,
          ),
        });
      }),

    setAffinity: (affinity: World["affinity"]) =>
      guard(async () => {
        patch({ affinity });
        await api.saveWorld(world.id, { affinity });
      }),

    setName: (name: string) =>
      guard(async () => {
        patch({ name });
        await api.saveWorld(world.id, { name });
      }),

    establish: (name: string) =>
      guard(async () => {
        patch({ name, established: true });
        await api.saveWorld(world.id, { name, established: true });
      }),
  };
}
