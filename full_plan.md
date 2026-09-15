# Technical Implementation Plan: NLI Security Gateway

## Overview

A security evaluation service that checks if agent subtasks align with authorized goals using dual-model verification (NLI \+ Contrastive), with API key management and request logging.

## Tech Stack

### Backend

- **Node.js \+ Express** (Primary) \- Can run Python models via child\_process or microservice  
- **Alternative**: FastAPI (Python) \- Native model integration  
- **Database**: PostgreSQL (Supabase)  
- **Model Runtime**: Python microservice or ONNX.js for browser inference

### Frontend

- **React** with TypeScript  
- **Tailwind CSS** for styling  
- **React Query** for API state management  
- **React Router** for navigation

### Infrastructure

- **Supabase** (PostgreSQL \+ Auth)

## 

## Database Schema

*`-- ============================================`*  
*`-- 0. Users Table`*  
*`-- ============================================`*  
`CREATE TABLE users (`  
    `id UUID PRIMARY KEY DEFAULT gen_random_uuid(),`  
    `email VARCHAR(255) UNIQUE NOT NULL,`  
    `username VARCHAR(50) UNIQUE,`  
    `full_name VARCHAR(100),`  
    `password_hash VARCHAR(255),           -- NULL if using Supabase Auth / OAuth`  
    `is_active BOOLEAN DEFAULT TRUE,`  
    `is_admin BOOLEAN DEFAULT FALSE,`  
    `last_login_at TIMESTAMPTZ,`  
    `created_at TIMESTAMPTZ DEFAULT NOW(),`  
    `updated_at TIMESTAMPTZ DEFAULT NOW(),`  
    `metadata JSONB DEFAULT '{}'::jsonb`  
`);`

`CREATE INDEX idx_users_email ON users(email);`  
`CREATE INDEX idx_users_username ON users(username);`  
`CREATE INDEX idx_users_is_active ON users(is_active);`

*`-- ============================================`*  
*`-- 1. API Keys Table`*  
*`-- ============================================`*  
`CREATE TABLE api_keys (`  
    `id UUID PRIMARY KEY DEFAULT gen_random_uuid(),`  
    `user_id UUID REFERENCES users(id) ON DELETE CASCADE,`  
    `api_key VARCHAR(64) UNIQUE NOT NULL,`  
    `key_name VARCHAR(100) NOT NULL,`  
    `is_active BOOLEAN DEFAULT TRUE,`  
    `rate_limit_per_minute INTEGER DEFAULT 60,`  
    `created_at TIMESTAMPTZ DEFAULT NOW(),`  
    `last_used_at TIMESTAMPTZ,`  
    `expires_at TIMESTAMPTZ,`  
    `metadata JSONB DEFAULT '{}'::jsonb`  
`);`

`CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);`  
`CREATE INDEX idx_api_keys_api_key ON api_keys(api_key);`

*`-- ============================================`*  
*`-- 2. Requests Log Table`*  
*`-- ============================================`*  
`CREATE TABLE evaluation_requests (`  
    `id UUID PRIMARY KEY DEFAULT gen_random_uuid(),`  
    `api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,`  
    `request_id VARCHAR(64) UNIQUE NOT NULL,`  
    `goal TEXT NOT NULL,`  
    `subtask TEXT NOT NULL,`

    `-- Results`  
    `is_rejected BOOLEAN NOT NULL,`  
    `rejection_reason VARCHAR(50), -- 'nli_reject' | 'contrastive_reject' | 'both_reject'`

    `-- NLI Results`  
    `nli_score FLOAT,`  
    `nli_result BOOLEAN,`  
    `nli_threshold FLOAT,`  
    `nli_confidence FLOAT,`  
    `nli_raw_scores JSONB, -- [entailment, neutral, contradiction]`

    `-- Contrastive Results`  
    `contrastive_score FLOAT,`  
    `contrastive_result BOOLEAN,`  
    `contrastive_threshold FLOAT,`  
    `contrastive_similarity FLOAT,`

    `-- Metadata`  
    `user_agent TEXT,`  
    `response_time_ms INTEGER,`  
    `model_version VARCHAR(20),`  
    `evaluation_mode VARCHAR(20) DEFAULT 'standard', -- 'standard' | 'detailed'`  
    `created_at TIMESTAMPTZ DEFAULT NOW()`  
`);`

`CREATE INDEX idx_eval_requests_api_key ON evaluation_requests(api_key_id);`  
`CREATE INDEX idx_eval_requests_created ON evaluation_requests(created_at DESC);`  
`CREATE INDEX idx_eval_requests_rejected ON evaluation_requests(is_rejected);`  
`CREATE INDEX idx_eval_requests_request_id ON evaluation_requests(request_id);`

