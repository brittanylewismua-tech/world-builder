"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWorld } from "@/lib/useWorld";
import { Loading } from "@/components/Shell";

/**
 * The way in. No world yet → setup, otherwise straight to Home.
 */
export default function Entry() {
  const router = useRouter();
  const { session, world, loading } = useWorld();

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace("/login");
    else router.replace(world?.established ? "/home" : "/setup");
  }, [loading, session, world, router]);

  return <Loading />;
}
