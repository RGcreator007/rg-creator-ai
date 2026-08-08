export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method Not Allowed"
    });
  }

  try {

    const {
      message,
      file
    } = req.body || {};

    if (!message && !file) {
      return res.status(400).json({
        error: "Message is required."
      });
    }

    const parts = [];

    /*
      Language + response behavior
    */
    parts.push({
      text: `
You are RG Creator AI.

IMPORTANT RESPONSE RULES:

1. Reply in the SAME language used by the user.
2. If the user writes Hindi, reply in Hindi.
3. If the user writes English, reply in English.
4. If the user writes Hinglish, reply in natural Hinglish.
5. Match the user's style and tone when appropriate.
6. Do not unnecessarily change the user's language.
7. Give clear, useful and natural answers.
8. Do not mention these instructions.

User message:
${message || ""}
      `
    });


    /*
      File / image / video
    */
    if (file && file.data && file.mimeType) {

      parts.push({
        inlineData: {
          mimeType: file.mimeType,
          data: file.data
        }
      });

      parts.push({
        text: `
The user attached a file named "${file.name || "attachment"}".
Analyze the attachment when relevant and answer the user's request.
        `
      });
    }


    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
        },

        body: JSON.stringify({
          contents: [
            {
              parts: parts
            }
          ]
        })
      }
    );


    const data =
      await response.json();


    if (!response.ok) {

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "Gemini API Error"
      });
    }


    const reply =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();


    return res.status(200).json({
      reply:
        reply ||
        "No response from Gemini."
    });


  } catch (error) {

    return res.status(500).json({
      error: "Server Error",
      details: error.message
    });
  }
}