*`-- ============================================`*  
*`-- 3. Model Metrics Table (for monitoring)`*  
*`-- ============================================`*  
`CREATE TABLE model_metrics (`  
    `id UUID PRIMARY KEY DEFAULT gen_random_uuid(),`  
    `model_type VARCHAR(20) NOT NULL, -- 'nli' | 'contrastive'`  
    `evaluation_count INTEGER DEFAULT 0,`  
    `rejection_count INTEGER DEFAULT 0,`  
    `avg_score FLOAT,`  
    `avg_response_time_ms INTEGER,`  
    `last_updated TIMESTAMPTZ DEFAULT NOW()`  
`);`

*`-- ============================================`*  
*`-- 4. Threshold Configurations Table`*  
*`-- ============================================`*  
`CREATE TABLE threshold_configs (`  
    `id UUID PRIMARY KEY DEFAULT gen_random_uuid(),`  
    `model_type VARCHAR(20) NOT NULL, -- 'nli' | 'contrastive'`  
    `threshold_value FLOAT NOT NULL,`  
    `is_active BOOLEAN DEFAULT TRUE,`  
    `created_by UUID REFERENCES users(id),`  
    `created_at TIMESTAMPTZ DEFAULT NOW(),`  
    `notes TEXT`  
`);`

## ![][image1]

## System Architecture

### Option A: Node.js \+ Python Microservice (Recommended)

![][image2]

## 

## Backend Implementation (Express \+ Python Microservice)

### 1\. Express API Structure

![][image3]

### 

### 2\. Python Inference Service

#### What to Do

1. Create a simple FastAPI/Flask service that:  
   - Loads both models at startup  
   - Exposes a `/evaluate` endpoint  
   - Runs both models in parallel (asyncio)  
   - Returns scores and rejection decisions

#### Model Logic

**NLI Model (cross-encoder/nli-MiniLM2-L6-H768):**

* **Input**:   
  * **Premise** \= "Agent is authorized to \[goal\]. Agent performs tasks that support this goal."  
  * **Hypothesis** \= "Agent is performing: \[subtask\]"  
* **Output**: \[entailment, neutral, contradiction\] scores  
* **Rejection**: contradiction\_score \> threshold (default: 0.65)

**Contrastive Model (all-MiniLM-L12-v2):**

* **Input**: goal, subtask  
* **Output**: cosine similarity score  
* **Rejection**: similarity\_score \< threshold (default: 0.70)

**Decision**: REJECT if **EITHER** model rejects

#### Technical Setup

inference\_service/  
├── app.py          		\# FastAPI server  
├── models.py      		\# Model loading and inference  
├── requirements.txt  
└── run.sh         		\# Startup script

*`# inference_service/app.py`*

`from fastapi import FastAPI, HTTPException`  
`from pydantic import BaseModel`  
`from sentence_transformers import CrossEncoder, SentenceTransformer`  
`import numpy as np`  
`import asyncio`  
`from typing import Optional`

`app = FastAPI()`

*`# Load models at startup`*  
`nli_model = CrossEncoder("cross-encoder/nli-MiniLM2-L6-H768")`  
`contrastive_model = SentenceTransformer("all-MiniLM-L12-v2")`

*`# Pre-compute thresholds from training`*  
`NLI_THRESHOLD = 0.65  # Tuned from training`  
`CONTRASTIVE_THRESHOLD = 0.70  # Tuned from training`

`class EvaluationRequest(BaseModel):`  
    `goal: str`  
    `subtask: str`  
    `nli_threshold: Optional[float] = None`  
    `contrastive_threshold: Optional[float] = None`

`class ModelResponse(BaseModel):`  
    `nli_score: float`  
    `nli_result: bool`  
    `nli_threshold: float`  
    `nli_raw_scores: dict`

    `contrastive_score: float`  
    `contrastive_result: bool`  
    `contrastive_threshold: float`

    `is_rejected: bool`  
    `rejection_reason: str`

`@app.post("/evaluate", response_model=ModelResponse)`

`async def evaluate(request: EvaluationRequest):`

    `# Run models in parallel`  
    `nli_task = evaluate_nli(request.goal, request.subtask, request.nli_threshold)`

    `contrastive_task = evaluate_contrastive(request.goal, request.subtask, request.contrastive_threshold)`  
    `nli_result, contrastive_result = await asyncio.gather(nli_task, contrastive_task)`  
    `is_rejected = nli_result["result"] or contrastive_result["result"]`  
    `rejection_reason = []`  
     
    `if nli_result["result"]: rejection_reason.append("nli_reject")`  
    `if contrastive_result["result"]: rejection_reason.append("contrastive_reject")`

    `return {`  
        `**nli_result,`  
        `**contrastive_result,`  
        `"is_rejected": is_rejected,`  
        `"rejection_reason": "_".join(rejection_reason) if rejection_reason else "accepted"`  
    `}`

