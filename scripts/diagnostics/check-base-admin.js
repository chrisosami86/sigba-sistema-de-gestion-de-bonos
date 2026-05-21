require('../../backend/node_modules/dotenv').config({ path: require('path').join(__dirname, '../..', 'backend', '.env') });
process.env.TZ = 'America/Bogota';
const adminService = require('../../backend/src/modules/bonos/bonos.admin-assignment.service');

(async () => {
  console.log('─── Base Administrativa post-fix ───');
  const ba = await adminService.getBaseAdministrativa();
  for (const tipo of ['almuerzo', 'refrigerio']) {
    const b = ba[tipo];
    console.log(`  ${tipo}:`);
    console.log(`    expirados:       ${b.expirados}`);
    console.log(`    noUtilizados:    ${b.noUtilizados}`);
    console.log(`    administrativos: ${b.administrativos}`);
    console.log(`    total base:      ${b.total}  (exp + noUtil)`);
    console.log(`    disponible:      ${b.disponible}  (total - admin)`);
    console.log(`    fórmula:         ${b.expirados} + ${b.noUtilizados} − ${b.administrativos} = ${b.disponible}`);
  }
  process.exit(0);
})();
