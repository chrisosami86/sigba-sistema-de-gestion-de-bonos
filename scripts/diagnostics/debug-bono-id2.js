require('../../backend/node_modules/dotenv').config({ path: require('path').join(__dirname, '../..', 'backend', '.env') });
process.env.TZ = 'America/Bogota';
const pool = require('../../backend/src/config/db');

async function main() {
  // ──── Ver TODOS los bonos_diarios para almuerzo ────
  console.log('─── TODOS los bonos_diarios de config_bono_id=1 (almuerzo) ───');
  const allAlmuerzo = await pool.query(`
    SELECT id, config_bono_id, fecha, cantidad_base, cantidad_no_utilizada, created_at, updated_at
    FROM bonos_diarios
    WHERE config_bono_id = 1
    ORDER BY fecha
  `);
  for (const row of allAlmuerzo.rows) {
    console.log(`  id=${row.id} fecha=${row.fecha} base=${row.cantidad_base} noUtil=${row.cantidad_no_utilizada} created=${row.created_at} updated=${row.updated_at}`);
  }

  // ──── Ver CURRENT_DATE desde pool y desde client ────
  console.log('\n─── CURRENT_DATE comparación ───');
  const poolDate = await pool.query("SELECT CURRENT_DATE AS cd, NOW() AS nw, current_setting('timezone') AS tz");
  console.log(`  pool:  CURRENT_DATE=${poolDate.rows[0].cd}  NOW=${poolDate.rows[0].nw}  TZ=${poolDate.rows[0].tz}`);

  const client = await pool.connect();
  try {
    const clientDate = await client.query("SELECT CURRENT_DATE AS cd, NOW() AS nw, current_setting('timezone') AS tz");
    console.log(`  client: CURRENT_DATE=${clientDate.rows[0].cd}  NOW=${clientDate.rows[0].nw}  TZ=${clientDate.rows[0].tz}`);

    await client.query("BEGIN");
    const txDate = await client.query("SELECT CURRENT_DATE AS cd, NOW() AS nw, current_setting('timezone') AS tz");
    console.log(`  TX:    CURRENT_DATE=${txDate.rows[0].cd}  NOW=${txDate.rows[0].nw}  TZ=${txDate.rows[0].tz}`);

    // Ahora buscar dentro de la TX
    const txQuery = await client.query(`
      SELECT id, fecha, cantidad_no_utilizada
      FROM bonos_diarios bd
      JOIN config_bonos cb ON cb.id = bd.config_bono_id
      WHERE cb.tipo = 'almuerzo' AND bd.fecha = CURRENT_DATE
    `);
    for (const row of txQuery.rows) {
      console.log(`  TX find: id=${row.id} fecha=${row.fecha} noUtil=${row.cantidad_no_utilizada}`);
    }

    await client.query("ROLLBACK");
  } finally {
    client.release();
  }

  // ──── ¿Hay duplicados? ────
  console.log('\n─── Verificando duplicados ───');
  const dupCheck = await pool.query(`
    SELECT config_bono_id, fecha, COUNT(*) AS cnt, ARRAY_AGG(id) AS ids
    FROM bonos_diarios
    GROUP BY config_bono_id, fecha
    HAVING COUNT(*) > 1
  `);
  if (dupCheck.rows.length === 0) {
    console.log('  No hay duplicados (OK).');
  } else {
    for (const row of dupCheck.rows) {
      console.log(`  DUPLICADO: config_bono_id=${row.config_bono_id} fecha=${row.fecha} count=${row.cnt} ids=[${row.ids}]`);
    }
  }

  // ──── ¿bd_id=1 tiene qué fecha? ────
  const bd1 = await pool.query(`SELECT * FROM bonos_diarios WHERE id = 1`);
  console.log('\n─── bono_diario id=1 ───');
  if (bd1.rows.length > 0) {
    const r = bd1.rows[0];
    console.log(`  id=1 config_bono_id=${r.config_bono_id} fecha=${r.fecha} base=${r.cantidad_base} noUtil=${r.cantidad_no_utilizada}`);
  } else {
    console.log('  No existe id=1');
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
