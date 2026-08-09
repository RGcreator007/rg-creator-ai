const MODEL = "gemini-2.5-flash";

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
        error: "GEMINI_API_KEY is not configured"
      });
    }

    const message =
      typeof req.body?.message === "string"
        ? req.body.message.trim()
        : "";

    if (!message) {
      return res.status(400).json({
        ok: false,
        error: "Message is required"
      });
    }

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: message
              }
            ]
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 429) {
        return res.status(429).json({
          ok: false,
          error: "Free Gemini limit reached. Please try again later."
        });
      }

      return res.status(response.status).json({
        ok: false,
        error: data?.error?.message || "Gemini request failed"
      });
    }

    const reply = data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      return res.status(502).json({
        ok: false,
        error: "Gemini returned an empty response"
      });
    }

    return res.status(200).json({
      ok: true,
      reply
    });

  } catch (error) {
    console.error("Gemini chat error:", error);

    return res.status(500).json({
      ok: false,
      error: "Server error"
    });
  }
}
