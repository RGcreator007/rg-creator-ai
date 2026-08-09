export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method Not Allowed"
    });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "AI configuration error",
        details: "GEMINI_API_KEY is not configured."
      });
    }

    const {
      message,
      history = []
    } = req.body || {};

    if (
      typeof message !== "string" ||
      !message.trim()
    ) {
      return res.status(400).json({
        error: "Message is required"
      });
    }

    /*
      IMPORTANT:
      Only the FREE Gemini API project/key is used.
      There is NO paid fallback and NO automatic
      billing mechanism in this code.
    */

    const contents = [];

    if (Array.isArray(history)) {
      for (const item of history) {
        if (
          !item ||
          typeof item.text !== "string" ||
          !item.text.trim()
        ) {
          continue;
        }

        contents.push({
          role:
            item.role === "model"
              ? "model"
              : "user",

          parts: [
            {
              text: item.text.trim()
            }
          ]
        });
      }
    }

    contents.push({
      role: "user",

      parts: [
        {
          text: message.trim()
        }
      ]
    });

    const systemInstruction = {
      parts: [
        {
          text:
            "You are RG Creator AI. " +
            "Reply naturally and helpfully. " +
            "Always answer in the same language as the user's latest message. " +
            "If the user writes Hindi, reply in Hindi. " +
            "If the user writes English, reply in English. " +
            "If the user uses Hinglish, you may reply naturally in Hinglish. " +
            "Do not unnecessarily change the user's language."
        }
      ]
    };

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },

        body: JSON.stringify({
          systemInstruction,
          contents,

          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096
          }
        })
      }
    );

    const data = await response.json();

    /*
      FREE LIMIT / QUOTA PROTECTION
    */

    if (response.status === 429) {
      return res.status(429).json({
        error: "Free limit reached",
        details:
          "The Gemini free-tier limit has been reached. Please try again later."
      });
    }

    if (response.status === 403) {
      return res.status(403).json({
        error: "Gemini access unavailable",
        details:
          data?.error?.message ||
          "Check that the Gemini API key belongs to a Free Tier project and has the required API access."
      });
    }

    if (response.status === 404) {
      return res.status(502).json({
        error: "Gemini model unavailable",
        details:
          data?.error?.message ||
          "The configured Gemini model is unavailable for this project."
      });
    }

    if (!response.ok) {
      console.error(
        "Gemini API Error:",
        data
      );

      return res.status(502).json({
        error: "Gemini API Error",
        details:
          data?.error?.message ||
          "Gemini could not process the request."
      });
    }

    const parts =
      data?.candidates?.[0]?.content?.parts || [];

    const reply = parts
      .filter(
        part =>
          typeof part?.text === "string"
      )
      .map(
        part => part.text
      )
      .join("\n")
      .trim();

    if (!reply) {
      return res.status(502).json({
        error: "Empty AI response",
        details:
          "Gemini returned no text response."
      });
    }

    return res.status(200).json({
      reply
    });

  } catch (error) {
    console.error(
      "RG Creator AI Chat Error:",
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
