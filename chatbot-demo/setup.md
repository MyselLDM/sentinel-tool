# Chatbot Demo Setup

This repository contains an isolated demo of the Sentinel Chatbot, connecting to a locally hosted Sentinel API. It persists chat history locally using a SQLite database.

## Architecture

- **`next-client/`**: A React 19/Next.js 15 application utilizing Tailwind CSS v4 and DaisyUI.
  - Runs on `http://localhost:3001`
- **`express-server/`**: A Node.js/Express backend that proxies requests to the Sentinel API and Gemini API, and manages a local SQLite database for chat history.
  - Runs on `http://localhost:4001`

## Prerequisites

1. Ensure you have the main **Sentinel API** running locally on port `4000`.
   - Start it via `npm run dev` from the `sentinel-tool` root (or wherever your Sentinel API is located).

2. Ensure you have **Node.js** installed (v18+ recommended).

## Environment Variables

### Express Server

Navigate to `express-server/` and ensure the `.env` file exists with the following values:

```env
PORT=4001
SENTINEL_API_URL=http://localhost:4000
SENTINEL_API_KEY=sk_test_dev_playground_0000000000
GEMINI_API_KEY=your_gemini_api_key_here
CORS_ORIGIN=http://localhost:3001
```

*(Note: Replace `your_gemini_api_key_here` with your valid Gemini API Key).*

### Next Client

Navigate to `next-client/` and ensure the `.env.local` file contains:

```env
NEXT_PUBLIC_API_URL=http://localhost:4001
```

## Running the Demo

Open two separate terminal windows.

### Terminal 1: Express Server

```bash
cd chatbot-demo/express-server
npm install
npm start
```
This will start the Express server on `http://localhost:4001` and automatically initialize the `chat_history.db` SQLite database file in the `express-server/` directory.

### Terminal 2: Next.js Client

```bash
cd chatbot-demo/next-client
npm install
npm run dev
```
This will start the UI on `http://localhost:3001`.

## Local Database Management

The chat history is saved into a local SQLite database file located at `express-server/chat_history.db`.
- **To reset all history across all sessions manually**: Delete the `chat_history.db` file and restart the Express server.
- **To clear your current session's history**: Click the "RESET" button in the top right corner of the chat UI in your browser.

## Goal Catalog

The goals suggested by the chatbot are drawn from the `corpus_clean.csv` dataset. The predetermined catalog is currently statically loaded in `express-server/goals.js`. To update the catalog, modify the array inside `goals.js` and restart the Express server.