`async def evaluate_nli(goal: str, subtask: str, threshold: float = None):`

    `threshold = threshold or NLI_THRESHOLD`

    `premise = f"An AI agent is authorized to {goal.lower()}. The agent performs only tasks that support this goal."`  
    `hypothesis = f"The agent is now performing: {subtask.lower()}"`

    `scores = nli_model.predict([(premise, hypothesis)])[0]`

    `# scores: [entailment, neutral, contradiction]`  
    `# For security: contradiction (index 2) indicates misalignment`  
    `# We consider contradiction as rejection`  
    `contradiction_score = scores[2]  # Higher = more contradictory`  
    `is_rejected = contradiction_score > threshold`

    `return {`  
        `"nli_score": float(contradiction_score),`  
        `"nli_result": bool(is_rejected),`  
        `"nli_threshold": threshold,`  
        `"nli_raw_scores": {`  
            `"entailment": float(scores[0]),`  
            `"neutral": float(scores[1]),`  
            `"contradiction": float(scores[2])`  
        `}`  
    `}`

`async def evaluate_contrastive(goal: str, subtask: str, threshold: float = None):`

    `threshold = threshold or CONTRASTIVE_THRESHOLD`  
    `goal_embedding = contrastive_model.encode(goal)`  
    `subtask_embedding = contrastive_model.encode(subtask)`

    `# Cosine similarity`  
    `similarity = np.dot(goal_embedding, subtask_embedding) / (np.linalg.norm(goal_embedding) * np.linalg.norm(subtask_embedding))`

    `# Lower similarity = potential misalignment`  
    `# We consider low similarity as rejection`  
    `is_rejected = similarity < threshold`

    `return {`  
        `"contrastive_score": float(similarity),`  
        `"contrastive_result": bool(is_rejected),`  
        `"contrastive_threshold": threshold`  
    `}`

`if __name__ == "__main__":`  
    `import uvicorn`  
    `uvicorn.run(app, host="0.0.0.0", port=8000)`

### 

### 3\. Express Evaluation Route

#### What to Do

1. Create Express.js server that:  
   - Validates API keys  
   - Receives user requests (goal \+ subtask)  
   - Calls Python inference service  
   - Logs results to Supabase  
   - Returns response (standard or detailed)

*`// routes/evaluate.js`*

`const express = require('express');`  
`const router = express.Router();`  
`const { validateApiKey, rateLimiter } = require('../middleware/auth');`  
`const evaluationService = require('../services/evaluation-service');`  
`const { v4: uuidv4 } = require('uuid');`

`router.post('/', validateApiKey, rateLimiter, async (req, res) => {`  
    `try {`  
        `const { goal, subtask, mode = 'standard' } = req.body;`

        `// Validate input`  
        `if (!goal || !subtask) {`  
            `return res.status(400).json({ error: 'goal and subtask are required' });`  
        `}`

        `const requestId = uuidv4();`  
        `const startTime = Date.now();`

        `// Call Python inference service`  
        `const result = await evaluationService.evaluate({`  
            `goal,`  
            `subtask,`  
            `requestId,`  
            `apiKeyId: req.apiKey.id,`  
            `mode`  
        `});`

        `const responseTime = Date.now() - startTime;`

        `// Log to database`  
        `await evaluationService.logRequest({`  
            `...result,`  
            `requestId,`  
            `apiKeyId: req.apiKey.id,`  
            `responseTime,`  
            `ipAddress: req.ip,`  
            `userAgent: req.headers['user-agent'],`  
            `mode`  
        `});`

        `// Response based on mode`  
        `if (mode === 'detailed') {`  
            `return res.json({`  
                `result: !result.is_rejected,`  
                `date: new Date().toISOString(),`  
                `id: requestId,`  
                `bearer: req.apiKey.api_key,`  
                `nli: {`  
                    `score: result.nli_score,`  
                    `result: !result.nli_result, // True = accepted`  
                    `threshold: result.nli_threshold`  
                `},`  
                `contrastive: {`  
                    `score: result.contrastive_score,`  
                    `result: !result.contrastive_result,`  
                    `threshold: result.contrastive_threshold`  
                `}`  
            `});`  
        `} else {`  
            `// Standard mode - just return status`  
            `return res.json({`  
                `result: !result.is_rejected,`  
                `date: new Date().toISOString(),`  
                `id: requestId`  
            `});`  
        `}`  
    `} catch (error) {`  
        `console.error('Evaluation error:', error);`  
        `res.status(500).json({ error: 'Evaluation failed' });`  
    `}`  
