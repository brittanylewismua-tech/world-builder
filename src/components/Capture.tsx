"use client";

import { useRef, useState } from "react";

/**
 * ONE FIELD.
 *
 * This replaced a row that read: "Add to board · Image · Write something ·
 * Link · Sorting it out is not your job." Five pieces of furniture asking the
 * seller to classify her own input before she is allowed to give it to us —
 * and the app can tell the difference perfectly well on its own.
 *
 *   paste a URL      → a link
 *   type words       → a quote
 *   press +, or drop
 *   a file, or paste
 *   an image         → an image
 *
 * The plus is a real button rather than a hint because "you can paste images
 * here" is invisible, and a person with a file on their desktop needs
 * somewhere to aim.
 */

const LOOKS_LIKE_URL = /^https?:\/\/\S+$/i;

export default function Capture({
  busy,
  onText,
  onLink,
  onFiles,
}: {
  busy: string;
  onText: (text: string) => Promise<void>;
  onLink: (url: string) => Promise<void>;
  onFiles: (files: FileList | File[]) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [over, setOver] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  async function commit() {
    const v = value.trim();
    if (!v || saving) return;
    setSaving(true);
    try {
      // A bare URL is a link. Anything else is something she wrote.
      if (LOOKS_LIKE_URL.test(v)) await onLink(v);
      else await onText(v);
      setValue("");
    } finally {
      setSaving(false);
    }
  }

  const working = saving || !!busy;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
      }}
      className={`flex items-center gap-2 rounded-xl border bg-white py-1.5 pl-3.5 pr-1.5 transition ${
        over ? "border-black bg-accent-soft" : "border-black/15"
      }`}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        onPaste={(e) => {
          // An image on the clipboard skips the text path entirely.
          const images = Array.from(e.clipboardData.files).filter((f) =>
            f.type.startsWith("image/"),
          );
          if (!images.length) return;
          e.preventDefault();
          onFiles(images);
        }}
        disabled={working}
        placeholder={
          over ? "Drop it here" : "Paste a link, or type a quote…"
        }
        aria-label="Add to this drop"
        className="min-w-0 flex-1 bg-transparent py-1.5 text-[14px] text-ink outline-none placeholder:text-ink-3 disabled:opacity-60"
      />

      {value.trim() && (
        <button
          onClick={commit}
          disabled={working}
          className="btn btn-primary !px-3 !py-1.5 !text-[13px]"
        >
          {saving ? "Adding…" : "Add"}
        </button>
      )}

      <button
        onClick={() => file.current?.click()}
        disabled={working}
        title="Add an image"
        aria-label="Add an image"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black/15 text-[17px] leading-none text-ink-2 transition hover:border-black hover:text-ink disabled:opacity-40"
      >
        {busy ? <span className="pulse-soft text-[12px]">•••</span> : "+"}
      </button>

      <input
        ref={file}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
        className="hidden"
      />
    </div>
  );
}
