require('dotenv').config();
process.env.TZ = 'America/Bogota';

const app = require('./src/app');

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
