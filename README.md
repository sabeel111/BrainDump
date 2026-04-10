# BrainDump

**An LLM-powered personal knowledge compiler.** Drop source documents — PDFs, papers, notes, articles — and an LLM incrementally builds and maintains a structured, interlinked wiki with contradiction detection, cross-referencing, and compounding knowledge.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38B2AC?logo=tailwindcss)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## ✨ Features

### 📥 Smart Ingestion
- Upload **any file type** — PDF, DOCX, PPTX, images, markdown, plain text
- Sequential processing queue so knowledge **compounds** across sources
- "Plan Once, Generate Per-Page" pipeline for high-quality output
- LiteParse integration for enterprise-grade document parsing

### 🧠 Auto-Generated Wiki
- LLM reads your sources and creates **interlinked wiki pages** organized into concepts, entities, sources, and topics
- `[[wiki-links]]` connect related pages automatically
- Cross-referencing against existing knowledge with **contradiction detection**
- 7-stage validation pipeline ensures clean, consistent pages

### 💬 Chat with Your Knowledge
- Ask questions against your wiki with **cited, sourced answers**
- Real-time **token-by-token streaming** (ChatGPT-style)
- Multi-turn conversations with persistent sessions
- Save chat answers as new wiki pages

### 🔍 Live Search
- Instant search across all wiki pages with keyword relevance scoring
- Results dropdown with snippets, categories, and keyboard navigation
- `⌘K` / `Ctrl+K` shortcut to focus search from anywhere

