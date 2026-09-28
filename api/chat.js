// RG Creator AI
// Secure Gemini API backend
// File: api/chat.js

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const SYSTEM_INSTRUCTION = `
You are RG Creator AI, a helpful AI assistant.

Behavior:
- Reply naturally and clearly.
- Understand English, Hindi, Hinglish and common languages.
- Reply in the user's language when appropriate.
- Be concise by default and detailed when requested.
- Maintain conversation context when previous messages are provided.
- Never claim that you performed an action that you did not perform.
- Help with general questions, writing, coding, YouTube, Instagram,
  content creation and productivity.
- For code, provide clean, properly formatted code.
`;

function sendJSON(res, status, data) {
  res.status(status).json(data);
}

function getClientIP(req) {
  const forwarded = req.headers["x-forwarded-for"];

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return req.socket?.remoteAddress || "unknown";
}

function sanitizeText(value, maxLength = 20000) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message) => {
      return (
        message &&
        typeof message === "object" &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0
      );
    })
    .slice(-30)
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [
        {
          text: sanitizeText(message.content)
        }
      ]
    }));
}

export default async function handler(req, res) {
  // Only POST is allowed.
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return sendJSON(res, 405, {
      success: false,
      error: "Method not allowed. Use POST."
    });
  }

  // API key must stay on the server.
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("GEMINI_API_KEY is not configured.");

    return sendJSON(res, 500, {
      success: false,
      error: "AI service is not configured yet."
    });
  }

  // Basic request protection.
  const clientIP = getClientIP(req);

  try {
    if (!req.body || typeof req.body !== "object") {
      return sendJSON(res, 400, {
        success: false,
        error: "Invalid request body."
      });
    }

    const message = sanitizeText(req.body.message);

    let messages = normalizeMessages(req.body.messages);

    // Support the simple { message } format as well.
    if (messages.length === 0 && message) {
      messages = [
        {
          role: "user",
          parts: [{ text: message }]
        }
      ];
    }

    if (messages.length === 0) {
      return sendJSON(res, 400, {
        success: false,
        error: "Please enter a message."
      });
    }

    // Prevent an accidental empty/invalid conversation.
    const lastMessage = messages[messages.length - 1];

    if (lastMessage.role !== "user") {
      return sendJSON(res, 400, {
        success: false,
        error: "The latest message must be from the user."
      });
    }

    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const requestBody = {
      systemInstruction: {
        parts: [
          {
            text: SYSTEM_INSTRUCTION
          }
        ]
      },

      contents: messages,

      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048
      }
    };

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 45000);

    let geminiResponse;

    try {
      geminiResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    let data = null;

    try {
      data = await geminiResponse.json();
    } catch {
      data = null;
    }

    // Free-tier / quota protection.
    if (geminiResponse.status === 429) {
      console.warn("Gemini quota/rate limit reached.", {
        clientIP,
        model: GEMINI_MODEL
      });

      return sendJSON(res, 429, {
        success: false,
        code: "RATE_LIMIT",
        error:
          "Gemini's current free-tier limit or rate limit has been reached. " +
          "Please try again later."
      });
    }

    // Authentication/API key problem.
    if (
      geminiResponse.status === 401 ||
      geminiResponse.status === 403
    ) {
      console.error("Gemini authentication error.", {
        status: geminiResponse.status,
        clientIP
      });

      return sendJSON(res, 502, {
        success: false,
        code: "AI_AUTH_ERROR",
        error:
          "The AI service could not authenticate this request. " +
          "Please check the Gemini API configuration."
      });
    }

    // Other Gemini API errors.
    if (!geminiResponse.ok) {
      console.error("Gemini API error:", {
        status: geminiResponse.status,
        clientIP,
        response: data
      });

      return sendJSON(res, 502, {
        success: false,
        code: "AI_API_ERROR",
        error:
          "The AI service is temporarily unavailable. Please try again."
      });
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];

    const responseText = parts
      .map((part) => {
        return typeof part.text === "string" ? part.text : "";
      })
      .join("")
      .trim();

    if (!responseText) {
      console.error("Gemini returned no text.", {
        clientIP,
        data
      });

      return sendJSON(res, 502, {
        success: false,
        code: "EMPTY_AI_RESPONSE",
        error:
          "The AI returned an empty response. Please try again."
      });
    }

    return sendJSON(res, 200, {
      success: true,
      model: GEMINI_MODEL,
      response: responseText
    });
  } catch (error) {
    console.error("Chat backend error:", {
      clientIP,
      message: error?.message
    });

    if (error?.name === "AbortError") {
      return sendJSON(res, 504, {
        success: false,
        code: "AI_TIMEOUT",
        error:
          "The AI request took too long. Please try again."
      });
    }

    return sendJSON(res, 500, {
      success: false,
      code: "SERVER_ERROR",
      error:
        "Something went wrong while connecting to RG Creator AI."
    });
  }
}
