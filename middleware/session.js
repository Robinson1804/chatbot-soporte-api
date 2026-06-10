const { createSession, sessionExists } = require('../db/queries');

const COOKIE_NAME = 'otin_session';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 días en ms

async function sessionMiddleware(req, res, next) {
  let sessionId = req.cookies?.[COOKIE_NAME];

  if (sessionId) {
    // Validar formato UUID antes de consultar la BD para evitar error 22P02
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId);
    if (!isUUID) {
      sessionId = null;
    } else {
      const exists = await sessionExists(sessionId).catch(() => false);
      if (!exists) sessionId = null;
    }
  }

  if (!sessionId) {
    sessionId = await createSession();
    res.cookie(COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: COOKIE_MAX_AGE,
    });
  }

  req.sessionId = sessionId;
  next();
}

module.exports = sessionMiddleware;
