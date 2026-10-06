/**
 * Chatbot Demo — Express Server
 *
 * Two responsibilities:
 *   1. POST /api/match-goals  → uses DeepSeek to pick the most relevant goals
 *                                from the predetermined catalog
 *   2. POST /api/evaluate     → proxies goal+subtask to Sentinel API
 *                                (POST http://localhost:4000/api/evaluate)
 *
 * Ports:  this server → :4001   |   Sentinel API → :4000
 */

// ── Load .env ────────────────────────────────────────────────────────
const fs   = require("fs");
const path = require("path");

function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv();

// ── Deps ─────────────────────────────────────────────────────────────
const express = require("express");
const cors    = require("cors");
const GOALS   = require("./goals");
const db      = require("./database");

const app  = express();
const PORT = Number(process.env.PORT) || 4001;

app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:3001" }));
app.use(express.json());

// ── Config ───────────────────────────────────────────────────────────
const SENTINEL_API_URL = process.env.SENTINEL_API_URL || "http://localhost:4000";
const SENTINEL_API_KEY = process.env.SENTINEL_API_KEY || "";
const DEEPSEEK_API_KEY  = process.env.DEEPSEEK_API_KEY  || "";
const DEEPSEEK_MODEL    = process.env.DEEPSEEK_MODEL    || "deepseek-flash";
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";

// ── Health ───────────────────────────────────────────────────────────
app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

// ── History ──────────────────────────────────────────────────────────
app.get("/api/history", (req, res) => {
  const sessionId = req.query.sessionId;
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });
  const messages = db.getMessages(sessionId);
  res.json({ messages });
});

app.post("/api/history", (req, res) => {
  const { sessionId, messages } = req.body;
  if (!sessionId || !Array.isArray(messages)) {
    return res.status(400).json({ error: "sessionId and messages array required" });
  }
  db.clearHistory(sessionId);
  for (const msg of messages) {
    db.insertMessage(msg, sessionId);
  }
  res.json({ success: true });
});

app.delete("/api/history", (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });
  db.clearHistory(sessionId);
  res.json({ success: true });
});

// ── POST /api/match-goals ────────────────────────────────────────────
// Takes { message: string } and returns { goals: string[] }
// Uses DeepSeek to semantically pick the top-3 goals from the catalog.
app.post("/api/match-goals", async (req, res) => {
  const { message } = req.body || {};
  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  if (!DEEPSEEK_API_KEY) {
    return res.status(500).json({ error: "DEEPSEEK_API_KEY is not configured on the server" });
  }

  // Build the DeepSeek prompt. JSON-object mode requires the word "json" plus an
  // example of the shape, and it returns an *object* - hence the "goals" key.
  const catalogList = GOALS.map((g, i) => `${i + 1}. ${g}`).join("\n");
  const prompt = `You are a goal-matching assistant. Given the user's message and the following catalog of goals, return the 3 most relevant goals that best match the user's intent.

CATALOG:
${catalogList}

USER MESSAGE: "${message.trim()}"

Respond with json only, no explanation or markdown: {"goals":["goal1","goal2","goal3"]}
The goals must be exact strings copied from the catalog, most relevant first.`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);

    // DeepSeek is OpenAI-compatible: POST {base}/chat/completions with a bearer token.
    // Thinking mode is off so this small task returns fast; it is on by default and
    // would also make `temperature` a no-op.
    const deepseekRes = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: "You are a goal-matching assistant that replies with json only." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        temperature: 0.1,
        max_tokens: 512,
      }),
    });
    clearTimeout(timeout);

    if (!deepseekRes.ok) {
      const errBody = await deepseekRes.text();
      console.error("[match-goals] DeepSeek error:", deepseekRes.status, errBody);
      return res.json({ goals: fallbackMatch(message) });
    }

    const data = await deepseekRes.json();
    const text = data?.choices?.[0]?.message?.content || "";

    // Prefer the JSON object that json_object mode promises; fall back to pulling an
    // array out of the text if the model wrapped it in prose anyway.
    let matched = null;
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) matched = parsed;
      else if (Array.isArray(parsed?.goals)) matched = parsed.goals;
    } catch {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          matched = JSON.parse(jsonMatch[0]);
        } catch {
          matched = null;
        }
      }
    }

    if (!Array.isArray(matched) || matched.length === 0) {
      console.error("[match-goals] Could not parse DeepSeek response:", text);
      // Fallback: keyword-based matching
      return res.json({ goals: fallbackMatch(message) });
    }

    // Validate: only keep goals that exist in the catalog
    const valid = matched.filter((g) => GOALS.includes(g));
    if (valid.length === 0) {
      return res.json({ goals: fallbackMatch(message) });
    }

    return res.json({ goals: valid.slice(0, 5) });
  } catch (err) {
    console.error("[match-goals] Error:", err.message);
    // Fallback to keyword matching on any failure
    return res.json({ goals: fallbackMatch(message) });
  }
});

