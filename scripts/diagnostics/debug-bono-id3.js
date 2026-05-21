require('../../backend/node_modules/dotenv').config({ path: require('path').join(__dirname, '../..', 'backend', '.env') });
process.env.TZ = 'America/Bogota';
const pool = require('../../backend/src/config/db');

async function main() {
  console.log('─── TODOS los bonos_diarios almuerzo ───');
  const all = await pool.query(`SELECT id, config_bono_id, fecha, cantidad_base, cantidad_no_utilizada, cantidad_liberada, updated_at FROM bonos_diarios WHERE config_bono_id = 1 ORDER BY id`);
  for (const row of all.rows) console.log(`  id=${row.id} fecha=${row.fecha} base=${row.cantidad_base} noUtil=${row.cantidad_no_utilizada} lib=${row.cantidad_liberada} updated=${row.updated_at}`);

  console.log('\n─── Todas las redenciones vinculadas ───');
  const reds = await pool.query(`SELECT r.id, r.bono_diario_id, r.estado FROM redenciones r JOIN bonos_diarios bd ON bd.id = r.bono_diario_id WHERE bd.config_bono_id = 1 ORDER BY r.id`);
  for (const row of reds.rows) console.log(`  redencion_id=${row.id} bd_id=${row.bono_diario_id} estado=${row.estado}`);

  // Reproducir EXACTAMENTE el query de cerrarOperacionDiariaInterna
  console.log('\n─── Reproducción dentro de TX (query corregido) ───');
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");

    const r = await client.query(`
      SELECT bd.id AS bd_id, bd.fecha, bd.cantidad_base, bd.cantidad_extra,
             bd.cantidad_liberada, bd.cantidad_no_utilizada, cb.tipo
      FROM bonos_diarios bd
      JOIN config_bonos cb ON cb.id = bd.config_bono_id
      WHERE cb.tipo = 'almuerzo' AND bd.fecha = CURRENT_DATE
    `);
    console.log(`  TX: Filas encontradas: ${r.rows.length}`);
    for (const row of r.rows) {
      console.log(`  → bd_id=${row.bd_id} fecha=${row.fecha} tipo=${row.tipo} base=${row.cantidad_base} noUtil=${row.cantidad_no_utilizada}`);
      const cnt = await client.query(`SELECT COUNT(*)::int AS total FROM redenciones WHERE bono_diario_id = $1`, [row.bd_id]);
      console.log(`  → COUNT redenciones: ${cnt.rows[0].total}`);
    }
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }

  // Y fuera de TX
  console.log('\n─── Fuera de TX (via pool) ───');
  const r2 = await pool.query(`
    SELECT bd.id AS bd_id, bd.fecha, bd.cantidad_no_utilizada, cb.tipo
    FROM bonos_diarios bd
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
    WHERE cb.tipo = 'almuerzo' AND bd.fecha = CURRENT_DATE
  `);
  for (const row of r2.rows) {
    console.log(`  → bd_id=${row.bd_id} fecha=${row.fecha} tipo=${row.tipo} noUtil=${row.cantidad_no_utilizada}`);
    const cnt = await pool.query(`SELECT COUNT(*)::int AS total FROM redenciones WHERE bono_diario_id = $1`, [row.bd_id]);
    console.log(`  → COUNT redenciones: ${cnt.rows[0].total}`);
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
