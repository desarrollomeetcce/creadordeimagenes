export type ReasoningLevel = "low" | "medium" | "high";
export type DesignMode = "professional" | "editable";
export function reasoningLevel(value: unknown): ReasoningLevel {
  return value === "low" || value === "high" ? value : "medium";
}
// Only documented families receive provider-specific reasoning parameters.
// https://developers.openai.com/api/docs/guides/reasoning
// https://ai.google.dev/gemini-api/docs/thinking
export function openAIThinking(
  model: string,
  level: ReasoningLevel,
  structured: boolean,
) {
  if (!/^gpt-5(?:$|[-.])/.test(model))
    return { max_output_tokens: structured ? 3500 : 1200 };
  return {
    reasoning: { effort: level },
    max_output_tokens: { low: 3072, medium: 6144, high: 12288 }[level],
  };
}
export function googleThinking(model: string, level: ReasoningLevel) {
  if (/^gemini-2\.5-(?:pro|flash)/.test(model)) {
    const budget = { low: 512, medium: 1536, high: 4096 }[level];
    return {
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingBudget: budget },
    };
  }
  if (/^gemini-3(?:\.|-)/.test(model)) {
    // Gemini 3.0 Pro has low/high only; medium uses its supported low level to avoid silently increasing effort.
    const mapped =
      /^gemini-3-pro(?:-|$)/.test(model) && level === "medium" ? "low" : level;
    return {
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingLevel: mapped },
    };
  }
  return { maxOutputTokens: 8192 };
}
