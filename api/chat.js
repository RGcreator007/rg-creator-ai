const DEFAULT_MODEL = "gemini-3.6-flash";

function cleanBase64(value) {

  if (
    typeof value !== "string"
  ) {
    return "";
  }

  const text =
    value.trim();

  if (
    text.startsWith("data:")
  ) {

    const comma =
      text.indexOf(",");

    return comma >= 0
      ? text.slice(
          comma + 1
        )
      : "";

  }

  return text;
}

function normalizeHistory(
  history
) {

  if (
    !Array.isArray(history)
  ) {

    return [];

  }

  return history

    .filter(
      function(item){

        return (
          item &&
          typeof item.content === "string" &&
          item.content.trim()
        );

      }
    )

    .map(
      function(item){

        return {

          /*
           * Gemini uses:
           * user / model
           */

          role:
            item.role === "assistant" ||
            item.role === "model"
              ? "model"
              : "user",

          parts:[
            {
              text:
                item.content.trim()
            }
          ]

        };

      }
    );

}

function buildUserParts(
  message,
  images
) {

  const parts =
    [];

  if(
    typeof message === "string" &&
    message.trim()
  ){

    parts.push({

      text:
        message.trim()

    });

  }

  if(
    Array.isArray(images)
  ){

    for(
      const image of images
    ){

      if(
        !image ||
        typeof image !== "object"
      ){

        continue;

      }

      const data =
        cleanBase64(
          image.data
        );

      if(!data){

        continue;

      }

      const mimeType =
        typeof image.mimeType === "string" &&
        image.mimeType.startsWith("image/")
          ? image.mimeType
          : "image/jpeg";

      parts.push({

        inline_data:{

          mime_type:
            mimeType,

          data:
            data

        }

      });

    }

  }

  return parts;

}

async function callGemini({
  apiKey,
  model,
  contents,
  systemText
}) {

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const response =
    await fetch(
      endpoint,
      {

        method:
          "POST",

        headers:{

          "Content-Type":
            "application/json",

          "x-goog-api-key":
            apiKey

        },

        body:
          JSON.stringify({

            systemInstruction:{

              parts:[
                {
                  text:
                    systemText
                }
              ]

            },

            contents:

              contents,

            generationConfig:{

              temperature:
                0.7,

              topP:
                0.95,

              maxOutputTokens:
                4096

            }

          })

      }
    );

  const data =
    await response
      .json()
      .catch(
        function(){

          return {};

        }
      );

  if(
    !response.ok
  ){

    const error =
      new Error(

        data?.error?.message ||

        `Gemini request failed with HTTP ${response.status}.`

      );

    error.status =
      response.status;

    error.data =
      data;

    throw error;

  }

  const text =
    (
      data?.candidates?.[0]
        ?.content
        ?.parts ||
      []
    )

      .map(
        function(part){

          return typeof part?.text === "string"
            ? part.text
            : "";

        }
      )

      .join("")
      .trim();

  if(!text){

    throw new Error(

      data?.candidates?.[0]
        ?.finishReason

        ?

        `Gemini returned no text. Finish reason: ${data.candidates[0].finishReason}.`

        :

        "Gemini returned an empty response."

    );

  }

  return text;

}

export default async function handler(
  req,
  res
) {

  if(
    req.method !== "POST"
  ){

    return res
      .status(405)
      .json({

        ok:
          false,

        error:
          "Method not allowed."

      });

  }

  const apiKey =
    process.env.GEMINI_API_KEY;

  if(!apiKey){

    return res
      .status(500)
      .json({

        ok:
          false,

        error:
          "GEMINI_API_KEY is missing in Vercel Environment Variables."

      });

  }

  try{

    const body =
      req.body || {};

    const message =
      typeof body.message === "string"
        ? body.message
        : "";

    const history =
      normalizeHistory(
        body.history
      );

    const images =
      Array.isArray(
        body.images
      )
        ? body.images
        : [];

    const thinking =
      Boolean(
        body.thinking
      );

    const currentParts =
      buildUserParts(
        message,
        images
      );

    if(
      !currentParts.length
    ){

      return res
        .status(400)
        .json({

          ok:
            false,

          error:
            "Message or image is required."

        });

    }

    const contents = [

      ...history,

      {

        role:
          "user",

        parts:
          currentParts

      }

    ];

    const systemText = `

You are RG Creator AI, the main AI assistant inside RG Creator AI.

Be helpful, accurate, clear and natural.

Do not add emojis to normal conversation unless they are genuinely useful.

Keep answers appropriately concise unless the user asks for detail.

If an image is attached, actually analyze it and use it as context for the answer.

You can:
- describe the image
- read visible text
- extract text
- answer questions about the image
- explain what is shown
- understand the image as a reference
- follow image-related instructions when possible

Never claim that an image was not provided when valid image data is present.

If the user asks for code, return clean and usable code.

If the user asks for content, write content appropriate to the requested platform.

If the user asks about YouTube or Instagram, provide practical creator-focused answers.

If Think mode is enabled, reason carefully before answering and prioritize accuracy.

Do not expose private chain-of-thought.
Provide only the useful conclusion and concise explanation.

You are RG Creator AI.
Do not unnecessarily mention the underlying Gemini model.

    `.trim();

    let model =
      process.env.GEMINI_MODEL ||
      DEFAULT_MODEL;

    let reply;

    try{

      reply =
        await callGemini({

          apiKey:
            apiKey,

          model:
            model,

          contents:
            contents,

          systemText:
            systemText

        });

    }catch(error){

      /*
       * If the preferred model is unavailable,
       * try a broadly available fallback.
       */

      if(
        error.status === 404 &&
        model !==
          "gemini-2.5-flash"
      ){

        model =
          "gemini-2.5-flash";

        reply =
          await callGemini({

            apiKey:
              apiKey,

            model:
              model,

            contents:
              contents,

            systemText:
              systemText

          });

      }else{

        throw error;

      }

    }

    return res
      .status(200)
      .json({

        ok:
          true,

        reply:
          reply,

        model:
          model

      });

  }catch(error){

    console.error(
      "RG Creator AI Gemini error:",
      error
    );

    if(
      error.status === 429
    ){

      return res
        .status(429)
        .json({

          ok:
            false,

          error:
            "Gemini API limit reached. Billing is not started by this code. Try again after the free quota resets."

        });

    }

    if(
      error.status === 401 ||
      error.status === 403
    ){

      return res
        .status(401)
        .json({

          ok:
            false,

          error:
            "Gemini API key is invalid, disabled, or does not have access to this model."

        });

    }

    return res
      .status(500)
      .json({

        ok:
          false,

        error:
          error?.message ||
          "Gemini request failed."

      });

  }

}
