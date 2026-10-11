# DocuPulse 

**Continuous, Branch-Aware Technical Documentation Powered by AI**

>  **Project Status: Day 1 — Early Active Development**
>
> DocuPulse is actively under construction. We are currently building **Phase 1: GitHub Webhook Ingestion & Notion Sync**.

[Features](#-key-features) • [Roadmap](#️-development-roadmap) • [Architecture](#-architecture) • [Getting Started](#-getting-started) • [Documentation Branching](#-how-documentation-branching-works) • [License](#-license)

## What is DocuPulse?

**DocuPulse** is an automated developer documentation platform that bridges the gap between your codebase and your internal knowledge base (Notion, Confluence, GitHub Wikis, Slack).

Instead of forcing teams to migrate to yet another hosted doc portal, DocuPulse monitors your source control webhooks, analyzes code diffs via LLMs, and **automatically updates your existing workspaces in real-time**.

With **native Git-style documentation branching**, DocuPulse ensures your production docs never get updated prematurely until code actually merges into `main`.

## Development Roadmap

* \[x\] **Phase 0: Foundation** — Architecture design, technical spec, and repository setup.

* \[ \] **Phase 1: MVP Core (In Progress)** — GitHub App Webhook receiver, LLM diff parser, and basic Notion page block syncing.

* \[ \] **Phase 2: PR Gatekeeper** — CI/CD status checks and automated PR review comments with one-click doc patches.

* \[ \] **Phase 3: Branch-Aware Sync** — Temporary doc preview pages for `feature/*` branches that merge into production docs on PR merge.

* \[ \] **Phase 4: Confluence & Markdown Sync** — Multi-destination engine expanding support beyond Notion.

* \[ \] **Phase 5: Living Diagrams** — Dynamic architecture flowchart generation using IaC files and Mermaid.js.

* \[ \] **Phase 6: AI Knowledge Graph** — Vector database indexing for natural language Slack / IDE Q&A.

##  Key Features (Target Capabilities)

*  **Automated Code-to-Doc Sync:** Parses code diffs from PRs, database schema changes, and OpenAPI updates to keep Notion, Confluence, and Markdown pages up to date.

*  **Git-Style Documentation Branching:** Creates isolated documentation draft pages or preview links for feature branches (`feature/*`). Updates only hit main production docs when PRs are merged.

*  **Preventive PR Gatekeeper:** Acts as a CI/CD check. Detects breaking API or structural changes without docs and offers single-click inline doc fixes directly inside GitHub/GitLab PR comments.

*  **Living Architecture Maps:** Automatically extracts dependencies from Infrastructure-as-Code files (Terraform, Docker Compose) and renders dynamic, auto-updating Mermaid.js flowcharts.

*  **Engineering Knowledge Graph & Slack Bot:** Indexes commit history, PR discussions, and external docs into a vector database for instant natural language Q&A.

##  System Architecture

```
                                [GitHub / GitLab / Bitbucket]
                                             │
                                             ▼ (Webhook Events)
                                [Ingestion & Filtering Layer]
                                             │
                                             ▼
                             [AST Parser & Diff Extraction]
                                             │
                                             ▼
                              [AI Engine (Claude 3.5 / GPT-4o)]
                                             │
           ┌─────────────────────────────────┼─────────────────────────────────┐
           ▼                                 ▼                                 ▼
[Module 1: PR Gatekeeper]       [Module 2: Branch-Aware Sync]     [Module 3: Living Diagrams]
 (CI Checks & PR Comments)       (Notion / Confluence / Markdown)   (Mermaid.js Architecture Maps)

```

##  Tech Stack

* **Frontend:** Next.js 15, React, Tailwind CSS, Shadcn UI

* **Backend API:** Node.js (TypeScript), Fastify

* **Database:** PostgreSQL (Supabase / Neon), Qdrant (Vector DB)

* **Background Jobs:** Inngest / Trigger.dev

* **AI Processing:** Claude 3.5 Sonnet / OpenAI GPT-4o

* **Integrations:** GitHub App, Atlassian Connect API, Notion REST API, Slack Bolt API

##  Getting Started

### Prerequisites

* Node.js 20.x or later

* pnpm / npm / yarn

* Local PostgreSQL instance or Supabase/Neon connection string

* GitHub Developer Account (for setting up a local test GitHub App)

### Local Setup

1. **Clone the repository:**

   ```
   git clone https://github.com/your-org/docupulse.git
   cd docupulse
   
   ```

2. **Install dependencies:**

   ```
   pnpm install
   
   ```

3. **Set up Environment Variables:**
   Copy the example environment configuration file:

   ```
   cp .env.example .env.local
   
   ```

   Configure required keys inside `.env.local`:

   ```
   DATABASE_URL="postgresql://user:password@localhost:5432/docupulse"
   OPENAI_API_KEY="sk-..."
   ANTHROPIC_API_KEY="sk-ant-..."
   GITHUB_APP_ID="12345"
   GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY..."
   NOTION_CLIENT_SECRET="secret_..."
   
   ```

4. **Run Database Migrations:**

   ```
   pnpm db:migrate
   
   ```

5. **Start the Development Server:**

   ```
   pnpm dev
   
   ```

##  How Documentation Branching Works

```
Git Branch: feature/api-v2                      Git Branch: main
┌─────────────────────────────┐                ┌─────────────────────────────┐
│ 1. Developer pushes code    │                │ 3. PR Merged                │
│    to feature/api-v2        │                │    into main                │
└──────────────┬──────────────┘                └──────────────┬──────────────┘
               │                                              │
               ▼                                              ▼
┌─────────────────────────────┐                ┌─────────────────────────────┐
│ 2. DocuPulse creates        │                │ 4. DocuPulse merges         │
│    Doc Draft Preview Page   │───────────────►│    Doc Draft into           │
│    (Linked in PR Comment)   │                │    Production Workspace     │
└─────────────────────────────┘                └─────────────────────────────┘

```

1. **On Branch Creation / PR Open:** DocuPulse creates an isolated preview page in Notion or Confluence.

2. **On PR Commit:** DocuPulse continuously updates the preview page as the code evolves.

3. **On PR Merge:** DocuPulse atomically merges the preview documentation into your primary production workspace and cleans up the temporary draft page.

##  Security & Privacy

* **Zero Code Retention:** DocuPulse processes code diffs in-memory during analysis. Code is never stored permanently on our servers.

* **Enterprise Encryption:** All integration tokens (GitHub, Notion, Atlassian) are encrypted at rest using AES-256.

##  Contributing

We are in early active development! Contributions, feedback, and issue discussions are welcome. Please check out our [Contributing Guide](CONTRIBUTING.md) to get started.

##  License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
