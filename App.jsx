import { useState, useEffect, useRef } from "react";

const API = "http://localhost:8000";

const DOMAINS = ["General", "Medical", "Legal", "Science", "History", "Technology", "Finance"];

const MODELS = [
  { id: "flan-t5", label: "FLAN-T5",  color: "#a78bfa", local: true },
  { id: "claude",  label: "Claude",   color: "#f97316", local: false },
  { id: "gpt4o",   label: "GPT-4o",   color: "#22d3ee", local: false },
  { id: "gemini",  label: "Gemini",   color: "#4ade80", local: false },
];

const METRICS = [
  { key: "factual_consistency",    label: "Factual Consistency",    color: "#f97316", desc: "NLI entailment vs ground truth (RoBERTa)" },
  { key: "completeness",           label: "Completeness",           color: "#22d3ee", desc: "Coverage of ground truth key points (SBERT)" },
  { key: "conciseness",            label: "Conciseness",            color: "#a78bfa", desc: "Length relative to ground truth" },
  { key: "confidence_calibration", label: "Confidence Calibration", color: "#4ade80", desc: "Certainty vs correctness alignment" },
];

const VERDICT_CONFIG = {
  entailment:    { label: "CONSISTENT",    color: "#4ade80" },
  contradiction: { label: "HALLUCINATION", color: "#f87171" },
  neutral:       { label: "UNVERIFIED",    color: "#fbbf24" },
};

const SAMPLES = [
  { q: "Who invented the telephone?", gt: "Alexander Graham Bell is generally credited with inventing the telephone in 1876.", domain: "History" },
  { q: "What is the boiling point of water?", gt: "Water boils at 100°C (212°F) at standard atmospheric pressure.", domain: "Science" },
  { q: "Did humans and dinosaurs ever coexist?", gt: "No, non-avian dinosaurs went extinct about 66 million years ago, long before humans evolved.", domain: "Science" },
  { q: "Can vaccines cause autism?", gt: "No. Multiple large-scale studies have conclusively found no link between vaccines and autism.", domain: "Medical" },
  { q: "What percentage of the brain do humans use?", gt: "Humans use virtually all parts of their brain. The 10% myth is false.", domain: "Medical" },
  { q: "What is the speed of light?", gt: "The speed of light in a vacuum is exactly 299,792,458 metres per second.", domain: "Science" },
];

// ── Radar Chart (pure SVG) ────────────────────────────────────────────────────
function RadarChart({ metrics, color, size = 120 }) {
  if (!metrics) return null;
  const cx = size / 2, cy = size / 2, r = size * 0.38;
  const keys   = METRICS.map(m => m.key);
  const n      = keys.length;
  const points = keys.map((k, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const val   = metrics[k] ?? 0;
    return {
      x: cx + r * val * Math.cos(angle),
      y: cy + r * val * Math.sin(angle),
      gx: cx + r * Math.cos(angle),
      gy: cy + r * Math.sin(angle),
      label: METRICS[i].label.split(" ")[0],
    };
  });
  const poly   = points.map(p => `${p.x},${p.y}`).join(" ");
  const grid   = points.map(p => `${p.gx},${p.gy}`).join(" ");

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* grid */}
      {[0.25, 0.5, 0.75, 1].map(s => (
        <polygon key={s}
          points={points.map(p => {
            const angle = Math.atan2(p.gy - cy, p.gx - cx);
            return `${cx + r * s * Math.cos(angle)},${cy + r * s * Math.sin(angle)}`;
          }).join(" ")}
          fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      ))}
      {/* axes */}
      {points.map((p, i) => (
        <line key={i} x1={cx} y1={cy} x2={p.gx} y2={p.gy} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      ))}
      {/* data */}
      <polygon points={poly} fill={`${color}30`} stroke={color} strokeWidth="1.5" />
      {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={color} />)}
      {/* labels */}
      {points.map((p, i) => (
        <text key={i} x={p.gx} y={p.gy}
          textAnchor={p.gx < cx - 2 ? "end" : p.gx > cx + 2 ? "start" : "middle"}
          dominantBaseline={p.gy < cy - 2 ? "auto" : p.gy > cy + 2 ? "hanging" : "middle"}
          fontSize="7" fill="rgba(255,255,255,0.45)" fontFamily="'DM Mono', monospace">
          {p.label}
        </text>
      ))}
    </svg>
  );
}

