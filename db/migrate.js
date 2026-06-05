require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function runMigrations() {
  const sqlPath = path.join(__dirname, 'migrations', '001_init.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
  console.log('Migración completada exitosamente.');
}

async function migrate() {
  try {
    await runMigrations();
  } catch (err) {
    console.error('Error en migración:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  migrate();
}

module.exports = { runMigrations };
