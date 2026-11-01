export function fakeVideoModel(id = "fal-ai/wan/v2.7/text-to-video") {
  return {
    endpoint_id: id,
    metadata: { display_name: id },
    openapi: {
      components: {
        schemas: {
          Input: {
            type: "object",
            required: ["prompt"],
            properties: {
              prompt: { type: "string" },
              resolution: { type: "string", enum: ["480p", "720p"] },
              duration: { type: "string", enum: ["5", "10"] },
              aspect_ratio: { type: "string", enum: ["16:9", "9:16"] },
            },
          },
          Output: { type: "object", properties: { video: { type: "object" } } },
        },
      },
    },
  };
}
