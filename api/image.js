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

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured in Vercel."
      });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
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

    if (!response.ok) {
      console.error("Gemini Image Error:", data);

      return res.status(response.status).json({
        error: "Gemini Image API Error",
        details:
          data?.error?.message ||
          "Image generation failed."
      });
    }

    const parts =
      data?.candidates?.[0]?.content?.parts || [];

    const imagePart = parts.find(
      part => part?.inlineData?.data
    );

    if (!imagePart) {
      return res.status(500).json({
        error: "No image was returned.",
        details: "Gemini did not return an image."
      });
    }

    return res.status(200).json({
      image: imagePart.inlineData.data,
      mimeType:
        imagePart.inlineData.mimeType || "image/png"
    });

  } catch (error) {
    console.error("Image API Error:", error);

    return res.status(500).json({
      error: "Server Error",
      details: error.message
    });
  }
}
