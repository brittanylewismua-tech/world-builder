"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWorld } from "@/lib/useWorld";
import { Loading } from "@/components/Shell";
import Threshold from "@/components/Threshold";
import { saveWorld } from "@/lib/api";

/**
 * The way in.
 *
 * No world yet → setup. Door switched off → straight to Home. Otherwise you
 * arrive at the threshold and walk through it. Every link inside the app
 * points at /home, so the door only ever meets you on the way in.
 */
export default function Entry() {
  const router = useRouter();
  const { session, world, loading, patch } = useWorld();

  const door = world?.theme?.door ?? true;

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace("/login");
    else if (!world?.established) router.replace("/setup");
    else if (!door) router.replace("/home");
  }, [loading, session, world, door, router]);

  if (loading || !session || !world?.established || !door) return <Loading />;

  return (
    <Threshold
      world={world}
      onTurnOff={() => {
        const theme = { ...world.theme, door: false };
        patch({ theme });
        // Fire and forget — the walk to Home should not wait on a write, and
        // a failed save just means the door shows again next time.
        saveWorld(world.id, { theme }).catch(() => {});
      }}
    />
  );
}
