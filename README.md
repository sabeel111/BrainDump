# Knowledge Wiki

**An LLM-powered personal knowledge compiler.** Drop source documents, and an LLM incrementally builds and maintains a structured, interlinked wiki of markdown files.

## Features

- 📥 **Source Ingestion** — Upload files, paste text, drag & drop. Sources are queued and processed sequentially.
- 🧠 **LLM-Powered Wiki** — Automatically creates concept pages, entity pages, topic overviews, and source summaries.
- 🔗 **Cross-Referencing** — Wiki-links (`[[page-name]]`) connect related pages automatically.
- ⚠️ **Contradiction Detection** — Flags when new sources contradict existing wiki content.
- 💬 **Chat Queries** — Ask questions against your wiki with cited answers.
- 🔍 **Search** — Find pages by keyword, title, or content.
- 🩺 **Lint** — Health-check the wiki for orphans, broken links, and contradictions.
- 📁 **Obsidian Compatible** — The vault is plain markdown with wiki-links. Open it in Obsidian for graph view and browsing.

## Tech Stack

- **Next.js 16** (App Router, TypeScript)
- **Tailwind CSS** + **shadcn/ui**
- **OpenAI** or **Anthropic** (configurable)
- **File-based vault** (markdown + YAML frontmatter)

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure your LLM

Copy the environment file and add your API key:

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```
OPENAI_API_KEY=sk-your-key-here
```

Or configure through the Settings page after starting the app.

### 3. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Configure LLM in Settings

Go to the **Settings** page and select your provider, model, and enter your API key.

### 5. Start building your wiki

1. Go to **Sources** → Upload a document or paste text
2. Click **Ingest** — the LLM reads it, extracts knowledge, and builds wiki pages
3. Browse your wiki in the **Wiki** tab
4. Ask questions in **Chat**
5. Run **Lint** periodically to keep the wiki healthy

## How It Works

### Three Layers

```
vault/
├── raw/          ← Your immutable source documents
├── wiki/         ← LLM-generated wiki pages
│   ├── concepts/
│   ├── entities/
│   ├── sources/
│   └── topics/
├── index.md      ← Content catalog (auto-maintained)
├── log.md        ← Activity log (auto-maintained)
└── SCHEMA.md     ← Wiki conventions (LLM reads this)
```

### Ingest Pipeline

When you ingest a source:

1. **Read** the source document
2. **Extract** topics, entities, concepts
3. **Find** related existing wiki pages (via index)
4. **Read** those existing pages
5. **Compare** new source vs existing knowledge
6. **Generate** new/updated wiki pages
7. **Write** pages to the vault
8. **Update** index.md and log.md

### Sequential Queue

Multiple files are queued and processed **one at a time**. Each file sees the wiki updates from the previous file. This ensures knowledge compounds correctly.

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/sources` | GET/POST | List or upload sources |
| `/api/ingest` | POST | Queue source(s) for ingestion |
| `/api/ingest` | GET | Get queue status |
| `/api/queue` | POST | Retry/cancel/clear jobs |
| `/api/wiki` | GET | List pages or get single page |
| `/api/wiki` | PUT | Create or update a page |
| `/api/wiki` | DELETE | Delete a page |
| `/api/query` | POST | Ask a question (streaming) |
| `/api/lint` | POST | Run health check |
| `/api/settings` | GET/PUT | LLM configuration |
| `/api/init` | GET/POST | Vault initialization |

## Project Structure

```
src/
├── app/               # Next.js pages and API routes
├── components/        # UI components
│   ├── chat/          # Chat interface
│   ├── layout/        # Sidebar, header, breadcrumb
│   ├── shared/        # Loading, empty states
│   ├── sources/       # Uploader, list, queue
│   ├── ui/            # shadcn/ui primitives
│   └── wiki/          # Page viewer, list, search
├── hooks/             # React hooks
├── lib/
│   ├── config/        # Constants, settings
│   ├── core/          # Vault, wiki-engine, ingest, query, lint
│   ├── llm/           # Provider abstraction, prompts
│   ├── markdown/      # Parser, frontmatter
│   └── search/        # File-based search
└── types/             # TypeScript type definitions
```

## License

MIT
