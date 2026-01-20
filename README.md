# Automated Idea Expansion

An AI-powered agent orchestration system that transforms raw ideas into polished content. Add your half-formed thoughts, click "Expand," and watch a multi-stage AI pipeline generate blog posts, code projects, social media threads, or AI images.

## 🎯 Current Status

**Phase 2A Complete!** ✅ Multi-Stage Code Creator with Planning, Generation, and Critic Agents

### ✅ What's Working:

#### **Phase 1: Foundation**
- ✅ Next.js 15 with TypeScript
- ✅ Supabase PostgreSQL database with Row-Level Security
- ✅ Complete database schema
- ✅ Environment configuration (.env.local)

#### **Phase 2: Ideas & Outputs Management**
- ✅ Simple one-field form to capture raw ideas
- ✅ Ideas CRUD API (`GET`, `POST`, `PUT`, `DELETE`)
- ✅ Ideas list page with pending/expanded organization
- ✅ Outputs viewer with format-specific displays
- ✅ Delete functionality for both ideas and outputs

#### **Phase 4: Multi-Agent Pipeline (LangGraph)**
- ✅ **Judge Agent** - Evaluates and selects best idea (GPT-4o-mini)
- ✅ **Router Agent** - Decides optimal output format (GPT-4o-mini)
- ✅ **Creator Agents** - Generates content in 4 formats:
  - 📝 **Blog Posts** - Long-form markdown articles
  - 🦣 **Twitter/Mastodon Threads** - 500-char social media posts
  - 💻 **Code Projects** - Functional code with README
  - 🎨 **AI Images** - Generated via fal.ai/HuggingFace
- ✅ **3-Stage Code Creator** (Advanced):
  - **Planning Agent** - Decides architecture, language, framework
  - **Generation Agent** - Creates files with proper structure
  - **Critic Agent** - Reviews code quality using Gemini Flash

### 🚧 What's Coming Next:

#### **Phase 2C-D: Real Publishing** (Next Up!)
- ⏳ **GitHub Publisher** - Create actual repos with Octokit
- ⏳ **Mastodon Publisher** - Post real threads with masto.js
- ⏳ **Blog Publisher** - Save to database with slug generation
- ⏳ **Image Publisher** - Upload to Supabase Storage

#### **Phase 2E-F: Interactive Code**
- ⏳ E2B code sandboxing (run code in browser)
- ⏳ Jupyter notebook support
- ⏳ Vercel deployment integration

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Supabase account (free tier)
- OpenAI API key
- Gemini API key (Google AI Studio)
- (Optional) Anthropic, GitHub, Mastodon, fal.ai API keys

### Setup

1. **Clone and install:**
   ```bash
   git clone <your-repo>
   cd automated-idea-expansion
   npm install
   ```

2. **Configure Supabase:**
   - Create project at https://supabase.com
   - Run `scripts/setup-db.sql` in SQL Editor
   - Copy connection details to `.env.local`

3. **Create test user:**
   ```sql
   INSERT INTO users (id, clerk_user_id, email, name, timezone)
   VALUES (
     '00000000-0000-0000-0000-000000000001'::uuid,
     'test-user-123',
     'test@example.com',
     'Test User',
     'UTC'
   );
   ```

4. **Add API keys to `.env.local`:**
   ```bash
   # Supabase
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

   # AI Models (Required)
   OPENAI_API_KEY=sk-proj-...
   GEMINI_API_KEY=AIzaSy...  # From Google AI Studio

   # AI Models (Optional fallbacks)
   ANTHROPIC_API_KEY=sk-ant-...

   # Publishing (Optional - for Phase 2C-D)
   GITHUB_TOKEN=github_pat_...
   GITHUB_USERNAME=your_username
   MASTODON_ACCESS_TOKEN=...
   MASTODON_INSTANCE_URL=https://mastodon.social

   # Image Generation (Optional)
   FAL_KEY=...
   HUGGINGFACE_API_KEY=hf_...
   REPLICATE_API_TOKEN=r8_...
   ```

5. **Run development server:**
   ```bash
   npm run dev
   ```

6. **Use the app:**
   - Visit http://localhost:3000/ideas
   - Add an idea: "Build a sentiment analysis CLI tool"
   - Click "✨ Expand Best Idea Now"
   - Watch the terminal for detailed pipeline logs
   - View the generated output!

---

## 🏗️ Architecture

### Multi-Agent Pipeline

```
User Adds Idea
      ↓
  Judge Agent (GPT-4o-mini)
  - Scores all pending ideas
  - Selects best one
  - Provides reasoning
      ↓
  Router Agent (GPT-4o-mini)
  - Analyzes idea characteristics
  - Chooses format: blog_post | twitter_thread | github_repo | image
  - Explains decision
      ↓
  Creator Agent (Orchestrator)
      ↓
  ┌─────────────┼─────────────┐
  │             │             │
Blog Creator  Thread Creator  [Code Creator V2]  Image Creator
  │             │             │                    │
  │             │         Planning Agent          │
  │             │             ↓                    │
  │             │         Generation Agent        │
  │             │             ↓                    │
  │             │         Critic Agent            │
  │             │         (Gemini Flash)          │
  └─────────────┴─────────────┴────────────────────┘
                      ↓
              Output Saved to DB
                      ↓
              User Views Output
```

