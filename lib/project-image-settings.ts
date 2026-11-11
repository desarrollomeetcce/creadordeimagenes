import type { ModelCapability } from "./providers";
type Capability = Pick<ModelCapability, "qualities" | "resolutions">;
export type ImagePreferences = { quality?: string; resolution?: string };
/** Project overrides are optional. Unsupported legacy values inherit current AI settings. */
export function compatibleImageOverrides<T extends ImagePreferences>(
  settings: T,
  capability?: Capability,
): T {
  const next = { ...settings };
  // A disconnected catalog must not erase historical project preferences.
  if (!capability) return next;
  if (next.quality && !capability.qualities.includes(next.quality))
    delete next.quality;
  if (next.resolution && !capability.resolutions.includes(next.resolution))
    delete next.resolution;
  return next;
}
/** Never pick the first option: inherit only the explicit, supported global setting. */
export function effectiveImageOptions(
  settings: ImagePreferences,
  capability: Capability,
  defaults: ImagePreferences,
): ImagePreferences {
  const override = compatibleImageOverrides(settings, capability);
  return {
    quality:
      override.quality ||
      (defaults.quality && capability.qualities.includes(defaults.quality)
        ? defaults.quality
        : undefined),
    resolution:
      override.resolution ||
      (defaults.resolution &&
      capability.resolutions.includes(defaults.resolution)
        ? defaults.resolution
        : undefined),
  };
}
