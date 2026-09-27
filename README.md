# CV AI

> High-performance, AI-orchestrated CV builder and career experience bank powered by **Typst (WASM)** and **Next.js 16**.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Typst](https://img.shields.io/badge/Render-Typst%20WASM-239dad?style=flat-square)](https://typst.app/)
[![Drizzle ORM](https://img.shields.io/badge/ORM-Drizzle-c5f74f?style=flat-square&logo=drizzle)](https://orm.drizzle.team/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

---

## Overview

**CV AI** is an open-source platform designed to manage career milestones and compile tailored, typeset resumes in seconds. Instead of wrestling with rigid templates or slow cloud compilers, CV AI runs the **Typst compiler directly inside the browser via WebAssembly (WASM)**, combining sub-second compilation with AI adaptation across OpenAI, Anthropic, Gemini, and DeepSeek.

---

## Key Features

- **⚡ Client-Side Typst WASM Engine:** Native, deterministic PDF typesetting running fully in WebAssembly. Zero external LaTeX/Typst server dependencies for live previews.
- **🧠 Experience Bank & Smart Adaptation:** Maintain a centralized repository of all career achievements, projects, and skills. Automatically extract, adapt, and tailor targeted resumes for specific job descriptions.
- **🤖 Multi-Provider Bring-Your-Own-Key (BYOK):** First-class integration via Vercel AI SDK for Anthropic, OpenAI, Google Gemini, DeepSeek, and custom OpenAI-compatible providers, with AES-256-GCM encrypted key storage.
- **📥 Multi-Format Ingestion:** Import existing profiles directly from PDF, DOCX (Word), or GitHub repositories via Octokit and Repomix.
- **📝 CodeMirror & Time-Travel Editing:** Direct YAML source editing with live syntax validation and infinite undo/redo states powered by Zustand and Zundo.
- **🔒 Modern Authentication:** Passwordless and Passkey / WebAuthn-ready auth alongside GitHub OAuth using Better Auth.
- **🗄️ Robust Data Layer:** Relational schema backed by PostgreSQL (Neon serverless) and strictly typed with Drizzle ORM and Zod schemas.

---

## Architecture & Tech Stack

| Domain                | Technology                                                                                                                                                                                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework & UI**    | [Next.js 16](https://nextjs.org/) (App Router, Turbopack), [React 19](https://react.dev/), [Tailwind CSS v4](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/)                                                                                                                         |
| **Typesetting**       | [Typst WASM Compiler & Renderer](https://github.com/Myriad-Dreamin/typst.ts) (`@myriaddreamin/typst.ts`), [`typst-raster`](https://github.com/Enter-tainer/typst-raster)                                                                                                                            |
| **AI Integration**    | [Vercel AI SDK](https://sdk.vercel.ai/) (`@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/deepseek`)                                                                                                                                                                               |
| **Database & ORM**    | [PostgreSQL (Neon Serverless)](https://neon.tech/), [Drizzle ORM](https://orm.drizzle.team/)                                                                                                                                                                                                        |
| **Auth & Security**   | [Better Auth](https://www.better-auth.com/) (GitHub OAuth & WebAuthn / Passkeys), AES-256-GCM key encryption                                                                                                                                                                                        |
| **State & Ingestion** | [Zustand](https://zustand-demo.pmnd.rs/) + [Zundo](https://github.com/charkour/zundo), [CodeMirror](https://codemirror.net/), [Octokit](https://github.com/octokit/octokit.js), [Repomix](https://github.com/yamadashy/repomix), [Mammoth](https://github.com/mwilliamson/mammoth.js), `pdfjs-dist` |

---

## Getting Started

### Prerequisites

- **Node.js:** `v20.x` or later
- **Package Manager:** `pnpm` (`v9.x` or later recommended)
- **Database:** PostgreSQL database connection (e.g., [Neon](https://neon.tech/))

### 1. Clone & Install

```bash
git clone https://github.com/calcinas-adrian/cv-maker.git
cd cv-maker
pnpm install
```

### 2. Environment Configuration

Copy the example environment file:

```bash
cp .env.local.example .env.local
```

Configure the required variables in `.env.local`:

```ini
# PostgreSQL connection string (pooled connection recommended)
DATABASE_URL="postgres://user:password@host/dbname?sslmode=require"

# Better Auth Secret (generate with: openssl rand -base64 32)
BETTER_AUTH_SECRET="your-32-byte-base64-secret"
BETTER_AUTH_URL="http://localhost:3000"

# GitHub OAuth credentials
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"

# Passkey / WebAuthn Configuration
PASSKEY_RP_ID="localhost"
PASSKEY_RP_NAME="CV AI"

# Master Encryption Key for BYOK API keys (generate with: openssl rand -hex 32)
ENCRYPTION_KEY="your-32-byte-hex-encryption-key"
```

### 3. Database Migration

Push schema migrations to your PostgreSQL database:

```bash
pnpm db:migrate
```

### 4. Start Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to access the application.

---

## Project Structure

```text
cv-ai/
├── app/                  # Next.js App Router (pages, layouts, API routes)
│   ├── (dashboard)/      # Authenticated workspace & editors
│   │   ├── ai-providers/ # BYOK AI provider configurations
│   │   ├── applications/ # Job applications tracking
│   │   ├── bank/         # Centralized career experience bank
│   │   ├── cv/           # Live CV editor & Typst preview
│   │   └── dashboard/    # User overview dashboard
│   ├── api/              # API endpoints (Auth, Render, Typst Assets)
│   └── login/            # Authentication & onboarding flow
├── components/           # Reusable UI & Presentational components
├── schemas/              # Zod validation schemas (CV, Bank, Adaptation, Keys)
├── scripts/              # Build scripts (e.g. Typst WASM asset sync)
├── templates/            # Typst document templates (e.g. classic.typ)
└── types/                # Ambient and API type definitions
```

---

## Available Scripts

| Command            | Description                                                                   |
| ------------------ | ----------------------------------------------------------------------------- |
| `pnpm dev`         | Copies Typst WASM assets and runs Next.js in development mode with Turbopack. |
| `pnpm build`       | Syncs WASM assets and creates an optimized production build.                  |
| `pnpm start`       | Starts the production server.                                                 |
| `pnpm lint`        | Runs ESLint checks.                                                           |
| `pnpm db:generate` | Generates SQL migrations from the Drizzle schema.                             |
| `pnpm db:migrate`  | Executes pending migrations against the target database.                      |

---

## Contributing

Contributions are welcome! If you want to contribute:

1. Fork the repository.
2. Create a feature branch (`git checkout -b feat/your-feature`).
3. Commit your changes following [Conventional Commits](https://www.conventionalcommits.org/).
4. Push to the branch (`git push origin feat/your-feature`).
5. Open a Pull Request.

---

## License

This project is licensed under the [MIT License](LICENSE).
