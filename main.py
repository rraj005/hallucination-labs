"""
HallucinationLab v2 — Full Backend
Local:    FLAN-T5-large | RoBERTa-large-mnli | Sentence-BERT
External: Claude (Anthropic) | GPT-4o (OpenAI) | Gemini (Google)
Metrics:  Factual Consistency · Completeness · Conciseness · Confidence Calibration
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List
import torch, time, re, json, asyncio, os
import httpx

# ── Device ────────────────────────────────────────────────────────────────────
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"[HallucinationLab v2] Device: {DEVICE}")

# ── API Keys — set these as environment variables ─────────────────────────────
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_KEY    = os.getenv("OPENAI_API_KEY", "")
GEMINI_KEY    = os.getenv("GEMINI_API_KEY", "")
GROK_KEY      = os.getenv("GROK_API_KEY", "")
PERPLEXITY_KEY = os.getenv("PERPLEXITY_API_KEY", "")

# ── Cost per 1K tokens (USD) ──────────────────────────────────────────────────
COST_TABLE = {
    "flan-t5": {"input": 0.0,     "output": 0.0},
    "claude":  {"input": 0.003,   "output": 0.015},
    "gpt4o":   {"input": 0.005,   "output": 0.015},
    "gemini":  {"input": 0.00025, "output": 0.0005},
    "grok":    {"input": 0.0003,  "output": 0.0005},
    "perplexity": {"input": 0.001, "output": 0.001},
}

MODEL_LABELS = {
    "flan-t5": "FLAN-T5",
    "claude":  "Claude",
    "gpt4o":   "GPT-4o",
    "gemini":  "Gemini",
    "grok":    "Grok-3-mini",
    "perplexity": "Perplexity Sonar",
}

# ── Lazy model globals ────────────────────────────────────────────────────────
_flan_tok = _flan_model = _nli_pipe = _sbert = None

def load_local_models():
    global _flan_tok, _flan_model, _nli_pipe, _sbert
    if _flan_model is not None:
        return
    from transformers import T5ForConditionalGeneration, T5Tokenizer, pipeline
    from sentence_transformers import SentenceTransformer
    print("[1/3] Loading FLAN-T5-large...")
    _flan_tok   = T5Tokenizer.from_pretrained("google/flan-t5-large")
    _flan_model = T5ForConditionalGeneration.from_pretrained(
        "google/flan-t5-large",
        torch_dtype=torch.float16 if DEVICE == "cuda" else torch.float32,
    ).to(DEVICE)
    _flan_model.eval()
    print("[2/3] Loading RoBERTa-large-mnli...")
    _nli_pipe = pipeline("text-classification", model="roberta-large-mnli",
                         device=0 if DEVICE == "cuda" else -1, top_k=None)
    print("[3/3] Loading Sentence-BERT (all-MiniLM-L6-v2)...")
    _sbert = SentenceTransformer("all-MiniLM-L6-v2")
    if DEVICE == "cuda":
        _sbert = _sbert.cuda()
    print("All local models ready.")

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(title="HallucinationLab API v2", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Schemas ───────────────────────────────────────────────────────────────────
class EvalRequest(BaseModel):
    question:     str
    ground_truth: str
    domain:       str = "general"
    models:       List[str] = ["flan-t5", "claude", "gpt4o", "gemini"]

class GTValidateRequest(BaseModel):
    question:     str
    ground_truth: str

# ── Ground Truth Validator ────────────────────────────────────────────────────
@app.post("/validate-ground-truth")
def validate_ground_truth(req: GTValidateRequest):
    issues = []
    score  = 100

    words = req.ground_truth.split()
    if len(words) < 5:
        issues.append("Too short — add more factual detail")
        score -= 40
    if len(words) > 200:
        issues.append("Very long — consider condensing to key facts only")
        score -= 10

    hedges = ["maybe", "perhaps", "i think", "i believe", "possibly",
              "might be", "could be", "i'm not sure"]
    if any(h in req.ground_truth.lower() for h in hedges):
        issues.append("Contains uncertain language — use definitive statements")
        score -= 25

    q_words  = set(re.findall(r'\b\w+\b', req.question.lower()))
    gt_words = set(re.findall(r'\b\w+\b', req.ground_truth.lower()))
    overlap  = len(q_words & gt_words) / max(len(q_words), 1)
    if overlap < 0.1:
        issues.append("Ground truth seems unrelated to the question")
        score -= 30

    if req.ground_truth.strip() == req.question.strip():
        issues.append("Ground truth cannot be identical to the question")
        score = 0

    score   = max(0, score)
    quality = "good" if score >= 75 else "fair" if score >= 50 else "poor"
    return {"score": score, "quality": quality, "issues": issues}

# ── Hedging Normalizer ────────────────────────────────────────────────────────
HEDGE_RE = re.compile(
    r"\b(i think|i believe|i'm not sure but|generally speaking|it is generally|"
    r"it is believed that|some say|it could be|it might be|possibly|perhaps|"
    r"as far as i know|to my knowledge|in my opinion|one might say)\b",
    re.IGNORECASE,
)

def normalize(text: str) -> str:
    cleaned = HEDGE_RE.sub("", text)
    return re.sub(r'\s+', ' ', cleaned).strip()

# ── Answer Generators ─────────────────────────────────────────────────────────
def gen_flan(question: str):
    prompt = f"Answer accurately and concisely:\nQuestion: {question}\nAnswer:"
    inputs = _flan_tok(prompt, return_tensors="pt",
                       truncation=True, max_length=512).to(DEVICE)
    with torch.no_grad():
        out = _flan_model.generate(
            **inputs, max_new_tokens=200, num_beams=4,
            early_stopping=True, no_repeat_ngram_size=3,
        )
    answer = _flan_tok.decode(out[0], skip_special_tokens=True).strip()
    return answer, int(inputs["input_ids"].shape[1]), int(out.shape[1])

async def gen_claude(question: str):
    if not ANTHROPIC_KEY:
        return "Claude API key not configured.", 0, 0
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_KEY,
                     "anthropic-version": "2023-06-01",
                     "Content-Type": "application/json"},
            json={"model": "claude-sonnet-4-20250514", "max_tokens": 300,
                  "messages": [{"role": "user",
                                "content": f"Answer this question accurately and concisely. "
                                           f"Give only the answer, no preamble:\n\n{question}"}]},
        )
        d = r.json()
        return (d["content"][0]["text"],
                d.get("usage", {}).get("input_tokens", 0),
                d.get("usage", {}).get("output_tokens", 0))

async def gen_gpt4o(question: str):
    if not OPENAI_KEY:
        return "OpenAI API key not configured.", 0, 0
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENAI_KEY}",
                     "Content-Type": "application/json"},
            json={"model": "gpt-4o", "max_tokens": 300,
                  "messages": [
                      {"role": "system",
                       "content": "Answer questions accurately and concisely. Give only the answer."},
                      {"role": "user", "content": question},
                  ]},
        )
        d = r.json()
        return (d["choices"][0]["message"]["content"],
                d.get("usage", {}).get("prompt_tokens", 0),
                d.get("usage", {}).get("completion_tokens", 0))

async def gen_gemini(question: str):
    if not GEMINI_KEY:
        return "Gemini API key not configured.", 0, 0
    models_to_try = [
        "gemini-2.5-flash-preview-05-20",
        "gemini-2.5-flash-preview-04-17",
        "gemini-2.0-flash",
    ]
    async with httpx.AsyncClient(timeout=30) as c:
        last_error = "Unknown error"
        for model_name in models_to_try:
            url = ("https://generativelanguage.googleapis.com/v1beta/models/"
                   + model_name + ":generateContent?key=" + GEMINI_KEY)
            r = await c.post(url, json={"contents": [{"parts": [{"text":
                "Answer accurately and concisely. Give only the answer:\n\n" + question}]}]})
            d = r.json()
            print(f"[Gemini {model_name}] status={r.status_code} keys={list(d.keys())}")
            if "candidates" in d:
                print(f"[Gemini] Success with model: {model_name}")
                return (d["candidates"][0]["content"]["parts"][0]["text"],
                        d.get("usageMetadata", {}).get("promptTokenCount", 0),
                        d.get("usageMetadata", {}).get("candidatesTokenCount", 0))
            last_error = d.get("error", {}).get("message", str(d))
            print(f"[Gemini {model_name}] Error: {last_error}")
        return "Gemini error: " + last_error, 0, 0
    
async def gen_grok(question: str):
    if not GROK_KEY:
        return "Grok API key not configured.", 0, 0
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(
            "https://api.x.ai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROK_KEY}",
                     "Content-Type": "application/json"},
            json={"model": "grok-3-mini", "max_tokens": 300,
                  "messages": [
                      {"role": "system",
                       "content": "Answer questions accurately and concisely. Give only the answer."},
                      {"role": "user", "content": question},
                  ]},
        )
        d = r.json()
        if "choices" in d:
            return (d["choices"][0]["message"]["content"],
                    d.get("usage", {}).get("prompt_tokens", 0),
                    d.get("usage", {}).get("completion_tokens", 0))
        return "Grok error: " + str(d), 0, 0

async def gen_perplexity(question: str):
    if not PERPLEXITY_KEY:
        return "Perplexity API key not configured.", 0, 0
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(
            "https://api.perplexity.ai/chat/completions",
            headers={"Authorization": f"Bearer {PERPLEXITY_KEY}",
                     "Content-Type": "application/json"},
            json={"model": "sonar", "max_tokens": 300,
                  "messages": [
                      {"role": "system",
                       "content": "Answer questions accurately and concisely. Give only the answer."},
                      {"role": "user", "content": question},
                  ]},
        )
        d = r.json()
        if "choices" in d:
            return (d["choices"][0]["message"]["content"],
                    d.get("usage", {}).get("prompt_tokens", 0),
                    d.get("usage", {}).get("completion_tokens", 0))
        return "Perplexity error: " + str(d), 0, 0

# ── Metric Calculators ────────────────────────────────────────────────────────
def metric_factual_consistency(generated: str, ground_truth: str) -> dict:
    norm    = normalize(generated)
    result  = _nli_pipe(f"{ground_truth} [SEP] {norm}",
                        truncation=True, max_length=512)
    scores  = {item["label"].lower(): item["score"] for item in result[0]}
    ent     = scores.get("entailment", 0.0)
    con     = scores.get("contradiction", 0.0)
    neu     = scores.get("neutral", 0.0)
    verdict = max({"entailment": ent, "contradiction": con, "neutral": neu},
                  key=lambda k: scores.get(k, 0))
    return {"score": round(ent, 4), "entailment": round(ent, 4),
            "contradiction": round(con, 4), "neutral": round(neu, 4),
            "verdict": verdict}

def metric_completeness(generated: str, ground_truth: str) -> float:
    from sentence_transformers import util as su
    sentences = [s.strip() for s in re.split(r'[.!?]', ground_truth)
                 if len(s.strip()) > 10]
    if not sentences:
        return 1.0
    gen_emb  = _sbert.encode(generated, convert_to_tensor=True)
    covered  = sum(
        1 for s in sentences
        if float(su.cos_sim(gen_emb, _sbert.encode(s, convert_to_tensor=True)).item()) > 0.45
    )
    return round(covered / len(sentences), 4)

def metric_conciseness(generated: str, ground_truth: str) -> float:
    gen_w = len(generated.split())
    gt_w  = len(ground_truth.split())
    if gen_w == 0:
        return 0.0
    ratio = gt_w / gen_w
    if 0.5 <= ratio <= 1.5:
        return 1.0
    if ratio < 0.5:
        return round(max(0.3, ratio / 0.5), 4)   # response too verbose
    return round(max(0.3, 1.5 / ratio), 4)        # response too short

def metric_calibration(generated: str, verdict: str, entailment: float) -> float:
    hedge_words = ["i think", "i believe", "perhaps", "maybe", "possibly",
                   "i'm not sure", "might", "could be", "generally", "approximately"]
    hedged     = any(h in generated.lower() for h in hedge_words)
    is_correct = verdict == "entailment"
    if is_correct and not hedged:  return 1.0
    if is_correct and hedged:      return 0.75
    if not is_correct and hedged:  return 0.5
    return round(max(0.1, 1.0 - entailment), 4)

def detect_patterns(fc, completeness, conciseness, calibration) -> List[str]:
    p = []
    if fc["contradiction"] > 0.5:                     p.append("Contradictory claim")
    if fc["neutral"] > 0.6:                           p.append("Plausible but unsupported")
    if fc["entailment"] < 0.3 and fc["contradiction"] < 0.3: p.append("Factual fabrication")
    if completeness < 0.4:                            p.append("Incomplete answer")
    if conciseness < 0.4:                             p.append("Excessive verbosity")
    if calibration < 0.3:                             p.append("Overconfident when wrong")
    return p if p else ["None detected"]

def calc_cost(model_id: str, in_tok: int, out_tok: int) -> float:
    c = COST_TABLE.get(model_id, {"input": 0, "output": 0})
    return round((in_tok / 1000 * c["input"]) + (out_tok / 1000 * c["output"]), 6)

# ── Single model runner ───────────────────────────────────────────────────────
async def run_model(model_id: str, question: str, ground_truth: str) -> dict:
    t0 = time.time()
    try:
        if   model_id == "flan-t5": answer, in_tok, out_tok = gen_flan(question)
        elif model_id == "claude":  answer, in_tok, out_tok = await gen_claude(question)
        elif model_id == "gpt4o":   answer, in_tok, out_tok = await gen_gpt4o(question)
        elif model_id == "gemini":  answer, in_tok, out_tok = await gen_gemini(question)
        elif model_id == "grok":        answer, in_tok, out_tok = await gen_grok(question)
        elif model_id == "perplexity":  answer, in_tok, out_tok = await gen_perplexity(question)
        else: return {"model_id": model_id, "error": "Unknown model"}

        fc           = metric_factual_consistency(answer, ground_truth)
        completeness = metric_completeness(answer, ground_truth)
        conciseness  = metric_conciseness(answer, ground_truth)
        calibration  = metric_calibration(answer, fc["verdict"], fc["entailment"])
        patterns     = detect_patterns(fc, completeness, conciseness, calibration)
        cost         = calc_cost(model_id, in_tok, out_tok)
        latency      = round((time.time() - t0) * 1000, 1)

        overall = round(
            fc["entailment"] * 0.40 +
            completeness     * 0.25 +
            conciseness      * 0.20 +
            calibration      * 0.15,
            4,
        )

        return {
            "model_id":    model_id,
            "model_label": MODEL_LABELS.get(model_id, model_id),
            "answer":      answer,
            "metrics": {
                "factual_consistency":    round(fc["entailment"], 4),
                "completeness":           completeness,
                "conciseness":            conciseness,
                "confidence_calibration": calibration,
                "overall":                overall,
            },
            "nli":         {"entailment": fc["entailment"],
                            "contradiction": fc["contradiction"],
                            "neutral": fc["neutral"]},
            "verdict":     fc["verdict"],
            "patterns":    patterns,
            "input_tokens":  in_tok,
            "output_tokens": out_tok,
            "cost_usd":    cost,
            "latency_ms":  latency,
            "error":       None,
        }
    except Exception as e:
        return {
            "model_id":    model_id,
            "model_label": MODEL_LABELS.get(model_id, model_id),
            "error":       str(e),
            "latency_ms":  round((time.time() - t0) * 1000, 1),
        }

# ── SSE Streaming endpoint ────────────────────────────────────────────────────
@app.post("/evaluate-stream")
async def evaluate_stream(req: EvalRequest):
    load_local_models()

    async def generator():
        tasks   = {mid: asyncio.create_task(run_model(mid, req.question, req.ground_truth))
                   for mid in req.models}
        pending = set(tasks.values())
        while pending:
            done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                yield f"data: {json.dumps(task.result())}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "device": DEVICE,
        "keys":   {
            "claude":      bool(ANTHROPIC_KEY),
            "gpt4o":       bool(OPENAI_KEY),
            "gemini":      bool(GEMINI_KEY),
            "grok":        bool(GROK_KEY),
            "perplexity":  bool(PERPLEXITY_KEY),
        },
    }

@app.on_event("startup")
async def startup():
    load_local_models()
