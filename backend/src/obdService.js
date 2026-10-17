const API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.6-flash";
const OBD_CODE_PATTERN = /^[PBCU][0-3][0-9A-F]{3}$/;
const LANGUAGE_PATTERN = /^[\p{L}\p{M}\s().'-]{2,40}$/u;

function normalizeLanguage(value) {
  const language = typeof value === "string" ? value.trim() : "";
  return LANGUAGE_PATTERN.test(language) ? language : "English";
}

function getApiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "replace_with_your_key") {
    const error = new Error("OBD lookup service is not configured.");
    error.statusCode = 503;
    throw error;
  }
  return key;
}

async function generateContent(parts, { maxOutputTokens = 2048 } = {}) {
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `${API_URL}/${encodeURIComponent(model)}:generateContent`;
  let payload;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": getApiKey()
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          thinkingConfig: { thinkingLevel: "low" },
          maxOutputTokens: maxOutputTokens * (2 ** attempt)
        }
      }),
      signal: AbortSignal.timeout(45000)
    });

    payload = await response.json().catch(() => ({}));
    if (response.ok) {
      if (payload?.candidates?.[0]?.finishReason !== "MAX_TOKENS") break;
      if (attempt < 2) continue;
      const error = new Error("Gemini's answer was truncated. Retry with a shorter file.");
      error.statusCode = 502;
      error.publicMessage = error.message;
      throw error;
    }

    const retryable = [408, 429, 500, 502, 503, 504].includes(response.status);
    if (retryable && attempt < 2) {
      const delay = 700 * (2 ** attempt) + Math.floor(Math.random() * 300);
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }

    const providerMessage = payload?.error?.message || `Gemini returned ${response.status}`;
    const error = new Error(providerMessage);
    error.statusCode = response.status === 429 || response.status === 503 ? 503 : 502;
    error.publicMessage = error.statusCode === 503
      ? "Gemini is temporarily busy or rate-limited. Please try again shortly."
      : `Gemini rejected this request: ${providerMessage}`;
    throw error;
  }

  const result = payload?.candidates?.[0]?.content?.parts
    ?.filter((part) => part.text && !part.thought)
    ?.map((part) => part.text)
    .join("\n")
    .trim();
  if (!result) {
    const error = new Error("Gemini did not return a usable answer.");
    error.statusCode = 502;
    throw error;
  }
  return result;
}

export function extractCodesFromText(text) {
  const found = text.match(/\b[PBCU][0-3][0-9A-F]{3}\b/gi) || [];
  return [...new Set(found.map((code) => code.toUpperCase()))].slice(0, 25);
}

export async function extractCodesFromAttachment(file) {
  const isText = /\.(txt|csv|log)$/i.test(file.originalname);
  if (isText) {
    const text = file.buffer.toString("utf8").replace(/\u0000/g, " ");
    return extractCodesFromText(text);
  }

  const prompt = [
    "Read the attached vehicle diagnostic document or image.",
    "Find every explicit 5-character OBD-II diagnostic trouble code shown in it.",
    "Return only a JSON object with this shape: {\"codes\":[\"P0300\"]}.",
    "Use uppercase letters, include no codes that are not visible or readable,",
    "deduplicate them, and return {\"codes\":[]} if none are present."
  ].join(" ");
  const text = await generateContent([
    { text: prompt },
    {
      inline_data: {
        mime_type: file.mimetype,
        data: file.buffer.toString("base64")
      }
    }
  ], { maxOutputTokens: 2048 });

  let parsed;
  try {
    const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    parsed = JSON.parse(jsonText);
  } catch {
    const error = new Error("The diagnostic file could not be read. Try a clearer file.");
    error.statusCode = 422;
    throw error;
  }

  if (!Array.isArray(parsed.codes)) {
    const error = new Error("The diagnostic file did not return a valid code list.");
    error.statusCode = 422;
    throw error;
  }

  const codes = parsed.codes
    .filter((value) => typeof value === "string")
    .map((code) => code.toUpperCase().trim())
    .filter((code) => OBD_CODE_PATTERN.test(code));
  return [...new Set(codes)].slice(0, 25);
}

export async function lookupObdMeaning(code, requestedLanguage = "English") {
  const normalized = String(code).trim().toUpperCase();
  if (!OBD_CODE_PATTERN.test(normalized)) {
    const error = new Error("Enter a valid 5-character OBD-II code, such as P0300.");
    error.statusCode = 400;
    throw error;
  }

  const language = normalizeLanguage(requestedLanguage);
  const prompt = [
    `Explain OBD-II diagnostic trouble code ${normalized}.`,
    `Write the complete explanation in ${language}; if the requested language is Hinglish, use conversational Hindi written in Latin script.`,
    "Use these short sections, translating each heading naturally into the requested language:",
    "Code breakdown (explain the letter and each relevant digit/group using standard OBD-II conventions),",
    "Meaning, Error indicated, Common causes, Possible symptoms.",
    "Explain what condition the vehicle computer detected and why it may occur.",
    "Clarify that a code does not prove a specific part failed; mention where interpretation can vary by make/model/year.",
    "Do not invent vehicle-specific details, repairs, or certainty beyond the code definition."
  ].join(" ");

  return generateContent([{ text: prompt }]);
}

export async function explainCodes(codes, language = "English") {
  const results = new Array(codes.length);
  let nextIndex = 0;
  const workerCount = Math.min(4, codes.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < codes.length) {
      const index = nextIndex++;
      const code = codes[index];
      results[index] = { code, meaning: await lookupObdMeaning(code, language) };
    }
  }));
  return results;
}
