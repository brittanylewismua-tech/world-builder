"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWorld } from "@/lib/useWorld";
import { Loading } from "@/components/Shell";

export default function Home() {
  const router = useRouter();
  const { session, world, loading } = useWorld();

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace("/login");
    else router.replace(world?.established ? "/daily" : "/setup");
  }, [loading, session, world, router]);

  return <Loading />;
}
