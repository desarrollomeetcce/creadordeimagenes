import type { ModelCapability, ImageInput } from "./index";
import { demand } from "../errors";
type RecordValue = Record<string, any>;
const object = (v: any): RecordValue =>
  v && typeof v === "object" && !Array.isArray(v) ? v : {};
function resolve(raw: any, root: RecordValue, depth = 0): RecordValue {
  if (depth > 8) return {};
  const value = object(raw);
  if (typeof value.$ref === "string") {
    const path = value.$ref.split("/");
    if (path[0] !== "#" || path.length > 8) return {};
    let ref: any = root;
    for (const part of path.slice(1))
      ref = object(ref)[part.replace(/~1/g, "/").replace(/~0/g, "~")];
    return resolve(ref, root, depth + 1);
  }
  if (Array.isArray(value.allOf))
    return value.allOf.reduce((merged: RecordValue, v: any) => {
      const next = resolve(v, root, depth + 1);
      return {
        ...merged,
        ...next,
        properties: {
          ...object(merged.properties),
          ...object(next.properties),
        },
        required: [...(merged.required ?? []), ...(next.required ?? [])],
      };
    }, value);
  return value;
}
function enums(raw: any, root: RecordValue): string[] {
  const v = resolve(raw, root);
  return [
    ...new Set(
      (Array.isArray(v.enum) ? v.enum : [])
        .concat(
          ...(v.anyOf ?? v.oneOf ?? []).map(
            (x: any) => resolve(x, root).enum ?? [],
          ),
        )
        .filter((x: any) => typeof x === "string" && x.length <= 30),
    ),
  ] as string[];
}
export function imageCapability(
  id: string,
  label: string,
  schema: unknown,
  version?: string,
): ModelCapability | null {
  const root = object(schema);
  let input: any = root.components?.schemas?.Input;
  if (!input)
    for (const entry of Object.values(object(root.paths)) as RecordValue[]) {
      input = entry.post?.requestBody?.content?.["application/json"]?.schema;
      if (input) break;
    }
  if (!input)
    input = Object.entries(object(root.components?.schemas)).find(([name]) =>
      /Input$/.test(name),
    )?.[1];
  const resolved = resolve(input, root),
    props = object(resolved.properties);
  if (resolve(props.prompt, root).type !== "string") return null;
  const binding: RecordValue = {};
  const handled = new Set(["prompt"]);
  const imageField = [
    "image_urls",
    "input_images",
    "images",
    "image",
    "input_image",
    "image_url",
  ].find((field) => {
    const v = resolve(props[field], root);
    return v.type === "string" || v.type === "array";
  });
  if (imageField) {
    binding.imageField = imageField;
    binding.imageArray = resolve(props[imageField], root).type === "array";
    binding.maxReferences =
      resolve(props[imageField], root).type === "array"
        ? Math.min(9, resolve(props[imageField], root).maxItems ?? 9)
        : 1;
    binding.requiresReference = (resolved.required ?? []).includes(imageField);
    handled.add(imageField);
  }
  let resolutions: string[] = ["default"];
  for (const field of [
    "image_size",
    "aspect_ratio",
    "resolution",
    "image_resolution",
  ]) {
    const values = enums(props[field], root).filter(
      (x) => x !== "match_input_image" && x !== "match_input",
    );
    if (values.length) {
      binding.sizeField = field;
      resolutions = values;
      handled.add(field);
      break;
    }
  }
  if (!binding.sizeField && props.width && props.height) {
    const fits = (field: string, n: number) => {
      const v = resolve(props[field], root);
      return (
        ["integer", "number"].includes(v.type) &&
        n >= (v.minimum ?? 1) &&
        n <= (v.maximum ?? 4096) &&
        n % (v.multipleOf ?? 1) === 0
      );
    };
    resolutions = ["1024x1024", "1536x1024", "1024x1536"].filter((s) => {
      const [w, h] = s.split("x").map(Number);
      return fits("width", w) && fits("height", h);
    });
    if (!resolutions.length) return null;
    binding.dimensions = true;
    handled.add("width");
    handled.add("height");
  }
  let qualities: string[] = ["default"];
  for (const field of ["quality", "image_quality"]) {
    const values = enums(props[field], root);
    if (values.length) {
      qualities = values;
      binding.qualityField = field;
      handled.add(field);
      break;
    }
  }
  for (const field of ["num_images", "num_outputs", "batch_size"]) {
    if (props[field]) {
      const v = resolve(props[field], root);
      if ((v.minimum ?? 1) > 1 || (v.maximum ?? 1) < 1) return null;
      binding.countField = field;
      handled.add(field);
      break;
    }
  }
  if (props.output_format) {
    const values = enums(props.output_format, root);
    if (values.includes("png")) {
      binding.png = true;
      handled.add("output_format");
    }
  }
  for (const field of resolved.required ?? []) {
    if (
      !handled.has(field) &&
      resolve(props[field], root).default === undefined
    )
      return null;
  }
  if (version) binding.version = version;
  return {
    id,
    label: label.slice(0, 150),
    kind: "image",
    qualities,
    resolutions,
    supportsReferences: !!imageField,
    binding,
  };
}
export function imageArguments(args: {
  prompt: string;
  quality: string;
  size: string;
  images?: ImageInput[];
  capability?: ModelCapability;
}) {
  const cap = args.capability;
  demand(
    cap?.kind === "image" && cap.binding,
    "Consulta y selecciona un modelo compatible antes de generar.",
    409,
  );
  demand(
    cap.qualities.includes(args.quality) && cap.resolutions.includes(args.size),
    "Los parámetros no son compatibles con el modelo seleccionado.",
  );
  const b = cap.binding,
    images = args.images ?? [];
  demand(
    !images.length || b.imageField,
    "Este modelo no admite referencias. Elige otro modelo compatible antes de generar.",
  );
  demand(
    !b.requiresReference || images.length,
    "Este modelo requiere una imagen de referencia.",
  );
  demand(
    b.imageArray || images.length <= 1,
    "Este modelo admite una sola referencia por imagen.",
  );
  demand(
    images.length <= Number(b.maxReferences ?? 9),
    "El modelo no admite tantas imágenes de referencia.",
  );
  const input: RecordValue = { prompt: args.prompt };
  if (typeof b.sizeField === "string") input[b.sizeField] = args.size;
  if (b.dimensions) {
    const [width, height] = args.size.split("x").map(Number);
    input.width = width;
    input.height = height;
  }
  if (typeof b.qualityField === "string") input[b.qualityField] = args.quality;
  if (typeof b.countField === "string") input[b.countField] = 1;
  if (b.png) input.output_format = "png";
  if (images.length && typeof b.imageField === "string") {
    const values = images.map(
      (image) => `data:${image.mime};base64,${image.bytes.toString("base64")}`,
    );
    input[b.imageField] = b.imageArray ? values : values[0];
  }
  return input;
}
