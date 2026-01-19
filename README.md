# Automated Idea Expansion

A SaaS application that automatically expands your half-formed ideas into polished content using AI agents. Drop your raw thoughts, and every day the system evaluates them, selects the best one, and creates content in the optimal format (blog post, Twitter thread, GitHub repo, or AI-generated image).

## 🎯 Current Status

**Phase 3 Complete!** ✅

### What's Working:

✅ **Phase 1: Foundation**
- Next.js 15 with TypeScript
- Supabase PostgreSQL database
- Complete database schema with Row-Level Security
- Environment variables configured

✅ **Phase 2: Ideas Management**
- Simple one-field form to capture raw ideas
- CRUD API for ideas (`GET`, `POST`, `PUT`, `DELETE`)
- Ideas list page at `/ideas`
- Status tracking (pending/expanded/archived)
- Database queries with TypeScript types

✅ **Phase 3: Credential Storage**
- AES-256-GCM encryption utilities
- Secure credential storage with encryption at rest
- CRUD API for credentials (`GET`, `POST`, `DELETE`)
- API key validation endpoint (tests OpenAI, Anthropic, GitHub, Replicate)
- Credentials management UI at `/credentials`
- Support for 5 providers: OpenAI, Anthropic, GitHub, Twitter, Replicate

### What's Missing (Still TODO):
- Clerk authentication (temporarily disabled)
- Multi-agent AI system with LangGraph
- Content generation and publishing
- Daily automation

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Supabase account (free tier works)

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Supabase:**
   - Create project at https://supabase.com
   - Run `scripts/setup-db.sql` in SQL Editor
   - Add test user (see SQL below)
   - Copy API keys to `.env.local`

3. **Create test user in Supabase:**
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

4. **Run dev server:**
   ```bash
   npm run dev
   ```

5. **Visit http://localhost:3000**
   - Click "Manage Ideas" to add your raw ideas
   - Click "API Credentials" to add encrypted API keys

---

## 📁 Project Structure

```
automated-idea-expansion/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── ideas/            # Ideas CRUD endpoints
│   │   │   └── credentials/      # Credentials CRUD & validation
│   │   ├── ideas/                # Ideas management UI
│   │   ├── credentials/          # Credentials management UI
│   │   ├── layout.tsx            # Root layout
│   │   └── page.tsx              # Homepage
│   │
│   └── lib/
│       ├── db/
│       │   ├── supabase.ts       # DB client
│       │   ├── queries.ts        # Database queries
│       │   └── types.ts          # TypeScript types
│       └── encryption/
│           └── aes.ts            # AES-256-GCM encryption
│
├── scripts/
│   └── setup-db.sql              # Database schema
│
└── .env.local                   # Your secrets (not in git)
```

---

## 🗄️ Database Schema

**Tables:**
- `users` - User accounts (synced from Clerk eventually)
- `ideas` - Raw ideas waiting to be expanded
- `credentials` - Encrypted API keys (Phase 3)
- `executions` - Daily run logs (Phase 7)
- `outputs` - Generated content (Phase 6)
- `blog_posts` - Published blog posts (Phase 6)

All tables have Row-Level Security enabled.

---

## 📋 Roadmap

### ✅ Phase 1: Foundation (DONE)
- Next.js setup
- Database schema
- Environment configuration

### ✅ Phase 2: Ideas Management (DONE)
- Simple idea capture form
- CRUD API
- Ideas list page

### ✅ Phase 3: Credential Storage (DONE)
- AES-256-GCM encryption
- Store API keys for OpenAI, Anthropic, GitHub, Twitter, Replicate
- Validation endpoints
- Credentials management UI

### 🔄 Phase 4-5: Multi-Agent AI System (NEXT)
- LangGraph orchestration
- Judge Agent (selects best idea)
- Router Agent (chooses format)
- Creator Agents (4 types: blog, Twitter, GitHub, image)

### Phase 6: Publishing
- Blog post publisher (to database)
- Twitter thread poster (via API)
- GitHub repo creator (via Octokit)
- Image generator (via Replicate)

### Phase 7: Daily Automation
- Orchestrator workflow
- Vercel cron job
- Execution logging

### Phase 8: Dashboard
- Homepage with stats
- Execution history
- Output viewers
- Public blog

### Phase 9: Production Polish
- Error tracking (Sentry)
- Performance optimization
- Security audit
- Documentation

---

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| Next.js 15 | Full-stack React framework |
| TypeScript | Type-safe development |
| Supabase | PostgreSQL database with RLS |
| LangGraph | Multi-agent orchestration (coming) |
| OpenAI/Anthropic | LLM providers (coming) |
| Replicate | AI image generation (coming) |
| GitHub API | Repo creation (coming) |
| Twitter API | Thread posting (coming) |
| Vercel | Hosting & cron jobs (for deployment) |

---

## 🔐 Security

- **AES-256-GCM encryption** for API credentials (Phase 3)
- **Row-Level Security** on all database tables
- **Webhook verification** for external integrations
- **Cron secret** for scheduled job protection
- **Environment variables** never committed to git

---

## 💡 How It Works (Eventually)

1. **You add ideas** - Paste raw thoughts, no structure needed
2. **Daily cron runs** - Every day at 9 AM UTC
3. **Judge Agent evaluates** - Scores all pending ideas
4. **Router Agent decides** - Picks best format for the idea
5. **Creator Agent generates** - Creates content in chosen format
6. **Publisher distributes** - Posts to appropriate platform
7. **You wake up** - New content is live!

---

## 📖 Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)

---

## 🤝 Development Status

This is an active learning project following a comprehensive implementation plan. Each phase builds on the previous one, teaching modern full-stack development with AI agents.

**Current Phase:** Completed Phase 3 (Credential Storage) ✅
**Next Phase:** Phase 4-5 (Multi-Agent AI System with LangGraph)

---

Built with ❤️ as a comprehensive AI-powered SaaS tutorial
