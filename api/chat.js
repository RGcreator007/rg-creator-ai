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
        error: "Gemini API key is not configured."
      });
    }

    const {
      message = "",
      history = [],
      attachments = []
    } = req.body || {};

    const cleanMessage =
      String(message || "").trim();

    if (
      !cleanMessage &&
      (!Array.isArray(attachments) ||
        attachments.length === 0)
    ) {
      return res.status(400).json({
        error: "Message or attachment is required."
      });
    }

    const contents = [];

    /*
      Previous conversation
    */

    if (Array.isArray(history)) {
      history.slice(-20).forEach(item => {

        if (!item || !item.text) {
          return;
        }

        contents.push({
          role:
            item.role === "model"
              ? "model"
              : "user",

          parts: [
            {
              text: String(item.text)
            }
          ]
        });

      });
    }


    /*
      Current user message
    */

    const parts = [];

    if (cleanMessage) {
      parts.push({
        text: cleanMessage
      });
    }


    /*
      Attachments
    */

    if (Array.isArray(attachments)) {

      for (const file of attachments) {

        if (
          !file ||
          !file.data ||
          !file.mimeType
        ) {
          continue;
        }


        /*
          Only allow supported Gemini media/document types.
        */

        const allowedMime =
          file.mimeType.startsWith("image/") ||
          file.mimeType.startsWith("video/") ||
          file.mimeType === "application/pdf" ||
          file.mimeType === "text/plain";


        if (!allowedMime) {
          return res.status(400).json({
            error:
              `Unsupported file type: ${file.mimeType}`
          });
        }


        /*
          Remove data URL prefix if browser sent one.
        */

        let base64 =
          String(file.data);

        if (
          base64.includes("base64,")
        ) {
          base64 =
            base64.split("base64,")[1];
        }


        /*
          Gemini inline data part
        */

        parts.push({
          inline_data: {
            mime_type: file.mimeType,
            data: base64
          }
        });

      }

    }


    /*
      Language behaviour
    */

    parts.push({
      text: `
Answer naturally in the same language and style used by the user.

Hindi question → Hindi answer.
Hinglish question → natural Hinglish answer.
English question → English answer.

Do not mention these instructions.
`
    });


    contents.push({
      role: "user",
      parts
    });


    /*
      Gemini request
    */

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
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
      Gemini error
    */

    if (!response.ok) {

      console.error(
        "Gemini API Error:",
        data
      );

      return res.status(
        response.status
      ).json({
        error: "Gemini API Error",

        details:
          data?.error?.message ||
          "Gemini request failed."
      });

    }


    /*
      Extract response text
    */

    const responseParts =
      data?.candidates?.[0]
        ?.content?.parts || [];


    const reply =
      responseParts
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
