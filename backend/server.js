require("dotenv").config();
process.env.TZ = "America/Bogota";

const app = require("./src/app");

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log({
    iso: new Date().toISOString(),
    local: new Date().toString(),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
});
