export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { message, history = [] } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Please enter a message."
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "Gemini API is not configured."
      });
    }

    const contents = [
      ...history
        .filter(item => item?.role && item?.text)
        .map(item => ({
          role: item.role === "assistant" ? "model" : "user",
          parts: [{ text: String(item.text) }]
        })),
      {
        role: "user",
        parts: [{ text: message }]
      }
    ];

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text:
                  "You are RG Creator AI, a helpful AI assistant for creators, productivity and everyday work. Understand English, Hindi and Hinglish. Reply naturally in the user's language. Be concise by default and provide detailed answers when requested."
              }
            ]
          },
          contents,
          generationConfig: {
            temperature: 0.7
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const status = response.status;

      if (status === 429) {
        return res.status(429).json({
          error:
            "Free Gemini API limit reached. No paid billing will be activated. Please try again after the free quota resets."
        });
      }

      return res.status(status).json({
        error:
          data?.error?.message ||
          "Gemini API request failed."
      });
    }

    const reply =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

    if (!reply) {
      return res.status(502).json({
        error: "Gemini returned an empty response."
      });
    }

    return res.status(200).json({
      reply
    });

  } catch (error) {
    console.error("RG Creator AI Gemini error:", error);

    return res.status(500).json({
      error:
        "Unable to connect to AI right now. Please try again."
    });
  }
}
