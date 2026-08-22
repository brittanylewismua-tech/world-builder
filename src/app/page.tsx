"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWorld } from "@/lib/useWorld";
import { Loading } from "@/components/Shell";
import Threshold from "@/components/Threshold";
import { saveWorld } from "@/lib/api";
import { todayISO } from "@/lib/daily";

/**
 * The way in.
 *
 * No world yet → setup. Door switched off, or already walked through today →
 * straight to Home. Otherwise you arrive at the threshold.
 *
 * Once a day is the point: it should feel like arriving somewhere in the
 * morning, not like a gate you clear every time you open a tab. Every link
 * inside the app goes to /home, so the door only ever meets you on the way in.
 */
export default function Entry() {
  const router = useRouter();
  const { session, world, loading, patch } = useWorld();

  const today = todayISO();
  const on = world?.theme?.door ?? true;
  const alreadyToday = world?.doorSeenOn === today;
  const show = on && !alreadyToday;

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace("/login");
    else if (!world?.established) router.replace("/setup");
    else if (!show) router.replace("/home");
  }, [loading, session, world, show, router]);

  if (loading || !session || !world?.established || !show) return <Loading />;

  /**
   * Remember the visit. Fire and forget on purpose — walking into your world
   * should not wait on a round trip, and the worst case if it fails is that
   * the door greets you once more.
   */
  function seen(extra: Parameters<typeof saveWorld>[1] = {}) {
    if (!world) return;
    patch({ doorSeenOn: today, ...extra });
    saveWorld(world.id, { doorSeenOn: today, ...extra }).catch(() => {});
  }

  return (
    <Threshold
      world={world}
      onOpen={() => seen()}
      onTurnOff={() => seen({ theme: { ...world.theme, door: false } })}
    />
  );
}
