export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        error: "GEMINI_API_KEY is missing."
      });
    }

    const body = req.body || {};

    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : "";

    const history =
      Array.isArray(body.history)
        ? body.history
        : [];

    const images =
      Array.isArray(body.images)
        ? body.images
        : [];

    if (!message && images.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "Message or attachment is required."
      });
    }

    const contents = [];

    /*
     * Previous conversation
     */
    for (const item of history) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const text =
        typeof item.content === "string"
          ? item.content.trim()
          : "";

      if (!text) {
        continue;
      }

      contents.push({
        role:
          item.role === "assistant"
            ? "model"
            : "user",

        parts: [
          {
            text
          }
        ]
      });
    }

    /*
     * Current message
     */
    const parts = [];

    if (message) {
      parts.push({
        text: message
      });
    }

    /*
     * Images
     */
    for (const image of images) {
      if (
        !image ||
        typeof image !== "object" ||
        !image.data ||
        !image.mimeType
      ) {
        continue;
      }

      const mimeType =
        String(image.mimeType);

      /*
       * Gemini multimodal image input
       */
      if (mimeType.startsWith("image/")) {
        parts.push({
          inline_data: {
            mime_type: mimeType,
            data: String(image.data)
          }
        });
      }
    }

    /*
     * If only an image was uploaded
     */
    if (!message && parts.length > 0) {
      parts.push({
        text:
          "Analyze the uploaded image carefully and explain what you see."
      });
    }

    contents.push({
      role: "user",
      parts
    });

    /*
     * Stable multimodal Gemini model
     */
    const model = "gemini-2.5-flash";

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const response = await fetch(url, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },

      body: JSON.stringify({
        contents,

        systemInstruction: {
          parts: [
            {
              text:
                "You are RG Creator AI, a helpful AI assistant for creators. " +
                "Answer clearly and naturally. " +
                "Do not use unnecessary emojis. " +
                "When an image is provided, analyze it instead of ignoring it. " +
                "Help with general questions, content writing, YouTube, Instagram, coding and image understanding."
            }
          ]
        },

        generationConfig: {
          maxOutputTokens: 4096
        }
      })
    });

    const raw = await response.text();

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(502).json({
        ok: false,
        error: "Invalid response from Gemini."
      });
    }

    /*
     * Gemini API error
     */
    if (!response.ok) {
      let error =
        data?.error?.message ||
        "Gemini API request failed.";

      if (
        response.status === 429 ||
        /quota|rate.?limit|resource.?exhausted/i.test(error)
      ) {
        error =
          "Gemini free quota/limit reached. Billing has not been enabled.";
      }

      return res.status(response.status).json({
        ok: false,
        error
      });
    }

    /*
     * Extract Gemini response
     */
    let reply = "";

    const candidates =
      Array.isArray(data?.candidates)
        ? data.candidates
        : [];

    for (const candidate of candidates) {
      const responseParts =
        Array.isArray(candidate?.content?.parts)
          ? candidate.content.parts
          : [];

      for (const part of responseParts) {
        if (typeof part?.text === "string") {
          reply += part.text;
        }
      }
    }

    reply = reply.trim();

    if (!reply) {
      return res.status(502).json({
        ok: false,
        error: "Gemini returned an empty response."
      });
    }

    return res.status(200).json({
      ok: true,
      reply
    });

  } catch (error) {
    console.error("RG Creator AI API ERROR:", error);

    return res.status(500).json({
      ok: false,
      error:
        error?.message ||
        "Internal server error."
    });
  }
}
