# HallucinationLab v2 — Setup Guide

## Project Structure
```
hallucinationlab/
├── backend/
│   ├── main.py
│   └── requirements.txt
└── frontend/
    └── App.jsx  (replace src/App.jsx in your Vite project)
```

---

## Step 1 — Backend Setup

### Install dependencies
```bash
cd backend
pip install -r requirements.txt
```

First run downloads ~3GB of models (FLAN-T5-large, RoBERTa-large, MiniLM).
They cache locally in ~/.cache/huggingface after that.

### Set API keys (environment variables)
```bash
# Windows
set ANTHROPIC_API_KEY=sk-ant-...
set OPENAI_API_KEY=sk-...
set GEMINI_API_KEY=AIza...

# Mac/Linux
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export GEMINI_API_KEY=AIza...
```

FLAN-T5 runs locally for free. The other three need API keys.
If a key is missing, that model returns "API key not configured" gracefully.

### Start the backend
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

You should see:
```
[1/3] Loading FLAN-T5-large...
[2/3] Loading RoBERTa-large-mnli...
[3/3] Loading Sentence-BERT...
All local models ready.
INFO: Application startup complete.
```

### Verify it's working
Open http://localhost:8000/health — should return:
```json
{"status":"ok","device":"cuda","keys":{"claude":true,"gpt4o":true,"gemini":true}}
```

---

## Step 2 — Frontend Setup

```bash
npm create vite@latest hallucinationlab-ui -- --template react
cd hallucinationlab-ui
npm install
```

Replace `src/App.jsx` with the downloaded `App.jsx`.
Delete `src/App.css` and `src/index.css` contents (or leave them, they won't conflict).

```bash
npm run dev
```

Open http://localhost:5173

---

## What Each Model Does

| Model | Role | Runs On |
|-------|------|---------|
| FLAN-T5-large | Answer generation | Your GPU (GTX 1650 Ti) |
| RoBERTa-large-mnli | NLI scoring (Factual Consistency) | Your GPU |
| Sentence-BERT (MiniLM) | Semantic similarity (Completeness) | Your GPU |
| Claude / GPT-4o / Gemini | Answer generation for comparison | API (paid) |

---

## How Metrics Are Calculated

**Factual Consistency (40% weight)**
RoBERTa NLI entailment score — does the answer follow from the ground truth?

**Completeness (25% weight)**
Sentence-BERT semantic coverage — what fraction of ground truth key points appear in the answer?

**Conciseness (20% weight)**
Word count ratio between answer and ground truth. Penalizes both verbosity and extreme brevity.

**Confidence Calibration (15% weight)**
Cross-references hedging language with NLI verdict.
Confident + correct = 1.0, Confident + wrong = low score.

**Overall = 0.40×FC + 0.25×Completeness + 0.20×Conciseness + 0.15×Calibration**

---

## GPU Memory Usage (GTX 1650 Ti — 4GB VRAM)

| Model | VRAM |
|-------|------|
| FLAN-T5-large (fp16) | ~1.5GB |
| RoBERTa-large | ~1.3GB |
| MiniLM | ~0.1GB |
| **Total** | **~2.9GB** |

Fits comfortably within 4GB. All models load at startup.

---

## Deployment (Production)

**Backend:** Deploy to RunPod (GPU instance) or Railway (CPU only)
**Frontend:** Deploy to Vercel — change `API_BASE` in App.jsx to your backend URL

```javascript
// App.jsx line 3
const API = "https://your-backend.railway.app";
```
