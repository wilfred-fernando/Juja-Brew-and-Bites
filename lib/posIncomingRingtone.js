export function createIncomingRingtone(audio, target) {
  let active = false;
  audio.loop = true;
  audio.volume = 0.95;
  const play = () => {
    if (active && audio.paused) audio.play().catch(() => {});
  };
  const events = ["pointerdown", "keydown", "touchend"];
  return {
    start() {
      if (active) return;
      active = true;
      events.forEach((event) => target.addEventListener(event, play));
      play();
    },
    stop() {
      active = false;
      events.forEach((event) => target.removeEventListener(event, play));
      audio.pause();
      audio.currentTime = 0;
    },
  };
}