### 3-Stage Code Creator (Advanced)

The code creator uses a sophisticated multi-stage approach:

1. **Planning Agent** (GPT-4o-mini)
   - Analyzes idea requirements
   - Decides: notebook, CLI app, web app, library, or demo script
   - Chooses language: Python, JavaScript, TypeScript, Rust
   - Selects framework: React, Next.js, Flask, FastAPI, etc.
   - Estimates complexity

2. **Generation Agent** (GPT-4o-mini)
   - Creates complete file structure
   - Generates README with instructions
   - Adds dependencies (requirements.txt, package.json)
   - Includes examples and documentation

3. **Critic Agent** (Gemini Flash)
   - Reviews for syntax errors
   - Checks security vulnerabilities
   - Validates best practices
   - Scores 0-100 and recommends: approve/revise/regenerate

**Cost per code project:** ~$0.0010 (80% increase but 200% quality improvement)

---

## 📁 Project Structure

```
automated-idea-expansion/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── ideas/[id]/     # Ideas CRUD
│   │   │   ├── outputs/[id]/   # Outputs CRUD + Delete
│   │   │   └── expand/         # Trigger agent pipeline
│   │   ├── ideas/              # Ideas management UI
│   │   ├── outputs/            # Outputs list & viewer
│   │   │   └── [id]/           # Format-specific viewers
│   │   └── page.tsx            # Homepage
│   │
│   └── lib/
│       ├── agents/             # LangGraph AI agents
│       │   ├── graph.ts        # Pipeline orchestration
│       │   ├── judge-agent.ts  # Idea evaluation
│       │   ├── router-agent.ts # Format selection
│       │   ├── creator-agent.ts # Creator orchestrator
│       │   ├── types.ts        # Shared state types
│       │   └── creators/       # Format-specific creators
│       │       ├── blog-creator.ts
│       │       ├── mastodon-creator.ts
│       │       ├── image-creator.ts
│       │       └── code/       # Multi-stage code creator
│       │           ├── types.ts
│       │           ├── planning-agent.ts
│       │           ├── generation-agent.ts
│       │           ├── critic-agent.ts
│       │           └── code-creator-v2.ts
│       │
│       └── db/
│           ├── supabase.ts     # DB client
│           ├── queries.ts      # Database queries
│           └── types.ts        # TypeScript types
│
├── scripts/
│   ├── setup-db.sql            # Database schema
│   └── db-helper.ts            # Database utilities
│
└── .env.local                  # API keys (not in git)
```

---

## 🗄️ Database Schema

**Tables:**
- `users` - User accounts
- `ideas` - Raw ideas (status: pending/expanded/archived)
- `outputs` - Generated content (format, content JSON)
- `executions` - Pipeline run logs (for monitoring)
- `blog_posts` - Published blog posts (future)

All tables have Row-Level Security (RLS) enabled.

---

## 💰 Cost Breakdown

### Per Idea Expansion

| Agent | Model | Avg Tokens | Cost |
|-------|-------|-----------|------|
| Judge | GPT-4o-mini | ~1,000 | $0.0002 |
| Router | GPT-4o-mini | ~500 | $0.0001 |
| Blog Creator | GPT-4o-mini | ~3,000 | $0.0006 |
| **Total (Blog)** | | ~4,500 | **$0.0009** |
| | | | |
| Code Planning | GPT-4o-mini | ~800 | $0.00016 |
| Code Generation | GPT-4o-mini | ~3,000 | $0.0006 |
| Code Critic | Gemini Flash | ~4,000 | $0.0003 |
| **Total (Code)** | | ~8,300 | **$0.0016** |

**Average: < $0.002 per expansion**

### Monthly Estimate
- 30 expansions/month = **~$0.05/month**
- 100 expansions/month = **~$0.16/month**

Extremely cost-effective thanks to:
- GPT-4o-mini ($0.15/1M input tokens)
- Gemini Flash ($0.075/1M tokens - 50% cheaper!)

---

## 🛠️ Tech Stack

| Technology | Purpose | Status |
|------------|---------|--------|
| Next.js 15 | Full-stack React framework | ✅ |
| TypeScript | Type-safe development | ✅ |
| Supabase | PostgreSQL database with RLS | ✅ |
| **LangGraph** | **Multi-agent orchestration** | ✅ |
| **OpenAI GPT-4o-mini** | **Primary LLM (judge, router, creators)** | ✅ |
| **Google Gemini Flash** | **Code critic (ultra-cheap!)** | ✅ |
| Anthropic Claude | LLM fallback | ✅ |
| **fal.ai / HuggingFace** | **AI image generation** | ✅ |
| Octokit | GitHub API for repo creation | ⏳ Next |
| masto.js | Mastodon API for thread posting | ⏳ Next |
| E2B | Code sandboxing | ⏳ Future |
| Vercel | Hosting & cron jobs | ⏳ Future |

