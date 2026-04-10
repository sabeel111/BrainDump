"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, CheckCircle2, Server } from "lucide-react";
import { toast } from "react-hot-toast";
import type { LLMConfig, LLMProviderType } from "@/types";

const PROVIDER_MODELS: Record<LLMProviderType, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1", "o1-mini", "o3-mini"],
  anthropic: ["claude-sonnet-4-20250514", "claude-haiku-4-20250414", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"],
  custom: [], // User types their own
};

const POPULAR_ENDPOINTS = [
  { name: "Ollama (local)", url: "http://localhost:11434/v1" },
  { name: "LM Studio (local)", url: "http://localhost:1234/v1" },
  { name: "Groq", url: "https://api.groq.com/openai/v1" },
  { name: "Together AI", url: "https://api.together.xyz/v1" },
  { name: "OpenRouter", url: "https://openrouter.ai/api/v1" },
  { name: "Perplexity", url: "https://api.perplexity.ai" },
  { name: "DeepSeek", url: "https://api.deepseek.com/v1" },
  { name: "Mistral", url: "https://api.mistral.ai/v1" },
];

export function SettingsContent() {
  const [settings, setSettings] = useState<LLMConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState<LLMProviderType>("openai");
  const [model, setModel] = useState("gpt-4o");
  const [temperature, setTemperature] = useState(0.3);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [customHeaders, setCustomHeaders] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          setSettings(data);
          setProvider(data.provider);
          setModel(data.model);
          setTemperature(data.temperature);
          setMaxTokens(data.maxTokens);
          setCustomBaseUrl(data.customBaseUrl || "");
          setCustomHeaders(
            data.customHeaders && Object.keys(data.customHeaders).length > 0
              ? JSON.stringify(data.customHeaders, null, 2)
              : ""
          );
        }
      } catch {
        // use defaults
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);

    // Validate custom provider
    if (provider === "custom" && !customBaseUrl.trim()) {
      toast.error("Custom provider requires a base URL");
      setSaving(false);
      return;
    }

    // Parse custom headers
    let parsedHeaders: Record<string, string> | undefined;
    if (customHeaders.trim()) {
      try {
        parsedHeaders = JSON.parse(customHeaders);
      } catch {
        toast.error("Custom headers must be valid JSON");
        setSaving(false);
        return;
      }
    }

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          temperature,
          maxTokens,
          apiKey: apiKey || undefined,
          customBaseUrl: customBaseUrl.trim() || undefined,
          customHeaders: parsedHeaders,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");
      toast.success("Settings saved");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 max-w-2xl">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-64 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* LLM Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>LLM Configuration</CardTitle>
          <CardDescription>
            Configure the LLM provider used for ingesting sources and answering queries.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Provider */}
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select
              value={provider}
              onValueChange={(v) => {
                const p = (v || "openai") as LLMProviderType;
                setProvider(p);
                // Set default model for built-in providers
                const models = PROVIDER_MODELS[p];
                if (models.length > 0) {
                  setModel(models[0]);
                } else {
                  setModel("");
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
                <SelectItem value="custom">
                  <span className="flex items-center gap-2">
                    <Server className="h-3.5 w-3.5" />
                    Custom (OpenAI-compatible)
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* API Key */}
          <div className="space-y-2">
            <Label>API Key {provider === "custom" && "(optional)"}</Label>
            <Input
              type="password"
              placeholder={
                provider === "custom"
                  ? "Often not needed for local models"
                  : settings?.apiKey
                  ? "••••••••...****"
                  : "Enter your API key"
              }
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {provider === "custom"
                ? "Some endpoints require an API key, others (like local Ollama) don't."
                : "Your key is stored locally and never sent to our servers."}
            </p>
          </div>

          {/* Model */}
          <div className="space-y-2">
            <Label>Model</Label>
            {PROVIDER_MODELS[provider].length > 0 ? (
              <Select value={model} onValueChange={(v) => setModel(v || "")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_MODELS[provider].map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                placeholder="e.g., llama3.1, mistral, deepseek-chat"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            )}
          </div>

          {/* Temperature */}
          <div className="space-y-2">
            <Label>Temperature: {temperature}</Label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Lower = more deterministic. Higher = more creative.
            </p>
          </div>

          {/* Max Tokens */}
          <div className="space-y-2">
            <Label>Max Output Tokens</Label>
            <Input
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value) || 4096)}
              min={256}
              max={128000}
            />
            <p className="text-xs text-muted-foreground">
              Max tokens the model can <strong>generate per response</strong> (not the context window). Most models cap output at 4K–16K even with large context windows. Set too high and you&apos;ll get API errors.
            </p>
          </div>

          <Separator />

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : saved ? (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Saved!
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Settings
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Custom Endpoint (only shown for custom provider) */}
      {provider === "custom" && (
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Custom Endpoint
            </CardTitle>
            <CardDescription>
              Connect to any OpenAI-compatible API endpoint. The server must implement the{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">/chat/completions</code>{" "}
              endpoint format.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Base URL */}
            <div className="space-y-2">
              <Label>Base URL</Label>
              <Input
                placeholder="http://localhost:11434/v1"
                value={customBaseUrl}
                onChange={(e) => setCustomBaseUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The base URL for the API. Must end with the version path (e.g., <code>/v1</code>).
              </p>
            </div>

            {/* Quick-select popular endpoints */}
            <div className="space-y-2">
              <Label>Popular Endpoints</Label>
              <div className="grid grid-cols-2 gap-2">
                {POPULAR_ENDPOINTS.map((ep) => (
                  <button
                    key={ep.url}
                    type="button"
                    onClick={() => setCustomBaseUrl(ep.url)}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                      customBaseUrl === ep.url
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/30 hover:bg-accent"
                    }`}
                  >
                    <Server className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{ep.name}</p>
                      <p className="text-muted-foreground truncate">{ep.url}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Headers */}
            <div className="space-y-2">
              <Label>Custom Headers (optional, JSON)</Label>
              <Textarea
                placeholder={'{\n  "HTTP-Referer": "https://your-app.com",\n  "X-Title": "Knowledge Wiki"\n}'}
                value={customHeaders}
                onChange={(e) => setCustomHeaders(e.target.value)}
                rows={4}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Some providers require extra headers (e.g., OpenRouter needs <code>HTTP-Referer</code>).
                Leave empty if not needed.
              </p>
            </div>

            <Separator />

            {/* Test connection hint */}
            <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
              <strong>How it works:</strong> The app uses the OpenAI SDK pointed at your custom URL.
              Make sure your server is running and supports the{" "}
              <code>/chat/completions</code> endpoint.
              For streaming to work, the server must also support{" "}
              <code>stream: true</code>.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vault Info */}
      <Card>
        <CardHeader>
          <CardTitle>Vault</CardTitle>
          <CardDescription>
            Your wiki vault is stored locally as markdown files.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm space-y-1 text-muted-foreground">
            <p>📁 <strong>Location:</strong> ./vault/</p>
            <p>📄 <strong>Format:</strong> Markdown with wiki-links</p>
            <p>🔗 <strong>Compatible with:</strong> Obsidian</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
