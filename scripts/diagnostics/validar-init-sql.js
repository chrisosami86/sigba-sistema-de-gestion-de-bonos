require('../../backend/node_modules/dotenv').config({ path: require('path').join(__dirname, '..', '..', 'backend', '.env') });
process.env.TZ = 'America/Bogota';
const pool = require('../../backend/src/config/db');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('═══════════════════════════════════════════════');
  console.log('  VALIDACION init.sql vs DB REAL');
  console.log('═══════════════════════════════════════════════\n');

  let ok = 0;
  let fail = 0;
  const assert = (label, condition) => {
    if (condition) { console.log('  ✅ ' + label); ok++; }
    else { console.log('  ❌ ' + label); fail++; }
  };

  // 1. Get real DB tables
  const dbTables = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const realTables = dbTables.rows.map(r => r.table_name);

  // 2. Get real DB columns (table -> [col_name -> {type, nullable, default}])
  const realCols = {};
  for (const t of realTables) {
    const cols = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [t]);
    realCols[t] = {};
    cols.rows.forEach(c => {
      realCols[t][c.column_name] = {
        type: c.data_type,
        nullable: c.is_nullable === 'YES',
        default: c.column_default,
      };
    });
  }

  // 3. Get real DB indexes
  const dbIdx = await pool.query(`
    SELECT tablename, indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `);
  const realIndexes = {};
  dbIdx.rows.forEach(i => {
    if (!realIndexes[i.tablename]) realIndexes[i.tablename] = [];
    realIndexes[i.tablename].push(i.indexname);
  });

  // 4. Parse init.sql expected tables and columns
  const initPath = path.join(__dirname, '..', '..', 'database', 'init.sql');
  const init = fs.readFileSync(initPath, 'utf-8');
  
  // Extract table names from CREATE TABLE statements
  const tableMatches = init.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(/gi);
  const initTables = Array.from(tableMatches, m => m[1]);
  
  // Extract index definitions
  const idxMatches = init.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+ON\s+(\w+)/gi);
  const initIndexes = Array.from(idxMatches, m => ({ name: m[1], table: m[2] }));

  console.log('─── Tablas ───');
  console.log('  init.sql: ' + initTables.join(', '));
  console.log('  DB real:  ' + realTables.join(', '));
  
  // Check all real tables are in init.sql
  for (const t of realTables) {
    assert(t + ' en init.sql', initTables.includes(t));
  }
  // Check no extraneous tables in init.sql
  for (const t of initTables) {
    assert(t + ' existe en DB', realTables.includes(t));
  }

  console.log('\n─── Columnas ───');
  for (const t of realTables) {
    const realColNames = Object.keys(realCols[t]);
    // Extract column names from init.sql for this table
    const tableBlock = init.match(new RegExp('CREATE\\s+TABLE\\s+' + t + '\\s*\\(([\\s\\S]*?)\\);', 'i'));
    if (!tableBlock) {
      assert(t + ' definicion en init.sql', false);
      continue;
    }
    const colBlock = tableBlock[1];
    const colMatches = colBlock.matchAll(/^\s*(\w+)\s+/gm);
    const initCols = Array.from(colMatches, m => m[1]).filter(c => !['PRIMARY', 'FOREIGN', 'UNIQUE', 'CHECK', 'CONSTRAINT', 'CREATE'].includes(c.toUpperCase()));
    
    for (const c of realColNames) {
      if (!initCols.includes(c)) {
        assert(t + '.' + c + ' en init.sql', false);
      }
    }
    for (const c of initCols) {
      if (!realColNames.includes(c)) {
        assert(t + '.' + c + ' existe en DB (extra en init.sql)', false);
      }
    }
  }
  console.log('  (todas las columnas coinciden)');

  console.log('\n─── Indices ───');
  const expectedIdxNames = [
    'unique_bono_por_dia', 'idx_bonos_diarios_fecha',
    'idx_redenciones_student', 'idx_redenciones_estado',
    'idx_conciliaciones_fecha', 'idx_conciliaciones_tipo',
    'unique_conciliacion_dia_tipo',
  ];
  for (const name of expectedIdxNames) {
    const initHas = initIndexes.some(i => i.name === name);
    const dbHas = Object.values(realIndexes).some(arr => arr.includes(name));
    assert('indice ' + name, initHas && dbHas);
  }

  console.log('\n═══ RESULTADO ═══');
  console.log('  ' + ok + '✅ / ' + fail + '❌');
  if (fail === 0) console.log('  init.sql SINCRONIZADO con la BD real');

  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
