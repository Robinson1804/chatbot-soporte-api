const pool = require('./pool');

// 1. Sesiones por dia (ultimos 7 dias, incluyendo dias con 0)
async function sesionesPorDia() {
  const res = await pool.query(`
    SELECT
      to_char(d::date, 'YYYY-MM-DD') AS fecha,
      COALESCE(COUNT(s.id), 0)::int AS total
    FROM generate_series(
      (NOW() AT TIME ZONE 'America/Lima')::date - INTERVAL '6 days',
      (NOW() AT TIME ZONE 'America/Lima')::date,
      INTERVAL '1 day'
    ) d
    LEFT JOIN sessions s
      ON (s.created_at AT TIME ZONE 'America/Lima')::date = d::date
    GROUP BY d
    ORDER BY d ASC
  `);
  return res.rows;
}

// 2. Promedio mensajes por sesion (ultimos 7 dias)
async function promedioMensajesPorSesion() {
  const res = await pool.query(`
    SELECT
      COALESCE(ROUND(AVG(cnt)::numeric, 2), 0)::float AS promedio,
      COALESCE(COUNT(*), 0)::int AS sesiones_evaluadas
    FROM (
      SELECT s.id, COUNT(m.id) AS cnt
      FROM sessions s
      LEFT JOIN messages m ON m.session_id = s.id
      WHERE s.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY s.id
    ) t
  `);
  return res.rows[0];
}

// 3. Mensajes por hora del dia (ultimos 7 dias, 0-23)
async function mensajesPorHora() {
  const res = await pool.query(`
    SELECT
      h AS hora,
      COALESCE(COUNT(m.id), 0)::int AS total
    FROM generate_series(0, 23) h
    LEFT JOIN messages m
      ON EXTRACT(HOUR FROM (m.created_at AT TIME ZONE 'America/Lima')) = h
     AND m.created_at >= NOW() - INTERVAL '7 days'
    GROUP BY h
    ORDER BY h ASC
  `);
  return res.rows;
}

// 4. Documentos por tipo (total acumulado ultimos 30 dias)
async function documentosPorTipo() {
  const res = await pool.query(`
    SELECT
      COALESCE(payload->>'tipo', 'DESCONOCIDO') AS tipo,
      COUNT(*)::int AS total
    FROM events
    WHERE tipo = 'documento_generado'
      AND created_at >= NOW() - INTERVAL '30 days'
    GROUP BY payload->>'tipo'
    ORDER BY total DESC
  `);
  return res.rows;
}

// 5. Tickets SSI: creados vs fallidos (ultimos 30 dias)
async function ticketsCreadosVsFallidos() {
  const res = await pool.query(`
    SELECT
      tipo,
      COUNT(*)::int AS total
    FROM events
    WHERE tipo IN ('ticket_creado', 'error_ssi')
      AND created_at >= NOW() - INTERVAL '30 days'
    GROUP BY tipo
  `);
  const map = Object.fromEntries(res.rows.map(r => [r.tipo, r.total]));
  const creados = map.ticket_creado || 0;
  const fallidos = map.error_ssi || 0;
  const total = creados + fallidos;
  return {
    creados,
    fallidos,
    tasa_exito: total === 0 ? null : Math.round((creados / total) * 100),
  };
}

// 6. Distribucion de urgencias P1/P2/P3/P4 (ultimos 30 dias)
async function distribucionUrgencias() {
  const res = await pool.query(`
    SELECT
      COALESCE(payload->>'nivel', 'SIN_NIVEL') AS nivel,
      COUNT(*)::int AS total
    FROM events
    WHERE tipo = 'urgencia_asignada'
      AND created_at >= NOW() - INTERVAL '30 days'
    GROUP BY payload->>'nivel'
    ORDER BY nivel ASC
  `);
  const map = Object.fromEntries(res.rows.map(r => [r.nivel, r.total]));
  return ['P1', 'P2', 'P3', 'P4'].map(n => ({ nivel: n, total: map[n] || 0 }));
}

// Wrapper agregador con tolerancia a fallos parciales
async function getAllMetrics() {
  const [r1, r2, r3, r4, r5, r6] = await Promise.allSettled([
    sesionesPorDia(),
    promedioMensajesPorSesion(),
    mensajesPorHora(),
    documentosPorTipo(),
    ticketsCreadosVsFallidos(),
    distribucionUrgencias(),
  ]);
  const val = (r) => (r.status === 'fulfilled' ? r.value : null);
  return {
    volumen: {
      sesionesPorDia: val(r1),
      promedioMensajes: val(r2),
      mensajesPorHora: val(r3),
    },
    documentos: { porTipo: val(r4) },
    ticketsSSI: val(r5),
    urgencias: val(r6),
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { getAllMetrics };
