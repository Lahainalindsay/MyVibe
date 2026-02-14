"use client";
import React from "react";

export function CinematicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      <video
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster="/vibe-hero.jpg"
      >
        <source src="/vibe-hero.webm" type="video/webm" />
        <source src="/vibe-hero.mp4" type="video/mp4" />
      </video>

      {/* Luxury readability: dark vignette + gentle blur */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-black/35 to-black/70" />
      <div className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(circle_at_center,black_55%,transparent_100%)] bg-black/25" />

      <div className="relative z-10">{children}</div>
    </div>
  );
}

export default CinematicShell;
