import React, { useRef, useState } from 'react';
import { Volume2, VolumeX, SkipForward } from 'lucide-react';

export default function IntroVideo({ onComplete }) {
  const videoRef = useRef(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isFading, setIsFading] = useState(false);

  const handleFinish = () => {
    if (isFading) return;
    setIsFading(true);
    setTimeout(() => {
      onComplete();
    }, 300);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-black flex items-center justify-center transition-opacity duration-300 ${
        isFading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <video
        ref={videoRef}
        src="/intro-video.mp4"
        autoPlay
        muted={isMuted}
        playsInline
        onEnded={handleFinish}
        onError={handleFinish}
        className="w-full h-full object-contain"
      />

      <div className="fixed bottom-6 right-6 flex items-center gap-3 z-10">
        <button
          type="button"
          onClick={toggleMute}
          aria-label={isMuted ? 'Unmute intro video' : 'Mute intro video'}
          className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/20 text-white transition"
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={handleFinish}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/20 text-white text-xs font-semibold tracking-wide transition"
        >
          <span>Skip Intro</span>
          <SkipForward className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
