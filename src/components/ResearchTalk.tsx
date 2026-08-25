"use client";

import { useState } from "react";
import CreativeRoom from "./CreativeRoom";
import CustomerChat from "./CustomerChat";
import type { Drop } from "@/lib/drops";
import type { World } from "@/lib/world";

/**
 * TWO CONVERSATIONS, ONE SEAT.
 *
 * Researching a drop means asking two different kinds of question, and they
 * used to live on different screens. "What is going on across these pieces?"
 * is a question for the Creative Room, which can see the board. "Would she
 * actually say this?" is a question for the customer, who cannot see the
 * board and should not — she is a person in that world, not a collaborator
 * reviewing your work.
 *
 * Same space, one switch. Both threads keep their own memory, so flipping
 * between them never costs you the conversation you were having.
 */
export default function ResearchTalk({
  world,
  drop,
  drops = [],
  pins = [],
}: {
  world: World;
  drop: Drop;
  drops?: Drop[];
  /** The board's own pieces, so the room can look at what you are looking at. */
  pins?: { id: string; src: string | null }[];
}) {
  // ?talk=customer lands someone straight on her — that is where the old
  // "talk to the customer" page now sends people.
  const [who, setWho] = useState<"room" | "customer">(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("talk") === "customer"
      ? "customer"
      : "room",
  );

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex gap-1 rounded-xl border-2 border-black p-1">
        <button
          onClick={() => setWho("room")}
          className={`flex-1 rounded-lg px-3 py-2 text-[13px] font-bold transition ${
            who === "room" ? "bg-black text-white" : "hover:bg-black/5"
          }`}
        >
          Drop Director
        </button>
        <button
          onClick={() => setWho("customer")}
          className={`flex-1 rounded-lg px-3 py-2 text-[13px] font-bold transition ${
            who === "customer" ? "bg-black text-white" : "hover:bg-black/5"
          }`}
        >
          Your Customer
        </button>
      </div>

      {/*
        Both stay mounted. Unmounting would throw away the scroll position and
        the half-typed message every time somebody glanced at the other one.
      */}
      <div className={`min-h-0 flex-1 ${who === "room" ? "" : "hidden"}`}>
        {/*
          On the research tab the Director looks at the pins; on the build tab
          there are no pins and the mockups are the subject. Same person, same
          thread — what changes is what is in front of you.
        */}
        <CreativeRoom
          world={world}
          drop={drop}
          drops={drops}
          looksAt={pins.length ? pins : undefined}
          subject={pins.length ? "pins" : "mockups"}
        />
      </div>
      <div className={`min-h-0 flex-1 ${who === "customer" ? "" : "hidden"}`}>
        <CustomerChat world={world} drop={drop} />
      </div>
    </div>
  );
}