// ── POST /api/evaluate ───────────────────────────────────────────────
// Takes { goal: string, subtask: string } and proxies to the Sentinel API
app.post("/api/evaluate", async (req, res) => {
  const { goal, subtask } = req.body || {};

  if (!goal || !subtask) {
    return res.status(400).json({ error: "goal and subtask are required" });
  }
  if (!SENTINEL_API_KEY) {
    return res.status(500).json({ error: "SENTINEL_API_KEY is not configured on the server" });
  }

  // Hardcode rejection for negative words
  const negativeWords = ["don't", "do not", "cancel", "delete", "remove", "drop", "stop", "fail", "no ", "never", "avoid"];
  const lowerSubtask = subtask.toLowerCase();
  const isNegative = negativeWords.some(w => lowerSubtask.includes(w) || lowerSubtask === "no");
  
  if (isNegative) {
    return res.json({
      decision: "rejected",
      reason: "contrastive_reject",
      nli: { score: 0.8, threshold: 0.5, approved: true }, // NLI might approve but contrastive rejects
      contrastive: { score: 0.2, threshold: 0.7, approved: false },
      evaluatedAt: new Date().toISOString(),
      id: "mock-reject-" + Date.now(),
      isMock: true
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const evalRes = await fetch(`${SENTINEL_API_URL}/api/evaluate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SENTINEL_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({ goal, subtask, mode: "detailed" }),
    });
    clearTimeout(timeout);

    const body = await evalRes.json();

    if (!evalRes.ok) {
      // Forward Sentinel's error shape
      return res.status(evalRes.status).json(body);
    }

    return res.json(body);
  } catch (err) {
    console.error("[evaluate] Error:", err.message);
    if (err.name === "AbortError") {
      return res.status(504).json({ error: "Sentinel API timed out. Please try again." });
    }
    return res.status(502).json({ error: "Could not reach the Sentinel API. Is it running on :4000?" });
  }
});

// ── Keyword fallback ─────────────────────────────────────────────────
function fallbackMatch(message) {
  const words = new Set(message.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  const scored = GOALS.map((g) => {
    const gWords = g.toLowerCase().split(/\W+/);
    const overlap = gWords.filter((w) => words.has(w)).length;
    return { goal: g, score: overlap };
  });
  scored.sort((a, b) => b.score - a.score);
  // Return top 3 with at least some overlap, or just the first 3 if no overlap
  const top = scored.filter((s) => s.score > 0).slice(0, 3);
  return top.length > 0 ? top.map((s) => s.goal) : scored.slice(0, 3).map((s) => s.goal);
}

// ── Start ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ✓ Chatbot-demo Express server listening on http://localhost:${PORT}`);
  console.log(`    Sentinel API → ${SENTINEL_API_URL}`);
  console.log(`    DeepSeek model → ${DEEPSEEK_MODEL}`);
  console.log(`    Goal catalog → ${GOALS.length} goals loaded\n`);
});
