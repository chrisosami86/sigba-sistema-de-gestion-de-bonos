require('../../backend/node_modules/dotenv').config({ path: require('path').join(__dirname, '../..', 'backend', '.env') });
process.env.TZ = 'America/Bogota';
const pool = require('../../backend/src/config/db');

(async () => {
  console.log('─── Diagnóstico: corrupción de noUtilizada por admin ───\n');
  const r = await pool.query(`
    SELECT bd.id, cb.tipo, bd.cantidad_base, bd.cantidad_extra, bd.cantidad_no_utilizada,
           (SELECT COUNT(*)::int FROM redenciones WHERE bono_diario_id = bd.id) AS todas,
           (SELECT COUNT(*)::int FROM redenciones WHERE bono_diario_id = bd.id AND tipo_asignacion != 'ADMINISTRATIVA') AS sin_admin,
           (SELECT COUNT(*)::int FROM redenciones WHERE bono_diario_id = bd.id AND tipo_asignacion = 'ADMINISTRATIVA') AS solo_admin
    FROM bonos_diarios bd
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
    WHERE bd.fecha = CURRENT_DATE
    ORDER BY cb.tipo
  `);

  for (const row of r.rows) {
    const totOp = Number(row.cantidad_base) + Number(row.cantidad_extra);
    const noUtilDB = Number(row.cantidad_no_utilizada);
    const noUtilCorrecta = Math.max(0, totOp - Number(row.sin_admin));
    const noUtilIncorrecta = Math.max(0, totOp - Number(row.todas));

    console.log(`  ${row.tipo.toUpperCase()} (id=${row.id}):`);
    console.log(`    totalOperativo:           ${totOp}`);
    console.log(`    COUNT todas:              ${row.todas}  (operativas + admin)`);
    console.log(`    COUNT sin_admin:          ${row.sin_admin}  (solo operativas)`);
    console.log(`    COUNT solo_admin:         ${row.solo_admin}`);
    console.log(`    noUtilizada DB:           ${noUtilDB}`);
    console.log(`    noUtil correcta = totOp − sin_admin:   ${totOp} − ${row.sin_admin} = ${noUtilCorrecta}`);
    console.log(`    noUtil incorrecta = totOp − todas:     ${totOp} − ${row.todas} = ${noUtilIncorrecta}`);
    console.log(`    ¿Corrupta por admin?:     ${noUtilDB === noUtilIncorrecta && row.solo_admin > 0 ? 'SÍ ⚠️ (admin distorsiona el snapshot)' : 'NO ✅'}`);
    console.log(`    Debería ser:              ${noUtilCorrecta}`);
    console.log('');
  }
  await pool.end();
})();
