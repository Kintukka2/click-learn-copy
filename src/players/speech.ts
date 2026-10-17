// Optional narration with the Web Speech API (speechSynthesis) in the process language.

export function speechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const base = lang.toLowerCase().split(/[-_]/)[0];
  return (
    voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase() && v.localService) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(base) && v.localService) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(base))
  );
}

/** Speak text; resolves when finished, cancelled, or after a safety timeout. */
export function speak(text: string, lang: string, rate = 1): Promise<void> {
  if (!speechAvailable() || !text.trim()) return Promise.resolve();
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = Math.max(0.5, Math.min(2, rate));
    const v = pickVoice(lang);
    if (v) u.voice = v;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    u.onend = finish;
    u.onerror = finish;
    // Safety net: some engines never fire onend. ~ 70 ms per character at rate 1, capped.
    window.setTimeout(finish, Math.min(30000, 1500 + (text.length * 70) / u.rate));
    synth.speak(u);
  });
}

export function stopSpeaking() {
  if (speechAvailable()) window.speechSynthesis.cancel();
}
