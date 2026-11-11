import { ProviderHTTPError } from "./providers/http";

export const nativeDirectionWarning =
  "Dirección creativa no disponible (404). Imagen generada con tus instrucciones originales y el modelo de imagen seleccionado.";

type Plan = { text: string; usage: unknown; incomplete?: boolean };
/** Only flat native Gemini images can consume the original brief without a text plan.
 * Never repeat the rejected request, change models, or recover an interrupted call. */
export async function nativeImageDirection(
  options: {
    imageProvider: string;
    imageModel: string;
    creativeProvider: string;
    editable: boolean;
  },
  request: () => Promise<Plan>,
): Promise<Plan & { unavailable?: boolean }> {
  try {
    return await request();
  } catch (error) {
    if (
      !options.editable &&
      options.imageProvider === "google" &&
      options.creativeProvider === "google" &&
      /^gemini-/.test(options.imageModel) &&
      /image|nano-banana/.test(options.imageModel) &&
      error instanceof ProviderHTTPError &&
      error.upstreamStatus === 404
    ) {
      return { text: "", usage: null, incomplete: false, unavailable: true };
    }
    throw error;
  }
}