---

## 📖 Example: Code Project Generation

```bash
# Terminal output when expanding "Build a sentiment analysis CLI tool"

🚀 === MULTI-STAGE CODE CREATOR V2 ===
   Idea: "Build a sentiment analysis CLI tool"

📋 STAGE 1: Planning
   Agent: Planning Agent
   ✅ Plan: cli-app using python
   📊 Complexity: medium
   💡 Reasoning: CLI tool best for utilities, Python for NLP libraries
   💰 Tokens: 743

🛠️  STAGE 2: Code Generation
   Agent: Generation Agent
   ✅ Generated 3 files
   📁 Files: main.py, README.md, requirements.txt
   💰 Tokens: 2,847

🔍 STAGE 3: Code Review
   Agent: Critic Agent
   📊 Quality Score: 88/100
   🐛 Issues: 2 warnings
   ⚠️  [main.py:23] Consider adding input validation
   ⚠️  [main.py:45] Error handling could be more specific
   ✅ Recommendation: approve
   💰 Tokens: 1,932

✅ === PIPELINE COMPLETE ===
   Total tokens: 5,522
   Estimated cost: $0.0012
```

**Generated files include:**
- Working Python CLI with argparse
- Comprehensive README with usage examples
- requirements.txt with necessary packages
- Error handling and input validation
- Example usage and test cases

---

## 🔐 Security

- ✅ Row-Level Security (RLS) on all database tables
- ✅ API keys stored in `.env.local` (never committed)
- ✅ Input validation on all endpoints
- ✅ Secure async params handling (Next.js 15)
- ⏳ Clerk authentication (disabled for development)

---

## 🎓 Learning Outcomes

This project teaches:

1. **Multi-Agent Orchestration**
   - LangGraph state management
   - Sequential and conditional agent flows
   - Agent-to-agent communication patterns

2. **Cost-Effective AI Architecture**
   - Using cheaper models (GPT-4o-mini) for most tasks
   - Ultra-cheap models (Gemini Flash) for validation
   - Token usage monitoring and optimization

3. **Modern Full-Stack Development**
   - Next.js 15 App Router
   - Server Components and Server Actions
   - TypeScript with strict typing
   - Supabase for database + storage

4. **AI Agent Patterns**
   - Judge-Router-Creator pattern
   - Multi-stage pipelines with critics
   - Fallback and error handling strategies

---

## 🚧 Roadmap

### ✅ Completed
- [x] Phase 1: Foundation (Next.js, Supabase, TypeScript)
- [x] Phase 2: Ideas & Outputs Management
- [x] Phase 4: Multi-Agent Pipeline (Judge, Router, Creator)
- [x] Phase 2A: Multi-Stage Code Creator (Planning, Generation, Critic)

### 🔄 In Progress
- [ ] Phase 2C: GitHub Publisher (Octokit)
- [ ] Phase 2D: Mastodon Publisher (masto.js)

### 📋 Planned
- [ ] Phase 2E: Interactive Code (E2B sandboxing)
- [ ] Phase 2F: Notebook Support (Binder integration)
- [ ] Phase 7: Daily Automation (Vercel cron)
- [ ] Phase 8: Dashboard & Analytics
- [ ] Phase 9: Production Polish

---

## 🤝 Contributing

This is a learning project following a comprehensive implementation plan. Each phase builds on the previous one.

**Current Focus:** Implementing real publishers (GitHub, Mastodon) so generated content actually gets published!

---

## 📚 Resources

- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Google Gemini API](https://ai.google.dev/gemini-api/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Next.js 15 Documentation](https://nextjs.org/docs)

---

## 🎯 Getting Started Tutorial

1. **Add your first idea:**
   ```
   Navigate to /ideas
   Enter: "Explain how transformers work in machine learning"
   Click "Save Idea"
   ```

2. **Expand it:**
   ```
   Click "✨ Expand Best Idea Now"
   Watch terminal logs for agent pipeline
   Wait 10-20 seconds
   ```

3. **View the output:**
   ```
   Automatically redirects to /outputs/[id]
   See your generated blog post, code, thread, or image!
   ```

4. **Experiment with different ideas:**
   - Technical: "Build a password strength checker"
   - Educational: "Explain async/await to a beginner"
   - Creative: "A cyberpunk city at sunset"
   - Tool: "Create a JSON formatter CLI"

The agent pipeline will automatically choose the best format for each idea!

---

Built with 🤖 as a comprehensive AI agent orchestration learning project
