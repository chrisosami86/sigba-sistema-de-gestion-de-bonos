const express = require('express');
const cors = require('cors');
const pool = require('./config/db');

const app = express();

app.use(cors());
app.use(express.json());



//------------Rutas-------------

const studentRoutes = require('./modules/students/students.routes');

app.use('/api/students', studentRoutes);



pool.connect()
  .then(() => console.log('✅ Conectado a PostgreSQL'))
  .catch(err => console.error('❌ Error de conexión', err));


module.exports = app;