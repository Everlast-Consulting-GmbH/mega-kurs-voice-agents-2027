"use client";

export type SkyMood = "night" | "call" | "warm";

// Dark night sky, light only at the horizon, a faint dot raster in the lower half (mockup).
// Moods crossfade as stacked layers; the only motion is a slow breath of the horizon glow.
const LAYERS: Record<SkyMood, string> = {
  night: "radial-gradient(85% 62% at 50% 112%, #142632 0%, #0a141d 35%, #050a10 65%, #020407 100%)",
  call: "radial-gradient(85% 62% at 50% 112%, #192d38 0%, #0c1720 35%, #050a10 65%, #020407 100%)",
  warm: "radial-gradient(85% 62% at 50% 112%, #192c36 0%, #0c161e 35%, #050a10 65%, #020407 100%)",
};

export function Sky({ mood }: { mood: SkyMood }) {
  return (
    <div className="absolute inset-0 overflow-hidden" data-testid="sky" data-mood={mood} style={{ background: "#020407" }}>
      <div className="sky-breath absolute inset-0">
        {(Object.keys(LAYERS) as SkyMood[]).map((m) => (
          <div key={m} className="absolute inset-0" style={{ background: LAYERS[m], opacity: m === mood ? 1 : 0, transition: "opacity 1.4s ease" }} />
        ))}
      </div>
      <div className="sky-dots absolute inset-0" />
    </div>
  );
}
