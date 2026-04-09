<div align="center">

<br/>

```
 ██╗  ██╗ █████╗ ██╗     ██╗     ██╗   ██╗ ██████╗██╗███╗   ██╗ █████╗ ████████╗██╗ ██████╗ ███╗   ██╗
 ██║  ██║██╔══██╗██║     ██║     ██║   ██║██╔════╝██║████╗  ██║██╔══██╗╚══██╔══╝██║██╔═══██╗████╗  ██║
 ███████║███████║██║     ██║     ██║   ██║██║     ██║██╔██╗ ██║███████║   ██║   ██║██║   ██║██╔██╗ ██║
 ██╔══██║██╔══██║██║     ██║     ██║   ██║██║     ██║██║╚██╗██║██╔══██║   ██║   ██║██║   ██║██║╚██╗██║
 ██║  ██║██║  ██║███████╗███████╗╚██████╔╝╚██████╗██║██║ ╚████║██║  ██║   ██║   ██║╚██████╔╝██║ ╚████║
 ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝ ╚═════╝  ╚═════╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝   ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝
                                                                            L A B   v 2
```

### ⚗️ Multi-Model Hallucination Evaluator

*Pit FLAN-T5 · Claude · GPT-4o · Gemini · Grok · Perplexity against each other — scored by NLI, SBERT & calibration*