### 📁 Obsidian Compatible
- The vault is **plain markdown** with wiki-links and YAML frontmatter
- Open it directly in [Obsidian](https://obsidian.md) for graph view, backlinks, and daily notes

### 🏥 Wiki Health
- Lint engine checks for orphans, broken links, stale claims, and contradictions
- One-click repair suggestions

---

## 📸 Screenshots

> **Dashboard** — Overview of your knowledge base with stats and recent activity
>
> **Wiki Browser** — Browse pages by category with search and filtering
>
> **Chat** — Multi-turn conversations with real-time streaming and citations
>
> **Sources** — Upload, manage, and track ingestion status

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ 
- An LLM API key (OpenAI, Anthropic, or any OpenAI-compatible endpoint)

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/braindump.git
cd braindump
npm install
```

### 2. Configure Your LLM

Copy the environment file and add your API key:

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```
OPENAI_API_KEY=sk-your-key-here
```

Or skip this and configure everything through the **Settings UI** after starting the app — including custom endpoints.

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Start Building

1. **Sources** → Upload a document or paste text
2. Click **Ingest** — the LLM reads it and builds wiki pages
3. Browse your wiki in the **Wiki** tab
4. Ask questions in **Chat**
5. Run **Lint** periodically to keep things healthy

---

## 🔌 LLM Providers

BrainDump is provider-agnostic. Configure in Settings:

| Provider | Key Required | Example Models |
|----------|-------------|----------------|
| **OpenAI** | `OPENAI_API_KEY` | GPT-4o, GPT-4o-mini |
| **Anthropic** | `ANTHROPIC_API_KEY` | Claude 3.5 Sonnet, Claude 3 Opus |
| **Custom** | Varies | Any OpenAI-compatible API |

### Custom Endpoints

Works with any OpenAI-compatible API:

| Service | Base URL |
|---------|----------|
| [Ollama](https://ollama.ai) | `http://localhost:11434/v1` |
| [LM Studio](https://lmstudio.ai) | `http://localhost:1234/v1` |
| [Groq](https://groq.com) | `https://api.groq.com/openai/v1` |
| [Together AI](https://together.ai) | `https://api.together.xyz/v1` |
| [OpenRouter](https://openrouter.ai) | `https://openrouter.ai/api/v1` |
| [DeepSeek](https://deepseek.com) | `https://api.deepseek.com/v1` |

You can also set custom headers (for services that require `HTTP-Referer`, `X-Title`, etc).

---

## 🏗️ Architecture

### Three-Layer Vault

```
vault/
├── raw/              ← Your immutable source documents (markdown)
├── wiki/             ← LLM-generated wiki pages
│   ├── concepts/     ← Abstract ideas and frameworks
│   ├── entities/     ← Named things (people, orgs, tools, benchmarks)
│   ├── sources/      ← Source document summaries
│   └── topics/       ← Broad topic overviews
├── chat/             ← Persistent chat sessions
├── index.md          ← Content catalog (auto-maintained)
├── log.md            ← Activity log (auto-maintained)
└── SCHEMA.md         ← Wiki conventions (LLM reads this)
```

### Ingest Pipeline

```
  Source Document
        │
        ▼
  ┌─────────────────────────────┐
  │  PHASE 1: COMPREHENSION     │
  │                             │
  │  Extract topics/entities    │
  │  Plan pages (slug, title,   │
  │    category, scope, tags)   │
  └─────────────┬───────────────┘
                │
                ▼
  ┌─────────────────────────────┐
  │  PHASE 2: GENERATION        │
  │                             │
  │  For each planned page:     │
  │    → Best chunk selected    │
  │    → Raw markdown generated │
  │    → 7-stage validation     │
  │    → Written to vault       │
  └─────────────────────────────┘
                │
                ▼
  Index & log updated
```

### Sequential Queue

Files are processed **one at a time** so each file sees the wiki updates from the previous one. This ensures knowledge compounds correctly — page 10 benefits from pages 1–9.

### Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/                # API routes (ingest, query, wiki, chat, etc.)
│   ├── chat/               # Chat page
│   ├── dev/                # Dev tools (log viewer, LLM inspector)
│   ├── settings/           # Settings page
│   ├── sources/            # Sources page + detail view
│   └── wiki/               # Wiki browser + page viewer
├── components/
│   ├── chat/               # Chat panel, messages, session list
│   ├── layout/             # Sidebar, header, breadcrumb, theme toggle
│   ├── shared/             # Search bar, loading states, empty states
│   ├── sources/            # Uploader, source list, ingest queue
│   ├── ui/                 # shadcn/ui primitives
│   └── wiki/               # Page viewer, page list, search
├── hooks/                  # React hooks (use-chat, use-wiki, use-sources, etc.)
├── lib/
│   ├── config/             # Constants, settings loader
│   ├── core/               # Engine modules
│   │   ├── vault.ts        # Filesystem abstraction
│   │   ├── wiki-engine.ts  # CRUD for wiki pages
│   │   ├── ingest-engine.ts# Ingestion pipeline orchestration
│   │   ├── query-engine.ts # Query with real-time streaming
│   │   ├── session-manager.ts # Chat session persistence
│   │   ├── page-pipeline.ts  # 7-stage page validation
│   │   └── ...             # Index, log, lint, document parser
│   ├── llm/
│   │   ├── provider.ts     # OpenAI / Anthropic / Custom providers
│   │   └── prompts.ts      # All LLM prompt templates
│   ├── markdown/           # Parser with wiki-link support
│   └── search/             # File-based keyword search
└── types/                  # TypeScript type definitions
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | [Next.js 16](https://nextjs.org) (App Router) |
| **Language** | [TypeScript 5](https://www.typescriptlang.org/) (strict mode) |
| **Styling** | [Tailwind CSS 4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) |
| **LLM** | [OpenAI SDK](https://github.com/openai/openai-node), [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) |
| **Parsing** | [LiteParse](https://github.com/run-llama/lit) (PDF, DOCX, PPTX, images) |
| **Markdown** | [gray-matter](https://github.com/jonschlinkert/gray-matter), [react-markdown](https://github.com/remarkjs/react-markdown) |
| **Font** | [Manrope](https://github.com/sharanda/manrope) |

---

## 🎨 Design System

BrainDump uses **"The Digital Curator"** design system — deep oceanic blues, slate grays, and Old Gold accents. Tonally layered surfaces with no explicit borders and ambient shadows. Built to feel like a sanctuary for knowledge, not a utility dashboard.

- Dark mode supported
- Manrope typeface throughout
- Frosted glass effects and subtle gradients
- Fully responsive

---

## 📡 API Reference

| Route | Method | Description |
|-------|--------|-------------|
| `/api/sources` | `GET` | List all sources |
| `/api/sources` | `POST` | Upload a source (file or text) |
| `/api/ingest` | `POST` | Queue source(s) for ingestion |
| `/api/queue` | `GET` | Get queue status |
| `/api/queue` | `POST` | Retry / cancel / clear jobs |
| `/api/wiki` | `GET` | List pages or get a single page |
| `/api/wiki` | `PUT` | Create or update a page |
| `/api/wiki` | `DELETE` | Delete a page |
| `/api/query` | `POST` | Ask a question (streaming NDJSON) |
| `/api/search` | `GET` | Search wiki pages by keyword |
| `/api/chat` | `GET` | List or get chat sessions |
| `/api/chat` | `POST` | Create a session |
| `/api/chat` | `DELETE` | Delete a session |
| `/api/lint` | `POST` | Run wiki health check |
| `/api/settings` | `GET/PUT` | LLM configuration |
| `/api/init` | `GET/POST` | Vault initialization |
| `/api/dev` | `GET` | Dev tools (logs, LLM inspector) |

---

## 📄 Document Parsing

BrainDump uses [LiteParse](https://github.com/run-llama/lit) for parsing structured documents:

| Format | Engine | Notes |
|--------|--------|-------|
| `.pdf` | LiteParse | Layout-aware extraction |
| `.docx` | LiteParse | Full text + structure |
| `.pptx` | LiteParse | Slide content extraction |
| `.xlsx` | LiteParse | Tabular data extraction |
| `.jpg` / `.png` | LiteParse | OCR + image description |
| `.md` / `.txt` | Native | Direct read |
| `.csv` / `.json` / `.html` | Native | Direct read |

LiteParse is installed automatically as a dependency. No external tools required.

---

## 🧪 Development

### Dev Tools

Navigate to `/dev` for:

- **Activity Log Viewer** — See every ingest, query, and lint operation
- **LLM Call Inspector** — Browse all LLM calls with prompts, responses, and timing
- **Vault Stats** — Page counts, source counts, vault size

### Running in Production

```bash
npm run build
npm start
```

### Future Plans

- [ ] **Graph View** — Interactive knowledge graph visualization
- [ ] **BM25 + Vector Search** — Hybrid search with semantic understanding
- [ ] **URL Fetching** — Ingest web pages and articles directly
- [ ] **Marp Slides** — Generate presentation slides from wiki topics
- [ ] **Parallel Page Generation** — Concurrent generation with configurable concurrency
- [ ] **SSE for Queue** — Real-time queue updates without polling
- [ ] **Tauri / Electron Wrapper** — Desktop app with local-first storage

---

## 📜 License

[MIT](LICENSE)

---

<p align="center">
  Built with ☕ and an unreasonable amount of context windows.
</p>
