const express = require('express');
const cors = require('cors');
const pool = require('./config/db');

const app = express();

app.use(cors());
app.use(express.json());



//------------Rutas-------------

const studentRoutes = require('./modules/students/students.routes');
const systemRoutes = require('./modules/system/system.routes');
const bonosRoutes = require('./modules/bonos/bonos.routes');
const authRoutes = require('./modules/auth/auth.routes');
const analyticsRoutes = require('./modules/analytics/analytics.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const providerRoutes = require('./modules/provider/provider.routes');

app.use('/api/students', studentRoutes);
app.use('/api/time', systemRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/bonos', bonosRoutes);
app.use('/api/bonos/analytics', analyticsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin/bonos', adminRoutes);
app.use('/api/admin/provider', providerRoutes);



pool.connect()
  .then(async () => {
    console.log('✅ Conectado a PostgreSQL');

    const { ensureDefaultAdmin } = require('./modules/auth/auth.service');
    await ensureDefaultAdmin();

    const { start: startScheduler } = require('./modules/system/scheduler');
    startScheduler();
  })
  .catch(err => console.error('❌ Error de conexión', err));


module.exports = app;
