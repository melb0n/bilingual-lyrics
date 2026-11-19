import "server-only";
import { ApiError, GoogleGenAI, type GenerateContentResponse, type Tool } from "@google/genai";

/** Which AI service the site uses: set AI_PROVIDER=gemini in Netlify to use Google Gemini. */
export const AI_PROVIDER: "anthropic" | "gemini" = process.env.AI_PROVIDER?.toLowerCase() === "gemini" ? "gemini" : "anthropic";

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

let client: GoogleGenAI | null = null;
export function gemini(): GoogleGenAI {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

export class GeminiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Gemini accepts plain JSON Schema; drop the keys only Anthropic's strict mode uses. */
function cleanSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(cleanSchema);
  if (schema && typeof schema === "object") {
    return Object.fromEntries(
      Object.entries(schema as Record<string, unknown>)
        .filter(([k]) => k !== "additionalProperties" && k !== "strict")
        .map(([k, v]) => [k, cleanSchema(v)]),
    );
  }
  return schema;
}

/** The first JSON object in a reply (replies with web tools are plain text). */
function parseJsonObject(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1];
  const candidate = fenced ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new GeminiError("Gemini didn't return a usable answer. Try again.", 502);
  return JSON.parse(candidate.slice(start, end + 1));
}

/** Web pages Gemini's Google Search actually used (redirect links that open the real page). */
export function groundingSources(response: GenerateContentResponse): { title: string; url: string }[] {
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  return chunks
    .map((c) => ({ title: c.web?.title ?? "", url: c.web?.uri ?? "" }))
    .filter((s) => /^https?:\/\//.test(s.url));
}

/**
 * Ask Gemini for a JSON object matching `schema`.
 * tools: "search" = Google Search, "url" = read URLs given in the prompt, undefined = none.
 */
export async function geminiJson<T>(opts: {
  system: string;
  prompt: string;
  schema: object;
  tools?: "search" | "url";
}): Promise<{ data: T; response: GenerateContentResponse }> {
  if (!process.env.GEMINI_API_KEY) {
    throw new GeminiError("GEMINI_API_KEY isn't set. Add it in Netlify's environment variables.", 500);
  }
  const tools: Tool[] | undefined =
    opts.tools === "search" ? [{ googleSearch: {} }] : opts.tools === "url" ? [{ urlContext: {} }] : undefined;
  const schema = cleanSchema(opts.schema);
  try {
    const response = await gemini().models.generateContent({
      model: GEMINI_MODEL,
      contents: tools
        ? `${opts.prompt}\n\nWhen you are done, reply with only a JSON object (no other text) matching this JSON Schema:\n${JSON.stringify(schema)}`
        : opts.prompt,
      config: {
        systemInstruction: opts.system,
        ...(tools ? { tools } : { responseMimeType: "application/json", responseJsonSchema: schema }),
      },
    });
    const text = response.text ?? "";
    if (!text.trim()) throw new GeminiError("Gemini returned an empty answer (it may have been blocked). Try again.", 502);
    return { data: (tools ? parseJsonObject(text) : JSON.parse(text)) as T, response };
  } catch (error) {
    if (error instanceof GeminiError) throw error;
    if (error instanceof SyntaxError) throw new GeminiError("Gemini's answer wasn't valid JSON. Try again.", 502);
    if (error instanceof ApiError) {
      if (error.status === 400 && /api key/i.test(error.message))
        throw new GeminiError("GEMINI_API_KEY is invalid. Check it in Netlify's environment variables.", 500);
      if (error.status === 401 || error.status === 403)
        throw new GeminiError("GEMINI_API_KEY is missing, invalid, or not allowed to use this model.", 500);
      if (error.status === 429)
        throw new GeminiError(
          `Gemini usage limit reached (free-tier rate limit or quota): ${error.message.slice(0, 160)} Wait a minute and try again, or check quotas in Google AI Studio.`,
          429,
        );
      if (error.status === 404)
        throw new GeminiError(`Gemini model "${GEMINI_MODEL}" wasn't found. Set GEMINI_MODEL in Netlify to a current model.`, 500);
      throw new GeminiError(`Gemini error (${error.status}): ${error.message.slice(0, 200)}`, 502);
    }
    throw error;
  }
}
