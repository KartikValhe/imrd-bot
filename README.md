# RCPET's IMRD AI Campus Assistant (Multilingual RAG in Node.js)

Official AI campus assistant for **R. C. Patel Educational Trust's Institute of Management Research and Development (RCPET's IMRD), Shirpur**. Built with a static responsive frontend and a high-performance, enterprise-scalable Node.js API supporting **English, Hindi (हिन्दी), and Marathi (मराठी)**.

Answers are strictly grounded in RCPET IMRD's scraped website data, academic brochures, and library Koha catalog records in `docs/data/`, with strict guardrails preventing out-of-scope or general hallucinations.

* **Official Website**: [https://www.rcpimrd.ac.in/](https://www.rcpimrd.ac.in/)
* **Institution**: R. C. Patel Educational Trust's IMRD, Shirpur, Dist. Dhule, Maharashtra (DTE Code: 5150)
* **Approvals & Accreditations**: Approved by AICTE New Delhi, Accredited with 'B+' Grade by NAAC (1st Cycle), Affiliated to Kavayitri Bahinabai Chaudhari North Maharashtra University (KBCNMU), Jalgaon.

---

## Key Features

### 1. Multilingual Support (English, Hindi, Marathi)
* **Instant UI Language Switcher**: One-click toggling between English, हिन्दी, and मराठी. Dynamically updates welcome cards, prompt suggestions, input placeholders, and badge text.
* **Voice Speech-to-Text (STT)**: Uses Web Speech API with automatic locale binding (`en-IN`, `hi-IN`, `mr-IN`) for seamless native voice chatting.
* **Text-to-Speech (TTS) Read Aloud**: Reads out answers with Markdown/URL sanitization and an auto-resumed keep-alive heartbeat to prevent browser pauses on long answers.
* **Cross-Lingual RAG Bridge**: Automatically translates Marathi and Hindi queries into English search keywords for high-precision vector retrieval against the knowledge base, returning natural answers in the student's selected language.
* **Localized Guardrails**: Formal greetings (नमस्ते / नमस्कार / Hello) and out-of-scope notices are localized to the user's language.

### 2. High-Performance Hybrid RAG Engine
* **Hybrid Search (Dense Vectors + BM25)**: Combines Float32 cosine vector similarity (1536-dimensional embeddings) with BM25 inverted index token matching using Reciprocal Rank Fusion (RRF).
* **Multi-Turn Context Awareness**: Detects pronoun follow-ups ("what are its fees?", "who is the HOD?") and automatically augments search vectors with prior conversation turns.
* **Proactive Typo & Domain Expansion**: Auto-corrects student typos (`wchc` -> `which`, `admision` -> `admission`, `corse` -> `course`) and expands domain acronyms (`pg` -> `MCA, MMS`, `ug` -> `BCA, BBA, BMS`).

### 3. Scaled for 1,000 to 5,000 Concurrent Users
* **Request Coalescing (Singleflight Pattern)**: If multiple students ask the same question at the same moment ("What is the MCA admission process?"), subsequent requests attach to the in-flight Promise—running only 1 LLM call to answer all users simultaneously.
* **Multi-Tier Caching (L1 RAM + L2 Redis)**:
  * **L1 In-Memory RAM Cache**: Instant 0.05ms responses for the top 5,000 frequent queries.
  * **L2 Redis Cache**: Shared cross-worker cache (supporting Upstash REST or standard Redis TCP). Eliminates 70–80% of redundant LLM API costs.
* **Multi-Core Cluster Server (`server.js`)**: Spawns workers across all CPU cores with native Gzip/Deflate compression (saving 75–80% bandwidth) and in-memory static asset caching with `ETag` 304 validation.
* **Outgoing LLM Concurrency Semaphore**: Limits concurrent external LLM requests to 40 simultaneous calls with a FIFO queue to prevent HTTP 429 rate limits or socket exhaustion.
* **High-Capacity Rate Limiter**: Handles up to 50,000 concurrent IPs with sliding-window LRU eviction.

### 4. Verified Institutional Knowledge Base (`docs/data/`)
* Ingests official RCPET IMRD spreadsheets directly:
  * `rcpimrd_scraped_data.xlsx`: Scraped pages from rcpimrd.ac.in (admissions, campus facilities, placement cell, faculty, IQAC, committees).
  * `imrd_academic_programs_and_faq.xlsx`: Comprehensive details on MCA, BCA, BBA, MMS, Integrated MCA, eligibility criteria, MAH-CET/ACAP rounds, fees, and government scholarships (MahaDBT).
  * `main_dataset.xlsx`: Institutional history, NAAC grade, DTE code 5150, top recruiting companies, and campus amenities.
  * `library.xlsx` & `Library_Chatbot_QA.xlsx`: Library timings, rules, book bank facility, e-resources, and reading room services.
  * `RCPET's IMRD Library Data for Koha Software-11 Nov,2025.xlsx`: Complete book catalog metadata indexed for instant book availability lookups.

### 5. Strict Guardrails & Source Attribution
* Blocks out-of-scope non-college questions (coding questions, general trivia, unrelated institutions) at both vector retrieval and prompt verification layers.
* Verified source pills link directly to the official pages on [https://www.rcpimrd.ac.in/](https://www.rcpimrd.ac.in/).

---

## Project Structure

```
├── api/                             # Node.js serverless API endpoints
│   ├── chat.js                      # Main chat POST endpoint with rate limiting & gap logging
│   ├── health.js                    # Health check and indexed vector count
│   ├── warmup.js                    # Pre-warms vector store in RAM
│   ├── feedback.js                  # User thumbs up/down quality tracking
│   ├── me.js / login.js / logout.js # Session auth handlers
│   └── _lib/                        # Core backend libraries
│       ├── rag.js                   # RAG coordinator & in-flight request coalescing
│       ├── vectorStore.js           # Float32 cosine vector search & BM25 hybrid engine
│       ├── llm.js                   # Multilingual detection, query translation & embeddings
│       ├── fallbackManager.js       # Auto-failover LLM router & outgoing concurrency semaphore
│       ├── redisCache.js            # Two-tier L1 (RAM) + L2 (Redis) caching layer
│       ├── rateLimiter.js           # 50k-capacity sliding-window rate limiter
│       ├── auth.js                  # JWT session verification
│       └── body.js                  # Request body parsing & sanitization
├── data/                            # Processed vector index & caches
│   ├── vector_cache.bin             # Unit-normalized float32 dense vector embeddings
│   ├── vector_meta.json             # Text chunks and metadata mapping
│   ├── embed_cache.json             # Cached chunk embeddings to prevent re-billing
│   └── feedback_logs.jsonl          # Logged knowledge gaps and user feedback
├── docs/                            # Documentation and raw knowledge spreadsheets
│   ├── data/                        # Active college datasets (.xlsx)
│   └── IMRD_Chatbot_Bug_Report_17_Issues.pdf # Automation QA test report
├── public/                          # Frontend single-page application
│   ├── index.html                   # Main chat application HTML
│   ├── login.html                   # Admin authentication portal
│   ├── css/
│   │   └── styles.css               # RCPET IMRD Navy & Cyan responsive stylesheet
│   ├── js/
│   │   ├── components/              # Modular React components
│   │   │   ├── App.js               # Root state coordinator
│   │   │   ├── ChatPanel.js         # Chat layout container
│   │   │   ├── ChatHeader.js        # Header with IMRD badge & language toggle
│   │   │   ├── ChatBody.js          # Auto-scrolling message stream
│   │   │   ├── ChatFooter.js        # Auto-resizing textarea & voice input
│   │   │   ├── MessageRow.js        # Message bubbles, copy, audio TTS & edit prompt
│   │   │   ├── Sidebar.js           # History drawer & desktop collapsible sidebar
│   │   │   ├── SidebarBrand.js      # RCPET IMRD logo and branding
│   │   │   ├── WelcomeCard.js       # Official AI assistant badge & topic cards
│   │   │   └── TypingIndicator.js   # 3-dot pulsating loading indicator
│   │   └── constants/
│   │       └── i18n.js              # English, Hindi, and Marathi translation dictionaries
│   └── images/                      # Official college logo and crest assets
├── scripts/                         # Maintenance and data processing scripts
│   ├── ingest.js                    # Multi-file Excel parser, chunker & vector index builder
│   └── scrape_rcpimrd.py            # Python web scraper for rcpimrd.ac.in pages
├── deploy/
│   └── nginx.conf                   # High-concurrency Nginx reverse proxy configuration
├── dev-server.js                    # Local development server
├── server.js                        # Clustered production server (gzip + memory caching)
├── ecosystem.config.js              # PM2 multi-core cluster configuration
├── Dockerfile                       # Multi-stage production container build
├── docker-compose.yml               # Container deployment with Redis
└── package.json                     # Scripts and dependencies
```

---

## Quick Start (Local Development)

### 1. Prerequisites
* **Node.js**: Version 20.6 or higher
* **API Key**: A [Google Gemini API Key](https://aistudio.google.com/) or [OpenRouter API Key](https://openrouter.ai/)

### 2. Installation
```bash
# Clone or navigate to the repository
cd imrd-bot

# Install dependencies
npm install
```

### 3. Configure Environment Variables
Create a `.env` file in the project root:
```env
# Primary LLM API Keys (Supports multi-key rotation separated by commas)
GEMINI_API_KEY=your_gemini_api_key_here
# or
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Port (Defaults to 3000)
PORT=3000

# Optional Redis Cache (Upstash or standard TCP Redis)
# UPSTASH_REDIS_REST_URL=https://...
# UPSTASH_REDIS_REST_TOKEN=...
# or
# REDIS_URL=redis://localhost:6379
```

### 4. Build Knowledge Base Embeddings
Ingest all spreadsheets from `docs/data/`:
```bash
npm run ingest
```
This parses all programs, FAQs, college web pages, and library data, generating `data/vector_cache.bin` and `data/vector_meta.json`.

### 5. Start Development Server
```bash
npm run dev
```
Open your browser and navigate to: **`http://localhost:3000`**

---

## Running in Production (1,000–5,000 Users)

### Option A: Clustered Node.js Server (Built-in)
Runs `server.js` with multi-core clustering, native Gzip compression, and in-memory asset caching:
```bash
npm start
```

### Option B: PM2 Enterprise Process Manager
```bash
# Install PM2 globally
npm install -g pm2

# Launch cluster using ecosystem configuration
pm2 start ecosystem.config.js

# Monitor live metrics & workers
pm2 monit
```

### Option C: Docker Compose with Redis
Ensure Docker Desktop or the Docker daemon is running, then run:
```bash
docker compose up -d --build
```
This launches the clustered application and a dedicated Redis container on port 3000.

### Option D: Nginx Reverse Proxy
Copy [`deploy/nginx.conf`](deploy/nginx.conf) to your server's `/etc/nginx/nginx.conf` for SSL termination, 10,240 connection handling, rate limiting, and static file caching.

---

## Updating the Knowledge Base

To re-index when new college information or spreadsheets are added to `docs/data/`:
```bash
# Re-index all Excel files in docs/ and docs/data/
npm run ingest

# Or target a specific spreadsheet
npm run ingest -- docs/data/imrd_academic_programs_and_faq.xlsx
```

To re-scrape pages from the official website:
```bash
python scripts/scrape_rcpimrd.py
npm run ingest -- docs/data/rcpimrd_scraped_data.xlsx
```

---

## Configuration Reference (`.env`)

| Variable | Default | Description |
| :--- | :---: | :--- |
| `GEMINI_API_KEY` | - | Primary Google Gemini API key. |
| `GEMINI_API_KEYS` | - | Comma-separated Gemini keys for auto-rotation under heavy traffic. |
| `OPENROUTER_API_KEY` | - | Primary OpenRouter key (used for embeddings & completions). |
| `PORT` | `3000` | HTTP port for server. |
| `CLUSTER` | `false` | Enable multi-core CPU clustering in `server.js`. |
| `WEB_CONCURRENCY` | `CPU cores` | Number of worker processes to fork in cluster mode. |
| `MAX_CONCURRENT_LLM_CALLS` | `40` | Semaphore limit for parallel outgoing calls to external LLMs. |
| `RATE_LIMIT_PER_MINUTE` | `45` | Allowed requests per minute per IP address. |
| `REDIS_URL` | - | Redis connection string (e.g. `redis://localhost:6379`). |
| `UPSTASH_REDIS_REST_URL` | - | Upstash Redis REST URL for serverless environments. |
| `UPSTASH_REDIS_REST_TOKEN` | - | Upstash Redis REST bearer token. |
| `RAG_TOP_K` | `6` | Number of context chunks retrieved per question. |
| `RAG_DISTANCE_THRESHOLD` | `0.58` | Maximum cosine distance cutoff for relevant documents. |

---

## Technology Stack

* **Frontend**: Vanilla JavaScript (React 18 via CDN / UMD), HTML5, CSS3 with CSS variables, Bootstrap Icons.
* **Backend**: Node.js 20+ with native `http`, `cluster`, `zlib`, and `crypto`.
* **RAG & Search**: Custom Float32 Vector Similarity Engine, BM25 inverted index tokenizer, Reciprocal Rank Fusion (RRF).
* **LLM Engine**: Google Gemini API (`gemini-2.5-flash`) with OpenRouter failover routing (`google/gemini-2.5-flash`, `openrouter/free`).
* **Caching**: L1 In-Memory LRU Cache + L2 Redis (`ioredis` / Upstash REST).
* **Deployment**: Docker, Docker Compose, PM2, Nginx, or Vercel.

---

## License & Credits

Developed for **R. C. Patel Educational Trust's Institute of Management Research and Development (RCPET's IMRD), Shirpur**.  
All institutional data and campus intellectual property belong to **RCPET's IMRD, Shirpur**.  
Powered by **DevNectar**.
