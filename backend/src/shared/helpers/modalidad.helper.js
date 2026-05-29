const getModalidadExpression = () => {
  return `
    CASE
      WHEN r.modalidad_operacional IS NOT NULL THEN
        CASE
          WHEN r.modalidad_operacional = 'administrativo' THEN 'venta_libre'
          ELSE r.modalidad_operacional
        END
      ELSE
        CASE
          WHEN r.tipo_asignacion = 'ADMINISTRATIVA'
            THEN 'venta_libre'
          WHEN cb.tipo = 'almuerzo'
            AND r.hora_solicitud::time BETWEEN TIME '08:00' AND TIME '10:15'
            THEN 'subsidiado'
          WHEN cb.tipo = 'almuerzo'
            AND r.hora_solicitud::time BETWEEN TIME '11:30' AND TIME '12:05'
            THEN 'venta_libre'
          WHEN cb.tipo = 'refrigerio'
            AND r.hora_solicitud::time BETWEEN TIME '17:00' AND TIME '18:29'
            THEN 'subsidiado'
          WHEN cb.tipo = 'refrigerio'
            AND r.hora_solicitud::time BETWEEN TIME '18:30' AND TIME '22:00'
            THEN 'venta_libre'
          ELSE 'desconocida'
        END
    END
  `;
};

module.exports = {
  getModalidadExpression,
};
