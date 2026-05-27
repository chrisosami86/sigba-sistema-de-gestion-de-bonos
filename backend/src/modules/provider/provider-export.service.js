const XLSX = require("xlsx");
const providerService = require("./provider.service");
const { formatBogotaDateTime } = require("../../shared/helpers/timezone.helper");

const exportarResumenProveedor = async (fecha) => {
  const resumen = await providerService.getResumenProveedor(fecha);
  const wb = XLSX.utils.book_new();

  const rows = [];
  for (const tipo of ["almuerzo", "refrigerio"]) {
    const d = resumen[tipo];
    rows.push(
      { "Concepto": "Tipo", "Valor": d.tipo },
      { "Concepto": "Fecha", "Valor": d.fecha || fecha },
      { "Concepto": "Total operativo", "Valor": d.totalOperativo },
      { "Concepto": "Reclamados operacionales", "Valor": d.reclamados },
      { "Concepto": "Asignaciones administrativas", "Valor": d.administrativos },
      { "Concepto": "Total entregado SIGBA", "Valor": d.totalEntregado },
      { "Concepto": "Expirados", "Valor": d.expirados },
      { "Concepto": "No utilizados", "Valor": d.noUtilizados },
      { "Concepto": "Reutilizables", "Valor": d.reutilizables },
      { "Concepto": "Base administrativa disponible", "Valor": d.baseAdministrativa },
      { "Concepto": "Cantidad liberada", "Valor": d.cantidadLiberada },
      {},
      ...(d.ultimaConciliacion ? [
        { "Concepto": "Cantidad reportada proveedor", "Valor": d.ultimaConciliacion.cantidad_proveedor },
        { "Concepto": "Diferencia", "Valor": d.ultimaConciliacion.diferencia },
        { "Concepto": "Estado conciliacion", "Valor": d.ultimaConciliacion.estado },
        { "Concepto": "Observaciones", "Valor": d.ultimaConciliacion.observaciones || "" },
      ] : [
        { "Concepto": "Conciliacion", "Valor": "PENDIENTE" },
      ]),
      {},
    );
  }

  const ws = XLSX.utils.json_to_sheet(rows, { header: ["Concepto", "Valor"] });
  ws['!cols'] = [{ wch: 35 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, "Resumen proveedor");

  return wb;
};

const exportarConciliaciones = async () => {
  const data = await providerService.getConciliaciones({ limit: 1000 });
  const wb = XLSX.utils.book_new();

  const rows = data.rows.map((r) => ({
    "Fecha": r.fecha,
    "Tipo": r.tipo,
    "SIGBA": r.cantidadSigba,
    "Proveedor": r.cantidadProveedor,
    "Diferencia": r.diferencia,
    "Estado": r.estado,
    "Admin": r.adminNombre,
    "Observaciones": r.observaciones || "",
    "Registrado": r.createdAt ? formatBogotaDateTime(r.createdAt).replace("T", " ") : "",
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 10 },
    { wch: 10 }, { wch: 18 }, { wch: 20 }, { wch: 30 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Conciliaciones");

  return wb;
};

module.exports = { exportarResumenProveedor, exportarConciliaciones };
