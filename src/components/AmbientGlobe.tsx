/* eslint-disable @next/next/no-img-element */

/**
 * The ambient globe.
 *
 * A very large globe pushed off the right edge of the viewport, fixed so it
 * does not scroll, rotating slowly behind the entire workspace. Content cards
 * float above it on white, which is what stops the app reading as a flat page.
 *
 * Three things keep it from hurting readability:
 *  - it is fixed and mostly off-canvas, so only the left third is ever visible
 *  - a white scrim washes it out under the reading column
 *  - the rotation is slow enough (three minutes a turn) to register as ambience
 *    rather than motion, and it pauses for anyone who asks for reduced motion
 */
export default function AmbientGlobe() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {/* soft bloom so the globe sits in light rather than on top of nothing */}
      <div className="absolute -right-[18vw] top-1/2 h-[92vh] w-[92vh] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(238,111,192,0.16),rgba(238,111,192,0.05)_45%,transparent_70%)] blur-2xl" />

      <div className="globe-drift absolute -right-[26vw] top-1/2 -translate-y-1/2">
        <img
          src="/globe.png"
          alt=""
          className="globe-turn h-[86vh] w-[86vh] max-w-none opacity-[0.17]"
        />
      </div>

      {/* wash the left side back to white so text always has a clean ground */}
      <div className="absolute inset-0 bg-gradient-to-r from-white via-white/92 to-transparent" />
      <div className="absolute inset-y-0 right-0 w-[22vw] bg-gradient-to-l from-white/70 to-transparent" />
    </div>
  );
}