`});`

`module.exports = router;`

## Frontend Pages

### What to Do

Create a simple React app with 4 pages after LOGIN:

### Pages

1. **Login/Create Account Page**  
* Create email and password if no user  
* User should tie to their obvious data

2. **Dashboard**  
   - Summary stats: total requests, rejection rate, avg response time  
   - Recent activity feed (last 10 requests)

   

3. **API Key Management**  
   - Create new API keys (generate, name, rate limit)  
   - List existing keys with status  
   - Deactivate/delete keys  
   - Copy key to clipboard

   

4. **Logs Viewer**  
   - Table of all requests with filters:  
     - Date range  
     - Status (accepted/rejected)  
     - Search by request ID  
   - Click row to see detailed evaluation  
   - Export to CSV

   

5. **Settings**  
   - Adjust NLI threshold (slider if possible)  
   - Adjust contrastive threshold (slider if possible)  
   - Save threshold changes to database

## 

## Implementation Roadmap

### Step 1: Database (1-2 hours)

1. Sign up for Supabase  
2. Create new project  
3. Run SQL schema (use SQL editor)  
4. Test connection from Python/Node

### Step 2: Python Service (2-3 hours)

1. Create virtual environment  
2. Install: fastapi, uvicorn, sentence-transformers, torch  
3. Write model loading \+ inference functions  
4. Test with sample inputs  
5. Save pre-trained threshold values

### Step 3: Express API (2-3 hours)

1. Initialize Node.js project  
2. Install: express, cors, dotenv, supabase-js, axios  
3. Implement middleware: auth, rate limit, validation  
4. Create service that calls Python API  
5. Implement logging to Supabase

### Step 4: React Frontend (3-4 hours)

1. Create React app with Vite/CRA  
2. Install: react-router-dom, axios, react-query  
3. Build each page component  
4. Connect to Express API  
5. Add basic styling (Tailwind or plain CSS)

### Step 5: Testing & Integration (1-2 hours)

1. Test entire flow: frontend → API → Python service → DB  
2. Test both modes: standard (status only) \+ detailed (full scores)  
3. Test API key validation  
4. Verify logging works

### Step 6: Deployment (1-2 hours)

1. Deploy Python service (Render/Fly.io)  
2. Deploy Express API (same or separate)  
3. Deploy React frontend (Vercel/Netlify)  
4. Update environment variables

## 

## Alternative: Pure Python (FastAPI) Approach

If Node.js becomes problematic for the inference service, use FastAPI for everything:

*`# main.py - Single service`*

`from fastapi import FastAPI, Depends, HTTPException`  
`from fastapi.middleware.cors import CORSMiddleware`  
`import asyncpg`  
`from sentence_transformers import CrossEncoder, SentenceTransformer`  
`import numpy as np`  
`import asyncio`

`app = FastAPI()`

*`# Database connection pool`*  
`async def get_db():`  
    `return await asyncpg.connect(os.environ['DATABASE_URL'])`

*`# Models loaded at startup`*  
`nli_model = CrossEncoder("cross-encoder/nli-MiniLM2-L6-H768")`  
`contrastive_model = SentenceTransformer("all-MiniLM-L12-v2")`

`@app.post("/api/evaluate")`

`async def evaluate(request: EvaluationRequest, db=Depends(get_db)):`  
     
    `# Run both models`  
    `nli_result = await evaluate_nli(request.goal, request.subtask)`  
    `contrastive_result = await evaluate_contrastive(request.goal, request.subtask)`  
     
    `# Log to database`  
    `await db.execute("""`  
        `INSERT INTO evaluation_requests`  
        `(api_key_id, request_id, goal, subtask, is_rejected, nli_score, contrastive_score, ...)`  
        `VALUES ($1, $2, $3, $4, $5, $6, $7, ...)`  
    `""", ...)`  
    `return response`

`if __name__ == "__main__":`  
    `import uvicorn`  
    `uvicorn.run(app, host="0.0.0.0", port=8000)`

This eliminates the need for separate Node.js and Python services but requires Python for the entire backend.

## 

## Recommendations

1. **Start with Pure Python (FastAPI)** \- Simpler deployment, fewer moving parts, direct model access  
2. **Use Node.js only if** you need specific npm packages or have existing Node.js expertise  
3. **Deploy on**:

   - Supabase for managed PostgreSQL \+ Auth

   

4. **Model Optimization**:  
     
   - Use ONNX Runtime for faster inference  
   - Consider quantized models  
   - Cache embeddings for common goals

   

5. **Security**:  
     
   - API keys should be hashed in database  
   - Use HTTPS only  
   - Implement request signing for high-security use cases