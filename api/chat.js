export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        error: "GEMINI_API_KEY is not configured in Vercel Environment Variables."
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
        error: "Message or image is required."
      });
    }

    /*
     * =====================================================
     * RG CREATOR AI
     * Gemini chat + image understanding
     * =====================================================
     */

    const contents = [];

    /*
     * Existing conversation history
     */
    for (const item of history) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const role =
        item.role === "assistant"
          ? "model"
          : "user";

      const text =
        typeof item.content === "string"
          ? item.content.trim()
          : "";

      if (!text) {
        continue;
      }

      contents.push({
        role,
        parts: [
          {
            text
          }
        ]
      });
    }

    /*
     * Current user message
     */
    const currentParts = [];

    if (message) {
      currentParts.push({
        text: message
      });
    }

    /*
     * Image attachments
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
       * Gemini vision-compatible image types
       */
      if (
        !mimeType.startsWith("image/")
      ) {
        continue;
      }

      currentParts.push({
        inline_data: {
          mime_type: mimeType,
          data: String(image.data)
        }
      });
    }

    /*
     * If there is an image but no text,
     * give Gemini a useful instruction.
     */
    if (
      currentParts.length === 0 &&
      images.length > 0
    ) {
      currentParts.push({
        text:
          "Please analyze and describe the uploaded image. Explain what you see and answer any relevant question about it."
      });
    }

    contents.push({
      role: "user",
      parts: currentParts
    });

    /*
     * =====================================================
     * GEMINI REQUEST
     * =====================================================
     *
     * Use the current Gemini Flash model.
     *
     * Billing does NOT get enabled by this code.
     * If the Google project has billing disabled,
     * Gemini cannot automatically turn billing on.
     */

    const model =
      "gemini-3.6-flash";

    const endpoint =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      model +
      ":generateContent";

    const response =
      await fetch(
        endpoint,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "x-goog-api-key":
              apiKey
          },

          body:
            JSON.stringify({
              contents,

              systemInstruction: {
                parts: [
                  {
                    text:
                      [
                        "You are RG Creator AI.",
                        "You are a helpful AI assistant for creators.",
                        "Answer clearly and naturally.",
                        "Do not add unnecessary emojis.",
                        "Use emojis only when they genuinely help.",
                        "When the user uploads an image, actually analyze the image.",
                        "If the user asks about text inside an image, read and explain it when possible.",
                        "If the user asks for code, provide clean usable code.",
                        "For creator requests, help with YouTube, Instagram, content writing and ideas.",
                        "Do not claim you cannot see an uploaded image when image data was provided."
                      ].join(" ")
                  }
                ]
              },

              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 4096
              }
            })
        }
      );

    const rawText =
      await response.text();

    let data;

    try {
      data =
        JSON.parse(rawText);
    } catch {
      return res.status(502).json({
        ok: false,
        error:
          "Gemini returned an invalid response."
      });
    }

    /*
     * =====================================================
     * GEMINI ERROR
     * =====================================================
     */

    if (!response.ok) {
      let errorMessage =
        data?.error?.message ||
        "Gemini API request failed.";

      /*
       * Friendly quota message.
       */
      if (
        response.status === 429 ||
        /quota|rate.?limit|resource.?exhausted/i.test(
          errorMessage
        )
      ) {
        errorMessage =
          "Gemini free limit has been reached. Billing was not enabled. Please try again after the free quota resets.";
      }

      return res.status(response.status).json({
        ok: false,
        error: errorMessage
      });
    }

    /*
     * =====================================================
     * EXTRACT RESPONSE TEXT
     * =====================================================
     */

    const candidates =
      Array.isArray(data.candidates)
        ? data.candidates
        : [];

    let reply = "";

    for (const candidate of candidates) {
      const parts =
        Array.isArray(candidate?.content?.parts)
          ? candidate.content.parts
          : [];

      for (const part of parts) {
        if (
          typeof part?.text === "string"
        ) {
          reply += part.text;
        }
      }
    }

    reply =
      reply.trim();

    /*
     * Some Gemini responses may expose text
     * in another field.
     */
    if (!reply) {
      reply =
        typeof data.text === "string"
          ? data.text.trim()
          : "";
    }

    if (!reply) {
      return res.status(502).json({
        ok: false,
        error:
          "Gemini returned no text response."
      });
    }

    /*
     * =====================================================
     * SUCCESS
     * =====================================================
     */

    return res.status(200).json({
      ok: true,
      reply
    });

  } catch (error) {
    console.error(
      "RG Creator AI /api/chat error:",
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        error?.message ||
        "Internal server error."
    });
  }
}
