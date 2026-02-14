export type VibeTheme = "calm" | "neon" | "dark" | "light";
export type Visibility = "private" | "friends" | "public";
export type SpaceObject = "shapes" | "cards" | "widgets";

export type CustomizationState = {
  theme: VibeTheme;
  moodTags: string[];
  objects: Record<SpaceObject, boolean>;
  visibility: Visibility;
};

const KEY = "vibe.customization.v1";

export const MOOD_TAGS = ["Calm", "Loud", "Creative", "Minimal", "Chaotic", "Focused"] as const;

export const DEFAULT_CUSTOMIZATION: CustomizationState = {
  theme: "calm",
  moodTags: [],
  objects: { shapes: false, cards: false, widgets: false },
  visibility: "private"
};

function keyForAddress(address?: string): string {
  if (!address) return `${KEY}.guest`;
  return `${KEY}.${address.toLowerCase()}`;
}

export function loadCustomization(address?: string): CustomizationState {
  try {
    const raw = localStorage.getItem(keyForAddress(address));
    if (!raw) return DEFAULT_CUSTOMIZATION;
    const parsed = JSON.parse(raw) as Partial<CustomizationState>;
    return {
      ...DEFAULT_CUSTOMIZATION,
      ...parsed,
      moodTags: Array.isArray(parsed.moodTags) ? parsed.moodTags : [],
      objects: { ...DEFAULT_CUSTOMIZATION.objects, ...(parsed.objects ?? {}) }
    };
  } catch {
    return DEFAULT_CUSTOMIZATION;
  }
}

export function saveCustomization(state: CustomizationState, address?: string) {
  localStorage.setItem(keyForAddress(address), JSON.stringify(state));
}
