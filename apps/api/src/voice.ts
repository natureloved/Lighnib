/**
 * voice.ts, Web Speech API wrapper config.
 *
 * Speech happens CLIENT-side in the browser (window.speechSynthesis).
 * The API only serves the text + voice plan. Honestly labelled: there is
 * NO dedicated Pidgin TTS, an English voice reads Pidgin text.
 * Mute/replay are client controls.
 */

export const VOICE_CONFIG = {
  engine: "Web Speech API (browser speechSynthesis)",
  /** Honest label, shown in the UI next to every spoken receipt. */
  label:
    "Spoken readout: English voice reading Pidgin text (Web Speech API). No dedicated Pidgin voice.",
  lang: "en-NG",
  rate: 0.95,
  pitch: 1,
  controls: ["mute", "replay"] as const,
} as const;

export interface SpeakPlan {
  text: string;
  lang: string;
  rate: number;
  pitch: number;
  label: string;
}

/** Build the speak plan for a receipt explainer text. */
export function speakPlan(explainerText: string): SpeakPlan {
  return {
    text: explainerText,
    lang: VOICE_CONFIG.lang,
    rate: VOICE_CONFIG.rate,
    pitch: VOICE_CONFIG.pitch,
    label: VOICE_CONFIG.label,
  };
}
