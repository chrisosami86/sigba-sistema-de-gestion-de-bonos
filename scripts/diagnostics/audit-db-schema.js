require('../../backend/node_modules/dotenv').config({ path: require('path').join(__dirname, '..', '..', 'backend', '.env') });
process.env.TZ = 'America/Bogota';
const pool = require('../../backend/src/config/db');

(async () => {
  // 1. List all tables
  const tables = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  console.log('=== TABLES ===');
  tables.rows.forEach(r => console.log('  ' + r.table_name));

  // 2. All columns per table
  console.log('\n=== COLUMNS PER TABLE ===');
  for (const t of tables.rows) {
    const cols = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [t.table_name]);
    console.log('  [' + t.table_name + ']');
    cols.rows.forEach(c => console.log('    ' + c.column_name + ' :: ' + c.data_type + (c.is_nullable === 'NO' ? ' NOT NULL' : '') + (c.column_default ? ' DEFAULT ' + c.column_default : '')));
  }

  // 3. All constraints
  console.log('\n=== CONSTRAINTS ===');
  const cons = await pool.query(`
    SELECT tc.table_name, tc.constraint_name, tc.constraint_type,
           kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
    ORDER BY tc.table_name, tc.constraint_type
  `);
  cons.rows.forEach(c => console.log('  ' + c.table_name + '.' + c.column_name + ' : ' + c.constraint_type + ' [' + c.constraint_name + ']'));

  // 4. All indexes
  console.log('\n=== INDEXES ===');
  const idx = await pool.query(`
    SELECT tablename, indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `);
  idx.rows.forEach(i => console.log('  ' + i.tablename + ': ' + i.indexname));

  await pool.end();
  console.log('\nDone.');
})().catch(e => { console.error(e); process.exit(1); });
