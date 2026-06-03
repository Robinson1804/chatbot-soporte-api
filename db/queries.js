const pool = require('./pool');

async function createSession() {
  const res = await pool.query(
    'INSERT INTO sessions DEFAULT VALUES RETURNING id'
  );
  return res.rows[0].id;
}

async function sessionExists(sessionId) {
  const res = await pool.query(
    'SELECT id FROM sessions WHERE id = $1',
    [sessionId]
  );
  return res.rows.length > 0;
}

async function getSessionMessages(sessionId) {
  const res = await pool.query(
    `SELECT role, content FROM messages
     WHERE session_id = $1
     ORDER BY created_at ASC
     LIMIT 50`,
    [sessionId]
  );
  return res.rows;
}

async function saveMessage(sessionId, role, content) {
  await pool.query(
    'INSERT INTO messages (session_id, role, content) VALUES ($1, $2, $3)',
    [sessionId, role, content]
  );
  await pool.query(
    'UPDATE sessions SET updated_at = NOW() WHERE id = $1',
    [sessionId]
  );
}

async function saveEvent(sessionId, tipo, payload = {}) {
  await pool.query(
    'INSERT INTO events (session_id, tipo, payload) VALUES ($1, $2, $3)',
    [sessionId, tipo, JSON.stringify(payload)]
  );
}

async function cleanupOldSessions(daysOld = 90) {
  const res = await pool.query(
    `DELETE FROM sessions WHERE updated_at < NOW() - INTERVAL '${daysOld} days' RETURNING id`
  );
  return res.rowCount;
}

module.exports = { createSession, sessionExists, getSessionMessages, saveMessage, saveEvent, cleanupOldSessions };
