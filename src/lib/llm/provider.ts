/**
 * Abstract LLM provider interface.
 * All providers implement this interface for consistency.
 * Supports: OpenAI, Anthropic, and Custom OpenAI-compatible endpoints.
 */

import type { LLMCallOptions, LLMResponse, LLMStreamChunk, LLMConfig } from "@/types";

export interface ILLMProvider {
  complete(options: LLMCallOptions): Promise<LLMResponse>;
  stream(options: LLMCallOptions): AsyncGenerator<LLMStreamChunk>;
}

/**
 * Create an LLM provider based on config.
 */
export function createProvider(config: LLMConfig): ILLMProvider {
  switch (config.provider) {
    case "openai":
      return new OpenAIProvider(config);
    case "anthropic":
      return new AnthropicProvider(config);
    case "custom":
      return new CustomOpenAIProvider(config);
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

// --- OpenAI Provider ---

import OpenAI from "openai";

class OpenAIProvider implements ILLMProvider {
  private client: OpenAI;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(config: LLMConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model;
    this.temperature = config.temperature;
    this.maxTokens = config.maxTokens;
  }

  async complete(options: LLMCallOptions): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: options.messages as OpenAI.Chat.ChatCompletionMessageParam[],
      temperature: options.temperature ?? this.temperature,
      max_tokens: options.maxTokens ?? this.maxTokens,
    });

    return {
      content: response.choices[0]?.message?.content || "",
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }

  async *stream(options: LLMCallOptions): AsyncGenerator<LLMStreamChunk> {
    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: options.messages as OpenAI.Chat.ChatCompletionMessageParam[],
        temperature: options.temperature ?? this.temperature,
        max_tokens: options.maxTokens ?? this.maxTokens,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield { type: "text", content };
        }
      }

      yield { type: "done" };
    } catch (error) {
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

// --- Anthropic Provider ---

import Anthropic from "@anthropic-ai/sdk";

class AnthropicProvider implements ILLMProvider {
  private client: Anthropic;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(config: LLMConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model;
    this.temperature = config.temperature;
    this.maxTokens = config.maxTokens;
  }

  async complete(options: LLMCallOptions): Promise<LLMResponse> {
    const systemMessage = options.messages.find((m) => m.role === "system")?.content || "";
    const nonSystemMessages = options.messages.filter((m) => m.role !== "system");

    const response = await this.client.messages.create({
      model: this.model,
      system: systemMessage,
      messages: nonSystemMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      temperature: options.temperature ?? this.temperature,
      max_tokens: options.maxTokens ?? this.maxTokens,
    });

    const textBlock = response.content.find((b) => b.type === "text");

    return {
      content: textBlock && "text" in textBlock ? textBlock.text : "",
      usage: response.usage
        ? {
            promptTokens: response.usage.input_tokens,
            completionTokens: response.usage.output_tokens,
            totalTokens: response.usage.input_tokens + response.usage.output_tokens,
          }
        : undefined,
    };
  }

  async *stream(options: LLMCallOptions): AsyncGenerator<LLMStreamChunk> {
    try {
      const systemMessage = options.messages.find((m) => m.role === "system")?.content || "";
      const nonSystemMessages = options.messages.filter((m) => m.role !== "system");

      const stream = this.client.messages.stream({
        model: this.model,
        system: systemMessage,
        messages: nonSystemMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        temperature: options.temperature ?? this.temperature,
        max_tokens: options.maxTokens ?? this.maxTokens,
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield { type: "text", content: event.delta.text };
        }
      }

      yield { type: "done" };
    } catch (error) {
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

// --- Custom OpenAI-Compatible Provider ---
// Works with any API that follows the OpenAI chat completions format:
// Ollama, LM Studio, Together AI, Groq, OpenRouter, local servers, etc.

class CustomOpenAIProvider implements ILLMProvider {
  private client: OpenAI;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(config: LLMConfig) {
    if (!config.customBaseUrl) {
      throw new Error(
        "Custom provider requires a base URL. " +
        "Examples: http://localhost:11434/v1 (Ollama), http://localhost:1234/v1 (LM Studio), " +
        "https://api.groq.com/openai/v1 (Groq), https://openrouter.ai/api/v1 (OpenRouter)"
      );
    }

    this.client = new OpenAI({
      apiKey: config.apiKey || "not-needed",
      baseURL: config.customBaseUrl,
      defaultHeaders: config.customHeaders || {},
    });
    this.model = config.model;
    this.temperature = config.temperature;
    this.maxTokens = config.maxTokens;
  }

  async complete(options: LLMCallOptions): Promise<LLMResponse> {
    try {
      const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
        model: this.model,
        messages: options.messages as OpenAI.Chat.ChatCompletionMessageParam[],
        stream: false,
      };

      const temp = options.temperature ?? this.temperature;
      if (temp !== undefined && temp >= 0) {
        params.temperature = temp;
      }
      const maxTok = options.maxTokens ?? this.maxTokens;
      if (maxTok !== undefined && maxTok > 0) {
        params.max_tokens = maxTok;
      }

      const response = await this.client.chat.completions.create(params);

      return {
        content: response.choices[0]?.message?.content || "",
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      // Don't retry on prompt-too-long errors — same prompt will fail again
      const errMsg = error instanceof Error ? error.message.toLowerCase() : "";
      if (
        errMsg.includes("prompt exceeds") ||
        errMsg.includes("max length") ||
        errMsg.includes("context length") ||
        errMsg.includes("too many tokens")
      ) {
        throw error;
      }

      // For other 400 errors (bad params), retry without optional params
      if (error instanceof Error && error.message.includes("400")) {
        console.warn("[Custom Provider] Retrying without optional parameters...");
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: options.messages as OpenAI.Chat.ChatCompletionMessageParam[],
          stream: false,
        });

        return {
          content: response.choices[0]?.message?.content || "",
          usage: response.usage
            ? {
                promptTokens: response.usage.prompt_tokens,
                completionTokens: response.usage.completion_tokens,
                totalTokens: response.usage.total_tokens,
              }
            : undefined,
        };
      }
      throw error;
    }
  }

  async *stream(options: LLMCallOptions): AsyncGenerator<LLMStreamChunk> {
    try {
      const params: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
        model: this.model,
        messages: options.messages as OpenAI.Chat.ChatCompletionMessageParam[],
        stream: true,
      };

      const temp = options.temperature ?? this.temperature;
      if (temp !== undefined && temp >= 0) {
        params.temperature = temp;
      }
      const maxTok = options.maxTokens ?? this.maxTokens;
      if (maxTok !== undefined && maxTok > 0) {
        params.max_tokens = maxTok;
      }

      const stream = await this.client.chat.completions.create(params);

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield { type: "text", content };
        }
      }

      yield { type: "done" };
    } catch (error) {
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
