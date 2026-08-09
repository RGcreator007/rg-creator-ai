export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method Not Allowed"
    });
  }

  try {
    const { message, history = [] } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "Message is required"
      });
    }

    const contents = [];

    if (Array.isArray(history)) {
      for (const item of history) {
        if (!item?.text) continue;

        contents.push({
          role: item.role === "user" ? "user" : "model",
          parts: [
            {
              text: String(item.text)
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

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.7
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini Chat Error:", data);

      return res.status(response.status).json({
        error: "Gemini API Error",
        details:
          data?.error?.message ||
          "Gemini response failed."
      });
    }

    const reply =
      data?.candidates?.[0]?.content?.parts
        ?.filter(part => part?.text)
        ?.map(part => part.text)
        ?.join("\n") ||
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
