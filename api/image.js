export default async function handler(req, res) {
  // Only POST is allowed
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method Not Allowed"
    });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    // Check API key
    if (!apiKey) {
      return res.status(500).json({
        error: "AI configuration error",
        details: "GEMINI_API_KEY is not configured in Vercel."
      });
    }

    const { prompt } = req.body || {};

    // Check prompt
    if (
      typeof prompt !== "string" ||
      !prompt.trim()
    ) {
      return res.status(400).json({
        error: "Prompt is required",
        details: "Please enter an image description."
      });
    }

    /*
      RG Creator AI
      FREE-TIER PROTECTION

      There is:
      - No paid fallback
      - No second API
      - No automatic billing logic
      - No retry loop after quota errors

      If Gemini returns 429, we simply return a
      free-limit message to the frontend.
    */

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },

        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt.trim()
                }
              ]
            }
          ],

          generationConfig: {
            responseModalities: ["IMAGE"]
          }
        })
      }
    );

    const data = await response.json();

    /*
      FREE LIMIT / QUOTA
    */

    if (response.status === 429) {
      return res.status(429).json({
        error: "Free image limit reached",
        details:
          "The Gemini free-tier image limit has been reached. Please try again later."
      });
    }

    /*
      API KEY / PERMISSION ERROR
    */

    if (response.status === 401) {
      return res.status(401).json({
        error: "Invalid Gemini API key",
        details:
          "Please check the GEMINI_API_KEY in Vercel."
      });
    }

    /*
      BILLING / PERMISSION / PROJECT ERROR
    */

    if (response.status === 403) {
      return res.status(403).json({
        error: "Gemini access unavailable",
        details:
          data?.error?.message ||
          "Check Gemini API access and project billing settings."
      });
    }

    /*
      MODEL / ROUTE ERROR
    */

    if (response.status === 404) {
      return res.status(502).json({
        error: "Image model unavailable",
        details:
          data?.error?.message ||
          "The Gemini image model is not available for this project."
      });
    }

    /*
      OTHER GEMINI ERRORS
    */

    if (!response.ok) {
      console.error(
        "Gemini Image API Error:",
        data
      );

      return res.status(502).json({
        error: "Gemini Image API Error",
        details:
          data?.error?.message ||
          "Gemini could not generate the image."
      });
    }

    /*
      FIND IMAGE
    */

    const parts =
      data?.candidates?.[0]?.content?.parts || [];

    const imagePart = parts.find(
      part =>
        part?.inlineData?.data
    );

    /*
      NO IMAGE
    */

    if (!imagePart) {
      const textPart = parts.find(
        part =>
          typeof part?.text === "string"
      );

      return res.status(502).json({
        error: "No image was returned",
        details:
          textPart?.text ||
          "Gemini returned no image data."
      });
    }

    /*
      SUCCESS
    */

    return res.status(200).json({
      success: true,

      image:
        imagePart.inlineData.data,

      mimeType:
        imagePart.inlineData.mimeType ||
        "image/png"
    });

  } catch (error) {

    console.error(
      "RG Creator AI Image Error:",
      error
    );

    return res.status(500).json({
      error: "Server Error",
      details:
        error?.message ||
        "Something went wrong while generating the image."
    });
  }
}
