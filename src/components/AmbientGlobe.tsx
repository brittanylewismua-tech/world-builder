/* eslint-disable @next/next/no-img-element */

/**
 * The ambient globe.
 *
 * A very large globe entering from the right edge, fixed so it does not
 * scroll, turning slowly behind the whole workspace. Content cards float above
 * it in true white — that contrast is what stops the app reading as a flat
 * page and gives the product depth.
 *
 * Readability is protected by a scrim that washes the globe back to the page
 * colour underneath the reading column, so the text always sits on clean
 * ground while the right third of the screen stays alive. Motion stops
 * entirely for anyone who has asked for reduced motion.
 */
export default function AmbientGlobe() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {/* bloom so the globe sits in light rather than floating on nothing */}
      <div className="absolute -right-[10vw] top-1/2 h-[120vh] w-[120vh] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(238,111,192,0.26),rgba(238,111,192,0.09)_46%,transparent_68%)] blur-3xl" />

      <div className="globe-drift absolute -right-[16vw] top-1/2 -translate-y-1/2">
        <img
          src="/globe.png"
          alt=""
          className="globe-turn h-[112vh] w-[112vh] max-w-none opacity-[0.42]"
        />
      </div>

      {/*
        Wash the reading side back to the page colour. Hard to ~52% so body
        copy never sits on continents, then release quickly so the globe reads
        at full strength on the right.
      */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#fcfaf9_0%,#fcfaf9_46%,rgba(252,250,249,0.82)_58%,rgba(252,250,249,0.28)_72%,transparent_86%)]" />
    </div>
  );
}