// ── Metric Bar ────────────────────────────────────────────────────────────────
function MetricBar({ label, value, color, desc }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(value * 100), 80); return () => clearTimeout(t); }, [value]);
  return (
    <div style={{ marginBottom: 10 }} title={desc}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: 0.5 }}>{label}</span>
        <span style={{ fontSize: 11, color, fontFamily: "'DM Mono', monospace" }}>{(value * 100).toFixed(1)}%</span>
      </div>
      <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${w}%`, background: color, borderRadius: 2, transition: "width 0.9s cubic-bezier(0.4,0,0.2,1)" }} />
      </div>
    </div>
  );
}

// ── Model Result Card ─────────────────────────────────────────────────────────
function ModelCard({ result, rank }) {
  const model   = MODELS.find(m => m.id === result.model_id) || { color: "#888", label: result.model_label };
  const vc      = VERDICT_CONFIG[result.verdict] || { label: "—", color: "#888" };
  const overall = result.metrics?.overall ?? 0;
  const metrics = result.metrics || { factual_consistency: 0, completeness: 0, conciseness: 0, confidence_calibration: 0, overall: 0 };

  // Error state
  if (result.error) {
    return (
      <div style={{ background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.2)", borderTop: "3px solid #f87171", borderRadius: 14, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: model.color }} />
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: model.color }}>{result.model_label}</span>
        </div>
        <div style={{ fontSize: 12, color: "#f87171" }}>⚠ {result.error}</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>Check your API key or network connection</div>
      </div>
    );
  }

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${model.color}33`,
      borderTop: `3px solid ${model.color}`,
      borderRadius: 14, padding: 20,
      animation: "cardIn 0.4s ease forwards",
      opacity: 0,
      animationDelay: "0.05s",
      animationFillMode: "forwards",
      position: "relative",
    }}>
      {rank <= 3 && (
        <div style={{
          position: "absolute", top: 12, right: 12,
          width: 24, height: 24, borderRadius: "50%",
          background: rank === 1 ? "#fbbf24" : rank === 2 ? "#94a3b8" : "#cd7c3b",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 700, color: "#000",
        }}>#{rank}</div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: model.color }} />
        <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: model.color }}>{result.model_label}</span>
        {model.local && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 10, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)", letterSpacing: 1 }}>LOCAL</span>}
      </div>

      {/* Overall + Radar */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>Overall</div>
          <div style={{ fontSize: 32, fontFamily: "'DM Mono', monospace", color: model.color, fontWeight: 700, lineHeight: 1 }}>{(overall * 100).toFixed(0)}<span style={{ fontSize: 14 }}>%</span></div>
          <div style={{ marginTop: 6, padding: "3px 10px", borderRadius: 20, display: "inline-block", background: `${vc.color}18`, border: `1px solid ${vc.color}44`, fontSize: 10, color: vc.color, letterSpacing: 1 }}>{vc.label}</div>
        </div>
        <RadarChart metrics={metrics} color={model.color} size={110} />
      </div>

      {/* Metric bars */}
      {METRICS.map(m => (
        <MetricBar key={m.key} label={m.label} value={metrics?.[m.key] ?? 0} color={m.color} desc={m.desc} />
      ))}

      {/* Answer */}
      <div style={{ marginTop: 14, padding: "12px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Response</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.7 }}>{result.answer}</div>
      </div>

      {/* Patterns */}
      {result.patterns?.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {result.patterns.map((p, i) => (
            <span key={i} style={{
              fontSize: 10, padding: "3px 8px", borderRadius: 20,
              background: p === "None detected" ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
              border: `1px solid ${p === "None detected" ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`,
              color: p === "None detected" ? "#4ade80" : "#f87171",
            }}>{p}</span>
          ))}
        </div>
      )}

      {/* Footer: cost + latency + tokens */}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 16, flexWrap: "wrap" }}>
        {[
          ["Latency",  `${result.latency_ms?.toFixed(0)}ms`],
          ["Cost",     result.cost_usd > 0 ? `$${result.cost_usd.toFixed(5)}` : "Free"],
          ["Tokens",   `${(result.input_tokens || 0) + (result.output_tokens || 0)}`],
        ].map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: 1, textTransform: "uppercase" }}>{k}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: "'DM Mono', monospace" }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── GT Validator ──────────────────────────────────────────────────────────────
