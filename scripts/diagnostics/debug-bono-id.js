// SIGBA — DEBUG: ¿Por qué totalRedenciones = 0 dentro de cerrarOperacionDiariaInterna?
require('../../backend/node_modules/dotenv').config({ path: require('path').join(__dirname, '../..', 'backend', '.env') });
process.env.TZ = 'America/Bogota';

const pool = require('../../backend/src/config/db');

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  DEBUG: Diagnóstico de bono_diario_id');
  console.log('═══════════════════════════════════════════════\n');

  // ──── 1. Encontrar bonos_diarios para almuerzo ────
  console.log('─── Query 1: bonos_diarios para almuerzo HOY ───');
  const r1 = await pool.query(`
    SELECT bd.id, bd.config_bono_id, bd.fecha, cb.tipo
    FROM bonos_diarios bd
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
    WHERE cb.tipo = 'almuerzo' AND bd.fecha = CURRENT_DATE
  `);
  console.log('  Filas encontradas:', r1.rows.length);
  for (const row of r1.rows) {
    console.log(`  → id=${row.id} config_bono_id=${row.config_bono_id} tipo=${row.tipo} fecha=${row.fecha}`);
  }

  // ──── 2. Contar redenciones para CADA bono_diario_id de hoy ────
  console.log('\n─── Query 2: Todas las redenciones de bonos_diarios HOY ───');
  const r2 = await pool.query(`
    SELECT bd.id AS bd_id, cb.tipo, r.estado, COUNT(*)::int AS total
    FROM bonos_diarios bd
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
    LEFT JOIN redenciones r ON r.bono_diario_id = bd.id
    WHERE bd.fecha = CURRENT_DATE
    GROUP BY bd.id, cb.tipo, r.estado
    ORDER BY bd.id, r.estado
  `);
  console.log('  Filas:', r2.rows.length);
  for (const row of r2.rows) {
    console.log(`  → bd_id=${row.bd_id} tipo=${row.tipo} estado=${row.estado || '(sin redenciones)'} total=${row.total}`);
  }

  // ──── 3. COUNT desde perspectiva de cada bono_diario_id ────
  console.log('\n─── Query 3: COUNT por bono_diario_id ───');
  const r3 = await pool.query(`
    SELECT bd.id, COUNT(r.id)::int AS total
    FROM bonos_diarios bd
    LEFT JOIN redenciones r ON r.bono_diario_id = bd.id
    WHERE bd.fecha = CURRENT_DATE
    GROUP BY bd.id
    ORDER BY bd.id
  `);
  for (const row of r3.rows) {
    console.log(`  → bd_id=${row.id} total_redenciones=${row.total}`);
  }

  // ──── 4. IDs de todas las redenciones de hoy ────
  console.log('\n─── Query 4: IDs de redenciones de hoy ───');
  const r4 = await pool.query(`
    SELECT r.id, r.bono_diario_id, r.estado, bd.fecha, cb.tipo
    FROM redenciones r
    JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
    WHERE bd.fecha = CURRENT_DATE
    ORDER BY r.id
  `);
  console.log('  Total redenciones hoy:', r4.rows.length);
  for (const row of r4.rows) {
    console.log(`  → redencion_id=${row.id} bd_id=${row.bono_diario_id} estado=${row.estado} tipo=${row.tipo}`);
  }

  // ──── 5. Simular EXACTAMENTE lo que hace cerrarOperacionDiariaInterna ────
  console.log('\n─── Query 5: Reproducción exacta de cerrarOperacionDiariaInterna ───');
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");

    const bonoQuery = await client.query(`
      SELECT * FROM bonos_diarios bd
      JOIN config_bonos cb ON cb.id = bd.config_bono_id
      WHERE cb.tipo = 'almuerzo' AND bd.fecha = CURRENT_DATE
    `);
    console.log('  bonos_diarios encontrados:', bonoQuery.rows.length);
    for (const row of bonoQuery.rows) {
      console.log(`  → bd_id=${row.id} tipo=${row.tipo} base=${row.cantidad_base} noUtil=${row.cantidad_no_utilizada}`);

      const countQuery = await client.query(`
        SELECT COUNT(*)::int AS total_reservados
        FROM redenciones
        WHERE bono_diario_id = $1
      `, [row.id]);
      console.log(`  → COUNT redenciones para bd_id=${row.id}: ${countQuery.rows[0].total_reservados}`);
    }

    await client.query("ROLLBACK");
  } finally {
    client.release();
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log('  Debug completo.');
  console.log('═══════════════════════════════════════════════');
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
