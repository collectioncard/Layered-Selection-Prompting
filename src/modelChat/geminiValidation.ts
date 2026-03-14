export type GeminiValidationResult = {
  ok: boolean;
  message: string;
};

export async function validateGeminiApiKey(
  apiKey: string,
  modelName: string,
): Promise<GeminiValidationResult> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: "Reply with ok." }],
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      let errorMessage = "Invalid API key or request failed.";

      try {
        const data = await response.json();
        if (data?.error?.message) {
          errorMessage = data.error.message;
        }
      } catch {
        // ignore parsing issues
      }

      if (response.status === 400) {
        return {
          ok: false,
          message: "Bad request. The API key or model name may be malformed.",
        };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          message:
            "Authentication failed. Please check that your Gemini API key is correct.",
        };
      }

      return {
        ok: false,
        message: errorMessage,
      };
    }

    return {
      ok: true,
      message: "API key is valid.",
    };
  } catch {
    return {
      ok: false,
      message: "Network error while validating the API key. Please try again.",
    };
  }
}
