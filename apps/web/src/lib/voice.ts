/**
 * voice.ts — Web Speech API wrapper (client-side only).
 *
 * Honestly labelled: there is NO dedicated Pidgin TTS. An English voice
 * (en-NG where available) reads Pidgin text aloud. Mute/replay controls
 * are the UI's job; this module just speaks or stays silent.
 */

"use client";

export const VOICE_LABEL =
  "Spoken readout: English voice reading Pidgin text (Web Speech API). No dedicated Pidgin voice.";

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speak(text: string, opts?: { rate?: number; pitch?: number }): boolean {
  if (!speechSupported()) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-NG";
  u.rate = opts?.rate ?? 0.95;
  u.pitch = opts?.pitch ?? 1;
  window.speechSynthesis.speak(u);
  return true;
}

export function stopSpeaking(): void {
  if (speechSupported()) window.speechSynthesis.cancel();
}
