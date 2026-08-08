export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method Not Allowed"
    });
  }

  try {
    const { prompt } = req.body || {};

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({
        error: "Prompt is required"
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured in Vercel."
      });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },

        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: prompt.trim()
                }
              ]
            }
          ],

          generationConfig: {
            responseModalities: ["IMAGE"],

            responseFormat: {
              image: {
                aspectRatio: "1:1",
                imageSize: "1K"
              }
            }
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "Gemini Image API Error:",
        data
      );

      return res.status(response.status).json({
        error: "Gemini Image API Error",
        details:
          data?.error?.message ||
          "Image generation failed."
      });
    }

    const parts =
      data?.candidates?.[0]?.content?.parts || [];

    const imagePart =
      parts.find(
        part =>
          part?.inlineData?.data
      );

    if (!imagePart) {
      console.error(
        "No image returned:",
        JSON.stringify(data)
      );

      return res.status(500).json({
        error: "No image was returned.",
        details:
          "Gemini did not return an image."
      });
    }

    const base64 =
      imagePart.inlineData.data;

    const mimeType =
      imagePart.inlineData.mimeType ||
      "image/png";

    return res.status(200).json({
      image:
        `data:${mimeType};base64,${base64}`,

      mimeType
    });

  } catch (error) {

    console.error(
      "Image API Error:",
      error
    );

    return res.status(500).json({
      error: "Server Error",
      details:
        error?.message ||
        "Unknown server error."
    });
  }
}
