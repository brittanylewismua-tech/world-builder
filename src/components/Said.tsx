"use client";

/**
 * The models emphasise **like this**. Printing the asterisks makes the app
 * look broken; stripping them throws away the only structure in a long
 * paragraph. So render it, and nothing else — this is deliberately not a
 * markdown parser, because the only syntax that actually shows up in these
 * replies is bold, and a parser is a much larger surface to get wrong.
 */
export default function Said({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) =>
        chunk.startsWith("**") && chunk.endsWith("**") ? (
          <b key={i} className="font-bold text-ink">
            {chunk.slice(2, -2)}
          </b>
        ) : (
          <span key={i}>{chunk}</span>
        ),
      )}
    </>
  );
}