<br/>

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18%2B-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.3-EE4C2C?style=for-the-badge&logo=pytorch&logoColor=white)](https://pytorch.org)
[![CUDA](https://img.shields.io/badge/CUDA-Ready-76B900?style=for-the-badge&logo=nvidia&logoColor=white)](https://developer.nvidia.com/cuda)

</div>

---

## ✦ What Is This?

**HallucinationLab v2** is a research-grade evaluation framework that exposes how and *when* large language models hallucinate. Give it a question + a verified ground truth, and it fires all selected models simultaneously — streaming results back in real time — then scores every answer across four rigorous NLP metrics.

> No vibes-based comparison. Just numbers, verified by transformer-based NLI.

---

## ✦ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        HallucinationLab v2                          │
│                                                                     │
│  ┌──────────────────────────┐    ┌─────────────────────────────┐   │
│  │         Frontend         │    │          Backend             │   │
│  │    React + Vite (JSX)    │◄──►│     FastAPI + uvicorn        │   │
│  │   Real-time SSE stream   │    │   /evaluate-stream (POST)    │   │
│  │   Radar charts · Cards   │    │   /validate-ground-truth     │   │
│  └──────────────────────────┘    └──────────┬──────────────────┘   │
│                                             │                       │
│              ┌──────────────────────────────┼──────────────────┐   │
│              │          Model Layer          │                   │   │
│              │                              │                   │   │
│  ┌───────────▼─────────┐     ┌─────────────▼──────────────┐   │   │
│  │   Local (GPU/CPU)    │     │     External APIs           │   │   │
│  │                      │     │                             │   │   │
│  │  FLAN-T5-large        │     │  Claude Sonnet              │   │   │
│  │  RoBERTa-large-mnli  │     │  GPT-4o                     │   │   │
│  │  Sentence-BERT MiniLM│     │  Gemini Flash               │   │   │
│  └──────────────────────┘     │  Grok-3-mini               │   │   │
│                               │  Perplexity Sonar           │   │   │
│                               └─────────────────────────────┘   │   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## ✦ Metrics Engine

Every model answer is scored across a **weighted composite**:

| Metric | Weight | Method | What It Measures |
|--------|--------|--------|------------------|
| 🔶 **Factual Consistency** | 40% | RoBERTa-large NLI entailment | Does the answer logically follow from ground truth? |
| 🔷 **Completeness** | 25% | Sentence-BERT cosine similarity | What fraction of key points from ground truth appear? |
| 🟣 **Conciseness** | 20% | Word-count ratio | Is the answer appropriately sized — neither verbose nor too brief? |
| 🟢 **Confidence Calibration** | 15% | Hedge-word × NLI cross-check | Is the model confident when right and uncertain when wrong? |

```
Overall Score = 0.40 × FactualConsistency
              + 0.25 × Completeness
              + 0.20 × Conciseness
              + 0.15 × ConfidenceCalibration
```

Each answer also receives a **verdict**:

| Verdict | Meaning |
|---------|---------|
| ✅ `CONSISTENT` | Answer is entailed by ground truth |
| ❌ `HALLUCINATION` | Answer contradicts ground truth |
| ⚠️ `UNVERIFIED` | Answer is plausible but unsupported |

---

## ✦ Models at a Glance

| Model | Provider | Runs On | Cost/1K tokens (in/out) |
|-------|----------|---------|------------------------|
| **FLAN-T5-large** | Google (HuggingFace) | Local GPU / CPU | Free |
| **Claude Sonnet** | Anthropic | API | $0.003 / $0.015 |
| **GPT-4o** | OpenAI | API | $0.005 / $0.015 |
| **Gemini 2.5 Flash** | Google | API | $0.00025 / $0.0005 |
| **Grok-3-mini** | xAI | API | $0.0003 / $0.0005 |
| **Perplexity Sonar** | Perplexity AI | API | $0.001 / $0.001 |

> **FLAN-T5 always runs for free — no API key required.** External models degrade gracefully if keys are absent.

---

## ✦ GPU Memory (GTX 1650 Ti — 4 GB VRAM)

```
FLAN-T5-large (fp16)   ████████████████░░░░░░░░   ~1.5 GB
RoBERTa-large-mnli     █████████████░░░░░░░░░░░   ~1.3 GB
Sentence-BERT MiniLM   █░░░░░░░░░░░░░░░░░░░░░░░   ~0.1 GB
───────────────────────────────────────────────   ──────
Total                  ██████████████████████░░   ~2.9 GB  ✓ fits in 4 GB
```

---

## ✦ Project Structure

```
hallucinationlab/
│
├── backend/
│   ├── main.py                  ← FastAPI app (all metrics + model routing)
│   └── requirements.txt         ← Python dependencies
│
└── frontend/
    └── App.jsx                  ← Full React UI (drop into Vite project)
```

---

## ✦ Quick Start

### 1 · Clone & Install Backend

```bash
git clone https://github.com/your-username/hallucination-labs.git
cd hallucination-labs/backend

pip install -r requirements.txt
```

> ⚠️ First run downloads ~3 GB of models. They cache in `~/.cache/huggingface` for subsequent runs.

---

### 2 · Set API Keys

```bash
# Windows
set ANTHROPIC_API_KEY=sk-ant-...
set OPENAI_API_KEY=sk-...
set GEMINI_API_KEY=AIza...
set GROK_API_KEY=xai-...
set PERPLEXITY_API_KEY=pplx-...

# macOS / Linux
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export GEMINI_API_KEY=AIza...
export GROK_API_KEY=xai-...
export PERPLEXITY_API_KEY=pplx-...
```

> 💡 Only FLAN-T5 requires no key. All others fail gracefully with a clear error message.

---

### 3 · Start the Backend

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Expected output:
```
[1/3] Loading FLAN-T5-large...
[2/3] Loading RoBERTa-large-mnli...
[3/3] Loading Sentence-BERT (all-MiniLM-L6-v2)...
All local models ready.
INFO:     Application startup complete.
```

Health check → [http://localhost:8000/health](http://localhost:8000/health)

```json
{ "status": "ok", "device": "cuda", "keys": { "claude": true, "gpt4o": true, "gemini": true } }
```

---

### 4 · Start the Frontend

```bash
npm create vite@latest hallucinationlab-ui -- --template react
cd hallucinationlab-ui
npm install

# Replace src/App.jsx with the included App.jsx, then:
npm run dev
```

Open → [http://localhost:5173](http://localhost:5173)

---

## ✦ API Reference

### `POST /evaluate-stream`

Streams results via **Server-Sent Events** as each model completes.

```json
{
  "question": "Who invented the telephone?",
  "ground_truth": "Alexander Graham Bell invented the telephone in 1876.",
  "domain": "History",
  "models": ["flan-t5", "claude", "gpt4o", "gemini"]
}
```

**Stream response** (one JSON object per `data:` event):

```json
{
  "model_id": "claude",
  "model_label": "Claude",
  "answer": "Alexander Graham Bell invented the telephone in 1876.",
  "metrics": {
    "factual_consistency": 0.9821,
    "completeness": 0.8750,
    "conciseness": 1.0000,
    "confidence_calibration": 1.0000,
    "overall": 0.9455
  },
  "verdict": "entailment",
  "nli": { "entailment": 0.9821, "contradiction": 0.0048, "neutral": 0.0131 },
  "patterns": ["None detected"],
  "input_tokens": 42,
  "output_tokens": 18,
  "cost_usd": 0.000396,
  "latency_ms": 834.2,
  "error": null
}
```

---

### `POST /validate-ground-truth`

Validates the quality of a ground truth reference before evaluation.

```json
{ "question": "...", "ground_truth": "..." }
```

```json
{ "score": 85, "quality": "good", "issues": [] }
```

---

### `GET /health`

Returns backend status and which API keys are configured.

---

## ✦ Hallucination Pattern Detection

The system automatically flags detected failure modes:

| Pattern | Trigger Condition |
|---------|------------------|
| `Contradictory claim` | NLI contradiction score > 0.5 |
| `Plausible but unsupported` | NLI neutral score > 0.6 |
| `Factual fabrication` | Both entailment & contradiction < 0.3 |
| `Incomplete answer` | Completeness score < 0.4 |
| `Excessive verbosity` | Conciseness score < 0.4 |
| `Overconfident when wrong` | Calibration score < 0.3 |
| `None detected` | All metrics within healthy thresholds |

---

## ✦ Deployment

### Backend (GPU Cloud)

```bash
# RunPod / Vast.ai (recommended for GPU inference)
# Railway / Render (CPU-only, slower — FLAN-T5 still works)

uvicorn main:app --host 0.0.0.0 --port 8000
```

### Frontend (Vercel / Netlify)

```javascript
// App.jsx — line 3
// Change before deploying:
const API = "https://your-backend.railway.app";
```

```bash
npm run build     # outputs to dist/
# Push dist/ to Vercel or Netlify
```

---

## ✦ Tech Stack

| Layer | Technology |
|-------|-----------|
| **API Framework** | FastAPI 0.111 + uvicorn |
| **Streaming** | Server-Sent Events (SSE) via `StreamingResponse` |
| **NLI Scoring** | `roberta-large-mnli` via HuggingFace Transformers |
| **Semantic Similarity** | `all-MiniLM-L6-v2` via Sentence-Transformers |
| **Answer Generation** | `google/flan-t5-large` |
| **External LLMs** | Anthropic · OpenAI · Google · xAI · Perplexity (async httpx) |
| **Frontend** | React 18 + Vite (pure JSX, zero CSS frameworks) |
| **Visualization** | Pure SVG radar charts, animated metric bars |
| **Runtime** | CUDA (preferred) · CPU fallback |

---

## ✦ Python Dependencies

```
fastapi==0.111.0
uvicorn[standard]==0.29.0
pydantic==2.7.1
httpx==0.27.0
torch==2.3.0
transformers==4.41.0
sentence-transformers==3.0.0
accelerate==0.30.0
sentencepiece==0.2.0
protobuf==4.25.3
```

---

## ✦ Sample Evaluation Prompts

The UI ships with built-in sample questions for quick demos:

| Question | Domain | Tests |
|----------|--------|-------|
| *"Who invented the telephone?"* | History | Factual attribution |
| *"Did humans and dinosaurs coexist?"* | Science | Common misconception |
| *"Can vaccines cause autism?"* | Medical | Debunked myth resistance |
| *"What percentage of the brain do humans use?"* | Medical | The 10% myth |
| *"What is the speed of light?"* | Science | Precise numerical recall |
| *"What is the boiling point of water?"* | Science | Standard reference |

---

## ✦ Contributing

Contributions are welcome. To add a new model:

1. Add its ID + cost to `COST_TABLE` and `MODEL_LABELS` in `main.py`
2. Write an `async gen_yourmodel(question)` function following the existing pattern
3. Register it in the `run_model()` dispatcher
4. Add it to the `MODELS` array in `App.jsx` with a unique color

---

## ✦ License

MIT — do whatever you want, attribution appreciated.

---

<div align="center">

*Built with obsessive attention to metric rigor.*
*Because "it sounds right" is not a benchmark.*

⚗️

</div>