function GTValidator({ question, groundTruth }) {
  const [val, setVal] = useState(null);
  const debounce = useRef(null);

  useEffect(() => {
    if (!question.trim() || !groundTruth.trim()) { setVal(null); return; }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const r = await fetch(`${API}/validate-ground-truth`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, ground_truth: groundTruth }),
        });
        setVal(await r.json());
      } catch { setVal(null); }
    }, 600);
    return () => clearTimeout(debounce.current);
  }, [question, groundTruth]);

  if (!val) return null;
  const color = val.quality === "good" ? "#4ade80" : val.quality === "fair" ? "#fbbf24" : "#f87171";
  return (
    <div style={{ marginTop: 8, padding: "10px 14px", borderRadius: 10, background: `${color}0d`, border: `1px solid ${color}33` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: val.issues?.length ? 6 : 0 }}>
        <span style={{ fontSize: 11, color, letterSpacing: 1, textTransform: "uppercase" }}>Ground Truth Quality: {val.quality.toUpperCase()}</span>
        <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color }}>{val.score}/100</span>
      </div>
      {val.issues?.map((issue, i) => (
        <div key={i} style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>⚠ {issue}</div>
      ))}
    </div>
  );
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
function Leaderboard({ results }) {
  const sorted = [...results].sort((a, b) => (b.metrics?.overall ?? 0) - (a.metrics?.overall ?? 0));
  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 2, textTransform: "uppercase" }}>
        Session Leaderboard
      </div>
      {sorted.map((r, i) => {
        const model = MODELS.find(m => m.id === r.model_id) || { color: "#888" };
        const overall = r.metrics?.overall ?? 0;
        return (
          <div key={r.model_id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", borderBottom: i < sorted.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
            <span style={{ fontSize: 13, fontFamily: "'DM Mono', monospace", color: "rgba(255,255,255,0.3)", width: 20 }}>#{i + 1}</span>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: model.color }} />
            <span style={{ flex: 1, fontSize: 13, color: "rgba(255,255,255,0.8)" }}>{r.model_label}</span>
            <div style={{ width: 120, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${overall * 100}%`, background: model.color, borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: model.color, width: 40, textAlign: "right" }}>{(overall * 100).toFixed(0)}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Session History Item ──────────────────────────────────────────────────────
function HistoryItem({ session, onClick }) {
  const winner = session.results?.length
    ? [...session.results].sort((a, b) => (b.metrics?.overall ?? 0) - (a.metrics?.overall ?? 0))[0]
    : null;
  const wModel = winner ? MODELS.find(m => m.id === winner.model_id) : null;
  return (
    <div onClick={onClick} style={{
      padding: "12px 16px", borderRadius: 10, cursor: "pointer",
      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
      marginBottom: 8, transition: "border-color 0.2s",
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"}
    >
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.question}</div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", padding: "2px 8px", borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>{session.domain}</span>
        {wModel && <span style={{ fontSize: 10, color: wModel.color }}>Winner: {winner.model_label} ({(winner.metrics.overall * 100).toFixed(0)}%)</span>}
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginLeft: "auto" }}>{new Date(session.ts).toLocaleTimeString()}</span>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [question, setQuestion]       = useState("");
  const [groundTruth, setGT]          = useState("");
  const [domain, setDomain]           = useState("General");
  const [selectedModels, setModels]   = useState(["flan-t5", "claude", "gpt4o", "gemini"]);
  const [results, setResults]         = useState([]);
  const [loading, setLoading]         = useState(false);
  const [pendingModels, setPending]   = useState([]);
  const [sessions, setSessions]       = useState([]);
  const [activeTab, setActiveTab]     = useState("evaluate");
  const [backendOk, setBackendOk]     = useState(null);
  const [error, setError]             = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/health`).then(r => r.json()).then(() => setBackendOk(true)).catch(() => setBackendOk(false));
  }, []);

  const loadSample = (s) => { setQuestion(s.q); setGT(s.gt); setDomain(s.domain); setResults([]); setError(null); };

  const toggleModel = (id) => setModels(prev =>
    prev.includes(id) ? (prev.length > 1 ? prev.filter(m => m !== id) : prev) : [...prev, id]
  );

  const evaluate = async () => {
    if (!question.trim() || !groundTruth.trim() || !backendOk) return;
    setLoading(true); setResults([]); setError(null);
    setPending([...selectedModels]);

    try {
      const r = await fetch(`${API}/evaluate-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, ground_truth: groundTruth, domain, models: selectedModels }),
      });
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const collectedResults = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;
          try {
            const result = JSON.parse(payload);
            collectedResults.push(result);
            setResults(prev => [...prev, result]);
            setPending(prev => prev.filter(m => m !== result.model_id));
          } catch {}
        }
      }

      // Save session
      if (collectedResults.length > 0) {
        setSessions(prev => [{
          id: Date.now(), question, domain, ts: Date.now(), results: collectedResults,
        }, ...prev].slice(0, 20));
      }
    } catch (e) {
      setError(`Stream error: ${e.message}`);
    }
    setLoading(false); setPending([]);
  };

  const sortedResults = [...results].sort((a, b) => (b.metrics?.overall ?? 0) - (a.metrics?.overall ?? 0));
  const totalCost     = results.reduce((s, r) => s + (r.cost_usd ?? 0), 0);

  return (
    <div style={{ minHeight: "100vh", background: "#07090f", fontFamily: "'DM Sans', sans-serif", color: "#fff" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500;700&family=Syne:wght@600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        textarea { outline: none; }
        @keyframes cardIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .fade-up { animation: fadeUp 0.45s ease forwards; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100, background: "rgba(7,9,15,0.9)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg, rgba(249,115,22,0.2), rgba(34,211,238,0.2))", border: "1px solid rgba(249,115,22,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>⚗</div>
          <div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, letterSpacing: -0.5 }}>
              Hallucination<span style={{ color: "#f97316" }}>Lab</span>
              <span style={{ fontSize: 11, marginLeft: 8, color: "rgba(255,255,255,0.25)", fontFamily: "'DM Mono', monospace", fontWeight: 400 }}>v2</span>
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", letterSpacing: 1.5 }}>MULTI-MODEL HALLUCINATION EVALUATOR</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* Backend status */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: backendOk === null ? "#888" : backendOk ? "#4ade80" : "#f87171", animation: backendOk ? "pulse 2s infinite" : "none" }} />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{backendOk === null ? "…" : backendOk ? "Backend live" : "Backend offline"}</span>
          </div>
          {/* Tabs */}
          {["evaluate", "history"].map(t => (
            <button key={t} onClick={() => setActiveTab(t)} style={{
              padding: "6px 16px", borderRadius: 8, border: "1px solid",
              borderColor: activeTab === t ? "rgba(249,115,22,0.4)" : "rgba(255,255,255,0.08)",
              background: activeTab === t ? "rgba(249,115,22,0.08)" : "transparent",
              color: activeTab === t ? "#f97316" : "rgba(255,255,255,0.4)",
              fontSize: 12, cursor: "pointer", textTransform: "capitalize", letterSpacing: 0.5,
            }}>{t}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "28px 24px" }}>

        {/* ── EVALUATE TAB ── */}
        {activeTab === "evaluate" && (
          <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 24 }}>

            {/* LEFT: Input Panel */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Samples */}
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>Sample Questions</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {SAMPLES.map((s, i) => (
                    <button key={i} onClick={() => loadSample(s)} style={{
                      padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)",
                      fontSize: 12, cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(249,115,22,0.3)"; e.currentTarget.style.color = "#f97316"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.q}</span>
                      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", flexShrink: 0, padding: "2px 6px", background: "rgba(255,255,255,0.04)", borderRadius: 6 }}>{s.domain}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Question */}
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Question</div>
                <textarea value={question} onChange={e => setQuestion(e.target.value)}
                  placeholder="Enter your question…"
                  style={{ width: "100%", background: "transparent", border: "none", color: "#fff", fontSize: 14, resize: "none", height: 72, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6 }} />
              </div>

              {/* Ground Truth */}
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Ground Truth Reference</div>
                <textarea value={groundTruth} onChange={e => setGT(e.target.value)}
                  placeholder="Enter the verified correct answer…"
                  style={{ width: "100%", background: "transparent", border: "none", color: "rgba(255,255,255,0.8)", fontSize: 13, resize: "none", height: 80, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6 }} />
                <GTValidator question={question} groundTruth={groundTruth} />
              </div>

              {/* Domain */}
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>Domain</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {DOMAINS.map(d => (
                    <button key={d} onClick={() => setDomain(d)} style={{
                      padding: "5px 12px", borderRadius: 20, fontSize: 11, cursor: "pointer",
                      background: domain === d ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${domain === d ? "rgba(249,115,22,0.5)" : "rgba(255,255,255,0.08)"}`,
                      color: domain === d ? "#f97316" : "rgba(255,255,255,0.5)", transition: "all 0.15s",
                    }}>{d}</button>
                  ))}
                </div>
              </div>

              {/* Model Selection */}
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>Models to Evaluate</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {MODELS.map(m => {
                    const selected = selectedModels.includes(m.id);
                    const isPending = pendingModels.includes(m.id);
                    return (
                      <div key={m.id} onClick={() => toggleModel(m.id)} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                        borderRadius: 9, cursor: "pointer",
                        background: selected ? `${m.color}0d` : "rgba(255,255,255,0.02)",
                        border: `1px solid ${selected ? `${m.color}44` : "rgba(255,255,255,0.06)"}`,
                        transition: "all 0.15s",
                      }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: selected ? m.color : "rgba(255,255,255,0.15)", transition: "background 0.2s" }} />
                        <span style={{ flex: 1, fontSize: 13, color: selected ? m.color : "rgba(255,255,255,0.5)" }}>{m.label}</span>
                        {m.local && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", letterSpacing: 1 }}>LOCAL GPU</span>}
                        {isPending && (
                          <div style={{ width: 12, height: 12, border: `2px solid ${m.color}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                        )}
                        {results.find(r => r.model_id === m.id) && !isPending && (
                          <span style={{ fontSize: 10, color: m.color }}>✓</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Run Button */}
              <button onClick={evaluate} disabled={loading || !question.trim() || !groundTruth.trim() || !backendOk} style={{
                padding: "15px 0", borderRadius: 12, border: "none",
                background: loading ? "rgba(249,115,22,0.1)" : "linear-gradient(135deg, #f97316, #fb923c)",
                color: loading ? "#f97316" : "#fff",
                fontSize: 13, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "'DM Sans', sans-serif", letterSpacing: 1, textTransform: "uppercase",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                opacity: (!question.trim() || !groundTruth.trim() || !backendOk) ? 0.4 : 1,
                transition: "all 0.2s",
              }}>
                {loading ? (
                  <>
                    <div style={{ width: 14, height: 14, border: "2px solid #f97316", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                    Evaluating {selectedModels.length} Models…
                  </>
                ) : `Evaluate ${selectedModels.length} Models`}
              </button>

              {error && <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", color: "#f87171", fontSize: 12 }}>{error}</div>}
            </div>

            {/* RIGHT: Results */}
            <div>
              {results.length === 0 && !loading && (
                <div style={{ height: 400, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "1px dashed rgba(255,255,255,0.06)", borderRadius: 14 }}>
                  <div style={{ fontSize: 36, opacity: 0.2, marginBottom: 14 }}>⚗</div>
                  <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 14, marginBottom: 8 }}>Select a question and run evaluation</div>
                  <div style={{ color: "rgba(255,255,255,0.15)", fontSize: 12 }}>Results stream in as each model responds</div>
                </div>
              )}

              {/* Pending spinners */}
              {pendingModels.length > 0 && (
                <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
                  {pendingModels.map(mid => {
                    const m = MODELS.find(x => x.id === mid);
                    return (
                      <div key={mid} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, background: `${m?.color}0d`, border: `1px solid ${m?.color}33` }}>
                        <div style={{ width: 12, height: 12, border: `2px solid ${m?.color}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                        <span style={{ fontSize: 12, color: m?.color }}>{m?.label} running…</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Leaderboard (shows once 2+ results) */}
              {results.length >= 2 && (
                <div className="fade-up" style={{ marginBottom: 24 }}>
                  <Leaderboard results={results} />
                  {/* Session cost */}
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.3)", fontFamily: "'DM Mono', monospace" }}>
                    Session cost: ${totalCost.toFixed(5)} USD
                  </div>
                </div>
              )}

              {/* Model Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
                {sortedResults.map((r, i) => (
                  <ModelCard key={r.model_id} result={r} rank={i + 1} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {activeTab === "history" && (
          <div className="fade-up">
            {sessions.length === 0 ? (
              <div style={{ textAlign: "center", padding: 80, color: "rgba(255,255,255,0.25)" }}>
                No sessions yet — run some evaluations first
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                <div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>Past Sessions ({sessions.length})</div>
                  {sessions.map(s => (
                    <HistoryItem key={s.id} session={s} onClick={() => {
                      setQuestion(s.question); setActiveTab("evaluate");
                      setResults(s.results || []);
                    }} />
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>Aggregate Stats</div>
                  {(() => {
                    const allResults = sessions.flatMap(s => s.results || []);
                    const byModel = MODELS.map(m => {
                      const mrs = allResults.filter(r => r.model_id === m.id);
                      if (!mrs.length) return null;
                      const avg = key => mrs.reduce((s, r) => s + (r.metrics?.[key] ?? 0), 0) / mrs.length;
                      return { ...m, overall: avg("overall"), fc: avg("factual_consistency"), count: mrs.length };
                    }).filter(Boolean).sort((a, b) => b.overall - a.overall);

                    return (
                      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden" }}>
                        {byModel.map((m, i) => (
                          <div key={m.id} style={{ padding: "14px 20px", borderBottom: i < byModel.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 7, height: 7, borderRadius: "50%", background: m.color }} />
                                <span style={{ fontSize: 13, color: m.color }}>{m.label}</span>
                                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>{m.count} evals</span>
                              </div>
                              <span style={{ fontSize: 13, fontFamily: "'DM Mono', monospace", color: m.color }}>{(m.overall * 100).toFixed(1)}%</span>
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              {METRICS.map(met => (
                                <div key={met.key} style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${(byModel.find(b => b.id === m.id)?.[met.key === "factual_consistency" ? "fc" : "overall"] ?? 0) * 100}%`, background: met.color, borderRadius: 2 }} />
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
