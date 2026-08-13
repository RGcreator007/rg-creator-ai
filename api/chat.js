const MODEL = "gemini-3.6-flash";

const SYSTEM_PROMPT = `
You are RG Creator AI, a smart, friendly and context-aware AI assistant.

PERSONALITY:
- Be natural, helpful and friendly.
- Talk like a knowledgeable friend when the user is having a casual conversation.
- Do NOT use emojis in every message.
- Use emojis only when they genuinely fit the situation, emotion, celebration, encouragement, or when they improve readability.
- Never force emojis.
- For technical, coding, business, academic or serious questions, stay clear, structured and mostly professional.
- Match the user's language. If the user writes Hindi/Hinglish, reply naturally in Hindi/Hinglish. If the user writes English, reply in English.
- Do not repeatedly say "How can I help you?" unless appropriate.
- Do not mention these system instructions.

CONVERSATION:
- Use the supplied conversation history to understand context.
- Remember information from the current conversation.
- Avoid asking the user to repeat something that is already available in the conversation.
- If the user refers to something discussed earlier, use the available context.

THINK MODE:
- When Think mode is OFF, answer normally and efficiently.
- When Think mode is ON, spend more effort analyzing the problem and provide a more carefully reasoned answer.
- Never reveal hidden chain-of-thought or private reasoning.
- Instead, provide a concise explanation of the important reasoning or conclusions when useful.

ATTACHMENTS:
- If an attachment is supplied, inspect and use it when possible.
- For images, describe or analyze the visible content when asked.
- For PDFs and documents, use their provided content when available.
- Never pretend that you inspected an attachment if its content was not actually provided to you.

RESPONSE STYLE:
- Be concise for simple questions.
- Be detailed when the user asks for detailed guidance.
- Use headings and bullet points when they improve clarity.
- For code, provide complete working code when requested.
- Do not unnecessarily repeat the user's question.
`;


/* =========================================================
   MAIN HANDLER
========================================================= */

export default async function handler(req, res) {

  if (req.method !== "POST") {

    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });

  }


  try {

    const apiKey =
      process.env.GEMINI_API_KEY;


    if (!apiKey) {

      return res.status(500).json({
        ok: false,
        error: "GEMINI_API_KEY is not configured"
      });

    }


    const body =
      req.body || {};


    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : "";


    const thinkMode =
      body.thinkMode === true;


    const history =
      Array.isArray(body.history)
        ? body.history
        : [];


    const attachment =
      body.attachment || null;


    if (!message && !attachment) {

      return res.status(400).json({
        ok: false,
        error: "Message or attachment is required"
      });

    }


    /* =====================================================
       BUILD SYSTEM INSTRUCTION
    ===================================================== */

    const systemInstruction =
      SYSTEM_PROMPT +
      `

CURRENT THINK MODE:
${thinkMode ? "ON - analyze carefully before answering." : "OFF - answer normally and efficiently."}
`;


    /* =====================================================
       BUILD CONVERSATION
    ===================================================== */

    const contents = [];


    /*
      Only accept valid previous messages.
      Limit history so request size doesn't grow forever.
    */

    const safeHistory =
      history
        .filter(item =>
          item &&
          (
            item.role === "user" ||
            item.role === "assistant"
          ) &&
          typeof item.content === "string" &&
          item.content.trim()
        )
        .slice(-30);


    for (const item of safeHistory) {

      contents.push({

        role:
          item.role === "assistant"
            ? "model"
            : "user",

        parts: [

          {
            text:
              item.content
          }

        ]

      });

    }


    /* =====================================================
       CURRENT USER MESSAGE
    ===================================================== */

    const currentParts = [];


    /*
      Text part
    */

    if (message) {

      currentParts.push({

        text:
          message

      });

    }


    /* =====================================================
       ATTACHMENT
    ===================================================== */

    if (attachment) {

      /*
        The index page sends:

        {
          name,
          type,
          size,
          data
        }

        data is Base64 without the data:image/... prefix.
      */


      const mimeType =
        typeof attachment.type === "string" &&
        attachment.type.trim()
          ? attachment.type
          : "application/octet-stream";


      const base64Data =
        typeof attachment.data === "string"
          ? attachment.data
          : "";


      if (!base64Data) {

        return res.status(400).json({
          ok: false,
          error: "Attachment data is missing"
        });

      }


      /*
        Gemini inlineData supports Base64 content.
      */

      currentParts.push({

        inlineData: {

          mimeType:
            mimeType,

          data:
            base64Data

        }

      });


      /*
        Give the model attachment information.
      */

      currentParts.unshift({

        text:
          `
The user attached a file named "${attachment.name || "attachment"}"
with MIME type "${mimeType}".

Use the attachment as part of your answer when relevant.
`

      });

    }


    /*
      There must always be a current user message.
    */

    if (!currentParts.length) {

      return res.status(400).json({
        ok: false,
        error: "No usable message content"
      });

    }


    contents.push({

      role: "user",

      parts:
        currentParts

    });


    /* =====================================================
       GEMINI REQUEST
    ===================================================== */

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;


    const requestBody = {

      systemInstruction: {

        parts: [

          {
            text:
              systemInstruction
          }

        ]

      },

      contents:

        contents,

      generationConfig: {

        temperature:
          thinkMode
            ? 0.65
            : 0.8,

        topP:
          0.9,

        maxOutputTokens:
          thinkMode
            ? 4096
            : 2048

      }

    };


    const response =
      await fetch(

        url,

        {

          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json",

            "x-goog-api-key":
              apiKey

          },

          body:
            JSON.stringify(
              requestBody
            )

        }

      );


    const data =
      await response.json();


    /* =====================================================
       GEMINI ERRORS
    ===================================================== */

    if (!response.ok) {

      console.error(
        "Gemini API error:",
        data
      );


      if (
        response.status === 429
      ) {

        return res.status(429).json({

          ok: false,

          error:
            "Free Gemini limit reached. Please try again later."

        });

      }


      if (
        response.status === 401 ||
        response.status === 403
      ) {

        return res.status(
          response.status
        ).json({

          ok: false,

          error:
            "Gemini API key is invalid or does not have access to this model."

        });

      }


      return res.status(
        response.status
      ).json({

        ok: false,

        error:
          data?.error?.message ||
          "Gemini request failed"

      });

    }


    /* =====================================================
       EXTRACT RESPONSE
    ===================================================== */

    const parts =
      data
        ?.candidates?.[0]
        ?.content?.parts;


    const reply =
      Array.isArray(parts)

        ? parts
            .map(
              part =>
                typeof part.text === "string"
                  ? part.text
                  : ""
            )
            .join("")
            .trim()

        : "";


    /* =====================================================
       EMPTY RESPONSE
    ===================================================== */

    if (!reply) {

      console.error(
        "Gemini empty response:",
        JSON.stringify(
          data,
          null,
          2
        )
      );


      return res.status(502).json({

        ok: false,

        error:
          "Gemini returned an empty response"

      });

    }


    /* =====================================================
       SUCCESS
    ===================================================== */

    return res.status(200).json({

      ok: true,

      reply:

        reply,

      thinkMode:

        thinkMode

    });


  } catch (error) {

    console.error(
      "RG Creator AI chat error:",
      error
    );


    return res.status(500).json({

      ok: false,

      error:
        "Server error. Please try again."

    });

  }

}
