const providerService = require("./provider.service");
const exportService = require("./provider-export.service");
const { getBogotaDate } = require("../../shared/helpers/timezone.helper");

const getResumen = async (req, res) => {
  try {
    const { fecha } = req.query;
    const resumen = await providerService.getResumenProveedor(fecha);
    res.json(resumen);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const registrarConciliacion = async (req, res) => {
  try {
    const { fecha, tipo, cantidadProveedor, observaciones } = req.body;

    const fechaValida = fecha || getBogotaDate();

    const conciliacion = await providerService.registrarConciliacion({
      fecha: fechaValida,
      tipo,
      cantidadProveedor,
      observaciones,
      adminId: req.admin.id,
      adminNombre: req.admin.nombre,
    });

    res.status(201).json({
      message: "Conciliacion registrada correctamente",
      conciliacion,
    });
  } catch (err) {
    const statusCode = getStatusCode(err);
    res.status(statusCode).json({ message: err.message });
  }
};

const getConciliaciones = async (req, res) => {
  try {
    const result = await providerService.getConciliaciones(req.query);
    res.json(result);
  } catch (err) {
    const statusCode = getStatusCode(err);
    res.status(statusCode).json({ message: err.message });
  }
};

const getConciliacionById = async (req, res) => {
  try {
    const { id } = req.params;
    const conciliacion = await providerService.getConciliacionById(id);
    res.json(conciliacion);
  } catch (err) {
    const statusCode = getStatusCode(err);
    res.status(statusCode).json({ message: err.message });
  }
};

const exportarResumen = async (req, res) => {
  try {
    const { fecha } = req.query;
    const wb = await exportService.exportarResumenProveedor(fecha);
    const buffer = require("xlsx").write(wb, { type: "buffer", bookType: "xlsx" });

    const filename = `resumen-proveedor-sigba-${fecha || getBogotaDate()}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const exportarConciliaciones = async (_req, res) => {
  try {
    const wb = await exportService.exportarConciliaciones();
    const buffer = require("xlsx").write(wb, { type: "buffer", bookType: "xlsx" });

    const filename = `conciliaciones-proveedor-sigba-${getBogotaDate()}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getStatusCode = (err) => {
  const message = err.message || "";
  if (message.includes("invalido") || message.includes("no negativo")) return 400;
  if (message.includes("no encontrada")) return 404;
  return 500;
};

module.exports = {
  getResumen,
  registrarConciliacion,
  getConciliaciones,
  getConciliacionById,
  exportarResumen,
  exportarConciliaciones,
};
