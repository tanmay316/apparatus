// src/utils/audio.ts

export function playSuccessChime() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Play a pleasant double-chime (C6 then E6)
    const playNote = (frequency: number, startTime: number, duration: number) => {
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, startTime);
      
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.05); // attack
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration); // decay
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };

    const now = audioCtx.currentTime;
    playNote(1046.50, now, 0.4); // C6
    playNote(1318.51, now + 0.15, 0.6); // E6
    
  } catch (err) {
    console.warn("AudioContext not supported or failed to play sound", err);
  }
}
