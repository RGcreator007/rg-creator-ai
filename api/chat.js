const MODEL = "gemini-3.6-flash";

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
     * RG Creator AI system instruction
     */
    const systemInstruction = {
      parts: [
        {
          text: `
You are RG Creator AI.

You are a helpful, intelligent and natural AI assistant.

Answer the user's questions clearly and directly.
Do not add emojis to every response. Use emojis only when they are genuinely useful.

If the user provides an image:
- Actually analyze the image.
- Identify visible objects, people, text, scenes, designs or other relevant details.
- Answer the user's question based on the image.
- If the user asks what is in the image, describe it.
- If the user asks to read text from the image, extract the visible text.
- If the user asks for an opinion about the image, provide a useful answer.
- Never pretend that an image was not provided when image data is available.

If the user asks for code, provide clean and useful code.
If the user asks for explanations, explain in a simple way.

You are RG Creator AI, not Gemini. Do not unnecessarily mention the underlying model.
          `.trim()
        }
      ]
    };

    /*
     * Build conversation history
     */
    const contents = [];

    for (const item of history) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const content =
        typeof item.content === "string"
          ? item.content.trim()
          : "";

      if (!content) {
        continue;
      }

      let role = "user";

      if (item.role === "assistant" || item.role === "model") {
        role = "model";
      }

      contents.push({
        role,
        parts: [
          {
            text: content
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
     * Add uploaded images as real inline image data.
     *
     * Frontend sends:
     * {
     *   mimeType: "image/jpeg",
     *   data: "BASE64_DATA"
     * }
     */
    for (const image of images) {
      if (!image || typeof image !== "object") {
        continue;
      }

      if (
        typeof image.data !== "string" ||
        !image.data.trim()
      ) {
        continue;
      }

      let mimeType =
        typeof image.mimeType === "string"
          ? image.mimeType
          : "image/jpeg";

      /*
       * Only allow image MIME types here.
       */
      if (!mimeType.startsWith("image/")) {
        mimeType = "image/jpeg";
      }

      let base64Data =
        image.data.trim();

      /*
       * Support both:
       * BASE64_ONLY
       *
       * and:
       * data:image/jpeg;base64,XXXX
       */
      if (
        base64Data.startsWith("data:")
      ) {
        const commaIndex =
          base64Data.indexOf(",");

        if (commaIndex !== -1) {
          const header =
            base64Data.substring(
              0,
              commaIndex
            );

          const data =
            base64Data.substring(
              commaIndex + 1
            );

          base64Data = data;

          const detectedMime =
            header.match(
              /^data:([^;]+);base64$/i
            );

          if (
            detectedMime &&
            detectedMime[1] &&
            detectedMime[1].startsWith(
              "image/"
            )
          ) {
            mimeType =
              detectedMime[1];
          }
        }
      }

      currentParts.push({
        inline_data: {
          mime_type: mimeType,
          data: base64Data
        }
      });
    }

    if (currentParts.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "No valid message or image data was received."
      });
    }

    contents.push({
      role: "user",
      parts: currentParts
    });

    /*
     * Gemini API request
     */
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

    const response =
      await fetch(
        url,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "x-goog-api-key":
              apiKey
          },

          body: JSON.stringify({
            systemInstruction,

            contents,

            generationConfig: {
              temperature: 0.8,
              topP: 0.95,
              maxOutputTokens: 2048
            }
          })
        }
      );

    const data =
      await response.json();

    /*
     * Gemini API error
     */
    if (!response.ok) {
      console.error(
        "Gemini API error:",
        JSON.stringify(data)
      );

      if (response.status === 429) {
        return res.status(429).json({
          ok: false,
          error:
            "Gemini free limit has been reached. Please try again later."
        });
      }

      if (response.status === 400) {
        return res.status(400).json({
          ok: false,
          error:
            data?.error?.message ||
            "Invalid Gemini request."
        });
      }

      if (response.status === 401) {
        return res.status(401).json({
          ok: false,
          error:
            "Gemini API key is invalid or unavailable."
        });
      }

      return res.status(response.status).json({
        ok: false,
        error:
          data?.error?.message ||
          "Gemini API request failed."
      });
    }

    /*
     * Extract Gemini response
     */
    const candidate =
      data?.candidates?.[0];

    const parts =
      candidate?.content?.parts;

    let reply = "";

    if (Array.isArray(parts)) {
      reply =
        parts
          .map(
            part =>
              typeof part?.text === "string"
                ? part.text
                : ""
          )
          .join("")
          .trim();
    }

    /*
     * Handle blocked/empty response
     */
    if (!reply) {
      const finishReason =
        candidate?.finishReason ||
        "";

      console.error(
        "Empty Gemini response:",
        JSON.stringify(data)
      );

      return res.status(502).json({
        ok: false,
        error:
          finishReason
            ? `Gemini did not return a text response. Reason: ${finishReason}`
            : "Gemini returned an empty response."
      });
    }

    /*
     * Send successful response to frontend
     */
    return res.status(200).json({
      ok: true,
      reply
    });

  } catch (error) {
    console.error(
      "RG Creator AI API error:",
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
