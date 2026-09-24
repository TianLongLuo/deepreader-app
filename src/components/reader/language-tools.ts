export type SourceLanguage = 'en' | 'es';
export function validSourceLanguage(value: string | null): SourceLanguage | null {
  return value === 'en' || value === 'es' ? value : null;
}
export function sentencePatternHint(language: SourceLanguage) {
  return language === 'es'
    ? 'Sujeto explícito / tácito · verbo conjugado · complementos · orden flexible'
    : 'SV / SVC / SVO / SVOO / SVOC';
}
export async function speakInBrowser(text: string, language: SourceLanguage) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window))
    throw new Error('此浏览器不支持朗读，请使用支持语音的浏览器。');
  const synth = window.speechSynthesis;
  let voices = synth.getVoices();
  if (!voices.length) {
    await new Promise<void>(resolve => {
      const done = () => { clearTimeout(timer); synth.removeEventListener('voiceschanged', done); resolve(); };
      const timer = setTimeout(done, 1200);
      synth.addEventListener('voiceschanged', done);
    });
    voices = synth.getVoices();
  }
  const voice = voices.find(item => item.lang.toLowerCase().replace('_','-').split('-')[0] === language);
  if (!voice) throw new Error(`此设备没有${language === 'es' ? '西班牙语' : '英语'}语音，请在系统中安装对应语音后重试。`);
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = voice.lang;
  utterance.voice = voice;
  await new Promise<void>((resolve, reject) => {
    utterance.onend = () => resolve();
    utterance.onerror = () => reject(new Error('朗读失败，请检查设备语音设置后重试。'));
    synth.cancel();
    synth.speak(utterance);
  });
}
