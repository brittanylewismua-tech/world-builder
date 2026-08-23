"use client";

import React from "react";

/**
 * Something broke, and the seller should see a room rather than a white void.
 *
 * A crash used to render nothing at all — no message, no way back, no trace
 * anywhere. This keeps the person oriented and puts the real error in the
 * console and the server log so a failure is not invisible.
 */
export default class Boundary extends React.Component<
  { children: React.ReactNode },
  { broken: boolean }
> {
  state = { broken: false };

  static getDerivedStateFromError() {
    return { broken: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("World Builder crashed:", error, info.componentStack);
    // Best effort — a logging failure must never mask the original error.
    try {
      void fetch("/api/log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack?.slice(0, 2000),
          where: typeof window !== "undefined" ? window.location.pathname : "",
        }),
        keepalive: true,
      });
    } catch {
      /* nothing useful to do here */
    }
  }

  render() {
    if (!this.state.broken) return this.props.children;

    return (
      <main className="flex min-h-dvh items-center justify-center bg-white px-6">
        <div className="card max-w-md p-7 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/globe.png"
            alt=""
            className="mx-auto h-12 w-12 opacity-60"
          />
          <h1 className="t-h2 mt-5">Something in here broke</h1>
          <p className="t-small mt-2 text-ink-2">
            Not your fault, and nothing you have made is lost — your world is
            saved. Reloading usually clears it.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="btn btn-accent mt-5"
          >
            Reload
          </button>
        </div>
      </main>
    );
  }
}
