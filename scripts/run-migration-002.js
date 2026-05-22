// Run provider migration via pg
require('../backend/node_modules/dotenv').config({ path: require('path').join(__dirname, '..', 'backend', '.env') });
const fs = require('fs');
const path = require('path');
const pool = require('../backend/src/config/db');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'migrations', '002_provider_conciliations.sql'), 'utf-8');
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('✅ Migración 002 aplicada correctamente');
  } catch (e) {
    console.log('Error:', e.message);
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
})();
