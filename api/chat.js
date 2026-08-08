export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method Not Allowed"
    });
  }

  try {
    const {
      message,
      history = [],
      image,
      imageMimeType
    } = req.body || {};

    if (!message && !image) {
      return res.status(400).json({
        error: "Message or image is required"
      });
    }

    const contents = [];

    // Previous chat history
    for (const item of history) {
      if (!item?.content) continue;

      contents.push({
        role: item.role === "assistant" ? "model" : "user",
        parts: [
          {
            text: String(item.content)
          }
        ]
      });
    }

    // Current message
    const currentParts = [];

    if (message) {
      currentParts.push({
        text: message
      });
    }

    // Current image
    if (image && imageMimeType) {
      currentParts.push({
        inlineData: {
          mimeType: imageMimeType,
          data: image
        }
      });
    }

    contents.push({
      role: "user",
      parts: currentParts
    });

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: contents
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Gemini API Error",
        details:
          data?.error?.message ||
          "Unknown Gemini API error"
      });
    }

    const reply =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("") ||
      "Sorry, I couldn't generate a response.";

    return res.status(200).json({
      reply
    });

  } catch (error) {
    console.error("Chat API Error:", error);

    return res.status(500).json({
      error: "Server Error",
      details: error.message
    });
  }
}
