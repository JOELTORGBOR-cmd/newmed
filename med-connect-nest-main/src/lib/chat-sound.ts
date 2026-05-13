const KEY = "chat_sound_enabled";
export const isSoundEnabled = () =>
  typeof window !== "undefined" && localStorage.getItem(KEY) !== "0";
export const setSoundEnabled = (v: boolean) => {
  if (typeof window !== "undefined") localStorage.setItem(KEY, v ? "1" : "0");
};
let ctx: AudioContext | null = null;
export function playPing() {
  if (!isSoundEnabled() || typeof window === "undefined") return;
  try {
    ctx = ctx || new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.05;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.12);
  } catch {}
}
