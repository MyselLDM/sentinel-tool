const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'chat_history.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    goals TEXT,
    selected_goal TEXT,
    evaluation TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

module.exports = {
  getMessages(sessionId) {
    const stmt = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC');
    const rows = stmt.all(sessionId);
    return rows.map(r => ({
      id: r.id,
      role: r.role,
      content: r.content,
      goals: r.goals ? JSON.parse(r.goals) : undefined,
      selectedGoal: r.selected_goal || undefined,
      evaluation: r.evaluation ? JSON.parse(r.evaluation) : undefined
    }));
  },
  insertMessage(msg, sessionId) {
    const stmt = db.prepare(`
      INSERT INTO messages (id, session_id, role, content, goals, selected_goal, evaluation)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      msg.id,
      sessionId,
      msg.role,
      msg.content,
      msg.goals ? JSON.stringify(msg.goals) : null,
      msg.selectedGoal || null,
      msg.evaluation ? JSON.stringify(msg.evaluation) : null
    );
  },
  clearHistory(sessionId) {
    db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
  }
};
