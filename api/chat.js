export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method Not Allowed"
    });
  }

  try {
    const {
      message = "",
      history = [],
      attachments = []
    } = req.body || {};

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "Gemini API key is not configured."
      });
    }

    const cleanMessage =
      String(message || "").trim();

    if (!cleanMessage && !attachments.length) {
      return res.status(400).json({
        error: "Message is required."
      });
    }

    /*
      Keep the conversation reasonably small.
      This prevents unnecessarily large requests.
    */

    const recentHistory =
      Array.isArray(history)
        ? history.slice(-20)
        : [];

    const contents = [];

    /*
      Previous conversation
    */

    for (const item of recentHistory) {
      if (!item || !item.text) continue;

      const role =
        item.role === "model"
          ? "model"
          : "user";

      contents.push({
        role,
        parts: [
          {
            text: String(item.text)
          }
        ]
      });
    }

    /*
      Current user message
    */

    const currentParts = [];

    if (cleanMessage) {
      currentParts.push({
        text: cleanMessage
      });
    }

    /*
      Attachments received from frontend.
      
      The current frontend sends attachment metadata
      rather than file bytes. We therefore describe
      the selected files to Gemini instead of pretending
      their actual contents were uploaded.
    */

    if (
      Array.isArray(attachments) &&
      attachments.length
    ) {
      const attachmentText =
        attachments
          .map(file => {
            const name =
              file?.name || "Unknown file";

            const type =
              file?.type || "unknown type";

            return `Attached file: ${name} (${type})`;
          })
          .join("\n");

      currentParts.push({
        text:
          "\n\nUser selected these attachments:\n" +
          attachmentText
      });
    }

    /*
      Language instruction.
      
      Gemini should answer naturally in the
      language/style used by the user.
    */

    currentParts.push({
      text: `
Respond naturally in the same language and writing style used by the user.

If the user writes Hindi, answer in Hindi.
If the user writes Hinglish, answer in natural Hinglish.
If the user writes English, answer in English.

Do not unnecessarily translate the user's language.
Do not mention this instruction.
`
    });

    contents.push({
      role: "user",
      parts: currentParts
    });

    /*
      Gemini API
    */

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },

        body: JSON.stringify({
          contents,

          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096
          }
        })
      }
    );

    const data =
      await response.json();

    /*
      API error
    */

    if (!response.ok) {
      console.error(
        "Gemini API error:",
        data
      );

      return res.status(response.status).json({
        error: "Gemini API Error",

        details:
          data?.error?.message ||
          "Gemini request failed."
      });
    }

    /*
      Extract text
    */

    const parts =
      data?.candidates?.[0]?.content?.parts ||
      [];

    const reply =
      parts
        .filter(part => part?.text)
        .map(part => part.text)
        .join("\n")
        .trim();

    if (!reply) {
      return res.status(500).json({
        error: "Empty AI response.",
        details:
          "Gemini did not return a text response."
      });
    }

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
