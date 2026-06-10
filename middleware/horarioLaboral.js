function horarioLaboral(req, res, next) {
  if (process.env.SKIP_HORARIO === 'true') return next();

  const now = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Lima' })
  );
  const day = now.getDay(); // 0=Dom, 1=Lun, ..., 5=Vie, 6=Sab
  const hour = now.getHours();
  const minute = now.getMinutes();
  const totalMinutes = hour * 60 + minute;

  const esLaborable = day >= 1 && day <= 5;
  const dentroDeHorario = totalMinutes >= 8 * 60 && totalMinutes < 17 * 60 + 30;

  if (esLaborable && dentroDeHorario) return next();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const mensaje =
    'El servicio de soporte está disponible de lunes a viernes de 08:00 a 17:30 (hora Lima). ' +
    'Fuera de este horario podés comunicarte por:\n' +
    '- Email: soporte@inei.gob.pe\n' +
    '- Teléfono: (01) 743 4949 / Anexo 9391';

  res.write(`data: ${JSON.stringify({ delta: mensaje })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}

module.exports = horarioLaboral;
