/**
 * User settings management.
 * Reads/writes to a local settings file in the vault.
 */

import fs from "fs/promises";
import path from "path";
import { VAULT } from "./constants";
import type { LLMConfig, LLMProviderType } from "@/types";

const SETTINGS_FILE = path.join(VAULT.root, ".settings.json");

export async function loadSettings(): Promise<LLMConfig> {
  try {
    const data = await fs.readFile(SETTINGS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return {
      provider: "openai",
      apiKey: process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || "",
      model: "gpt-4o",
      temperature: 0.3,
      maxTokens: 4096,
      customBaseUrl: "",
      customHeaders: {},
    };
  }
}

export async function saveSettings(settings: LLMConfig): Promise<void> {
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
}

export function getModelsForProvider(provider: LLMProviderType): string[] {
  switch (provider) {
    case "openai":
      return ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1", "o1-mini", "o3-mini"];
    case "anthropic":
      return ["claude-sonnet-4-20250514", "claude-haiku-4-20250414", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"];
    case "custom":
      return []; // User types their own model name
    default:
      return [];
  }
}
