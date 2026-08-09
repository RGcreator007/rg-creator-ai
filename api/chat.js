export default async function handler(req, res) {
  // CORS / response headers
  res.setHeader("Content-Type", "application/json");

  // Only POST is allowed
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method Not Allowed",
      details: "Use POST /api/chat"
    });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    // Check API key
    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured.",
        details:
          "Add GEMINI_API_KEY in Vercel Environment Variables and redeploy."
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

    const attachments =
      Array.isArray(body.attachments)
        ? body.attachments
        : [];

    if (!message && attachments.length === 0) {
      return res.status(400).json({
        error: "Message is required."
      });
    }

    /*
      Gemini conversation format:

      user      -> user
      assistant -> model
    */

    const contents = [];

    // Previous conversation
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

      let role = "user";

      if (item.role === "assistant") {
        role = "model";
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

    // Current user message
    const currentParts = [];

    if (message) {
      currentParts.push({
        text: message
      });
    }

    /*
      Image attachments

      Gemini REST API accepts inline_data
      for directly embedded media.
    */

    for (const file of attachments) {
      if (!file || typeof file !== "object") {
        continue;
      }

      const data =
        typeof file.data === "string"
          ? file.data
          : "";

      const mimeType =
        typeof file.type === "string"
          ? file.type
          : "application/octet-stream";

      if (!data) {
        continue;
      }

      // Avoid extremely large inline payloads
      if (data.length > 15_000_000) {
        continue;
      }

      if (
        mimeType.startsWith("image/") ||
        mimeType.startsWith("video/") ||
        mimeType.startsWith("audio/")
      ) {
        currentParts.push({
          inline_data: {
            mime_type: mimeType,
            data
          }
        });
      }
    }

    if (currentParts.length === 0) {
      return res.status(400).json({
        error: "No usable message or attachment was received."
      });
    }

    contents.push({
      role: "user",
      parts: currentParts
    });

    /*
      System instruction:

      The model should follow the user's language.
    */

    const systemInstruction = {
      parts: [
        {
          text:
            "You are RG Creator AI, a helpful AI assistant. " +
            "Answer naturally and accurately. " +
            "If the user asks in Hindi or Hinglish, answer in Hindi/Hinglish. " +
            "If the user asks in English, answer in English. " +
            "Do not unnecessarily change the user's language."
        }
      ]
    };

    /*
      Gemini model.

      If this model is unavailable for your API key,
      change only this value to a model available
      in your Google AI Studio project.
    */

    const model = "gemini-3.5-flash";

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      model +
      ":generateContent";

    const geminiResponse = await fetch(url, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },

      body: JSON.stringify({
        system_instruction: systemInstruction,

        contents,

        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048
        }
      })
    });

    let data = {};

    try {
      data = await geminiResponse.json();
    } catch {
      data = {};
    }

    /*
      Gemini returned an error
    */

    if (!geminiResponse.ok) {
      const apiError =
        data?.error?.message ||
        "Gemini API request failed.";

      console.error(
        "Gemini API Error:",
        geminiResponse.status,
        apiError
      );

      return res.status(geminiResponse.status).json({
        error: "Gemini API Error",
        details: apiError
      });
    }

    /*
      Extract text response
    */

    const parts =
      data?.candidates?.[0]?.content?.parts || [];

    const textParts = parts
      .filter(
        part =>
          part &&
          typeof part.text === "string"
      )
      .map(part => part.text);

    const reply =
      textParts.join("\n").trim();

    if (!reply) {
      console.error(
        "Gemini returned no text:",
        JSON.stringify(data)
      );

      return res.status(500).json({
        error: "AI returned an empty response.",
        details:
          "Gemini did not return usable text."
      });
    }

    /*
      Send response to chat.html
    */

    return res.status(200).json({
      reply
    });

  } catch (error) {
    console.error(
      "Chat API Error:",
      error
    );

    return res.status(500).json({
      error: "Server Error",
      details:
        error?.message ||
        "Something went wrong."
    });
  }
}
