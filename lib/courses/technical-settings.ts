import { settingsSchema } from "./schema";

export const technicalSettingsSchema = settingsSchema.pick({
  provider: true,
  model: true,
  voiceProvider: true,
  voiceModel: true,
  voiceId: true,
  voiceSpeed: true,
  imageProvider: true,
  imageModel: true,
  imageQuality: true,
  videoProvider: true,
  videoModel: true,
  videoResolution: true,
  exportResolution: true,
});
export function technicalSettings(value: unknown) {
  const settings = settingsSchema.parse(value);
  return technicalSettingsSchema.parse(
    Object.fromEntries(
      Object.keys(technicalSettingsSchema.shape).map((key) => [
        key,
        settings[key as keyof typeof settings],
      ]),
    ),
  );
}
/** New courses inherit technical choices only. Existing courses keep their own settings. */
export function initialCourseSettings(value: unknown) {
  return settingsSchema.parse({ ...technicalSettings(value) });
}
