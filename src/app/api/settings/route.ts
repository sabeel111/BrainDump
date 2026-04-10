import { NextRequest, NextResponse } from "next/server";
import { loadSettings, saveSettings } from "@/lib/config/settings";

/**
 * GET /api/settings — Get current LLM settings.
 */
export async function GET() {
  try {
    const settings = await loadSettings();
    // Mask the API key for display
    const masked = {
      ...settings,
      apiKey: settings.apiKey
        ? settings.apiKey.substring(0, 8) + "..." + settings.apiKey.slice(-4)
        : "",
    };
    return NextResponse.json(masked);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load settings" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings — Update LLM settings.
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    // Load existing settings to preserve unmasked apiKey
    const existing = await loadSettings();

    const newSettings = {
      ...existing,
      provider: body.provider || existing.provider,
      model: body.model || existing.model,
      temperature: body.temperature ?? existing.temperature,
      maxTokens: body.maxTokens ?? existing.maxTokens,
      // Only update API key if it's a new full key (not masked)
      apiKey:
        body.apiKey && !body.apiKey.includes("...")
          ? body.apiKey
          : existing.apiKey,
      // Custom endpoint fields
      customBaseUrl:
        body.customBaseUrl !== undefined
          ? body.customBaseUrl
          : existing.customBaseUrl,
      customHeaders:
        body.customHeaders !== undefined
          ? body.customHeaders
          : existing.customHeaders,
    };

    await saveSettings(newSettings);
    return NextResponse.json({ success: true, message: "Settings saved" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save settings" },
      { status: 500 }
    );
  }
}
