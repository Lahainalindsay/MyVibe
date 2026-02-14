"use client";

import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import {
  CustomizationState,
  loadCustomization,
  saveCustomization,
  VibeTheme,
  Visibility,
  SpaceObject
} from "./customization";

function applyTheme(theme: VibeTheme) {
  const root = document.documentElement;

  const THEMES: Record<VibeTheme, string> = {
    calm:
      "radial-gradient(1200px 800px at 50% 10%, rgba(160, 110, 255, 0.22), rgba(0,0,0,0)), radial-gradient(900px 700px at 20% 60%, rgba(90, 110, 255, 0.14), rgba(0,0,0,0)), radial-gradient(800px 600px at 80% 70%, rgba(160, 110, 255, 0.10), rgba(0,0,0,0)), linear-gradient(180deg, rgba(10, 8, 18, 1), rgba(0,0,0,1))",
    neon:
      "radial-gradient(1100px 800px at 40% 15%, rgba(180, 70, 255, 0.28), rgba(0,0,0,0)), radial-gradient(900px 700px at 75% 65%, rgba(90, 200, 255, 0.18), rgba(0,0,0,0)), linear-gradient(180deg, rgba(8, 8, 16, 1), rgba(0,0,0,1))",
    dark:
      "radial-gradient(1000px 700px at 55% 18%, rgba(120, 80, 210, 0.18), rgba(0,0,0,0)), linear-gradient(180deg, rgba(8, 8, 12, 1), rgba(0,0,0,1))",
    light:
      "radial-gradient(1200px 800px at 50% 10%, rgba(160, 110, 255, 0.18), rgba(0,0,0,0)), linear-gradient(180deg, rgba(16, 14, 22, 1), rgba(0,0,0,1))"
  };

  root.style.setProperty("--vibe-bg", THEMES[theme]);
}

export function useCustomization(address?: Address) {
  const [state, setState] = useState<CustomizationState>(() => DEFAULT(address));

  function DEFAULT(currentAddress?: Address) {
    return typeof window === "undefined" ? ({} as CustomizationState) : loadCustomization(currentAddress);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    setState(loadCustomization(address));
  }, [address]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!state.theme) return;
    saveCustomization(state, address);
    applyTheme(state.theme);
  }, [state, address]);

  const api = useMemo(
    () => ({
      state,
      setTheme: (theme: VibeTheme) => setState((s) => ({ ...s, theme })),
      toggleMoodTag: (tag: string) =>
        setState((s) => {
          const on = s.moodTags.includes(tag);
          return { ...s, moodTags: on ? s.moodTags.filter((t) => t !== tag) : [...s.moodTags, tag] };
        }),
      toggleObject: (obj: SpaceObject) =>
        setState((s) => ({ ...s, objects: { ...s.objects, [obj]: !s.objects[obj] } })),
      setVisibility: (visibility: Visibility) => setState((s) => ({ ...s, visibility }))
    }),
    [state]
  );

  return api;
}
