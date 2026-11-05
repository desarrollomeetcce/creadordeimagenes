import { demand } from "../errors";

// Both image generation and image editing accept up to 32,000 prompt characters.
// https://developers.openai.com/api/reference/resources/images/methods/generate
export const OPENAI_IMAGE_PROMPT_LIMIT = 32000;
export const promptCharacters = (text: string) => Array.from(text).length;
export function validateOpenAIImagePrompt(prompt: string) {
  const length = promptCharacters(prompt);
  demand(length > 0 && length <= OPENAI_IMAGE_PROMPT_LIMIT,
    length === 0
      ? "Las instrucciones de la imagen están vacías. No se envió la solicitud a OpenAI."
      : `Las instrucciones combinadas de la imagen tienen ${length} caracteres; OpenAI admite hasta ${OPENAI_IMAGE_PROMPT_LIMIT}. Revisa las instrucciones heredadas y los documentos de este subproducto. No se recortó tu contenido ni se envió esta solicitud de imagen a OpenAI.`,
    409,
  );
}
