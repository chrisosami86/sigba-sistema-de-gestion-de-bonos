const { google } = require('googleapis');
const { getCurrentBogotaMinutes } = require('../../shared/helpers/timezone.helper');

let auth = null;

const getAuth = () => {
  if (auth) return auth;

  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  if (!credentialsJson) {
    throw new Error(
      'Google Sheets no configurado: falta GOOGLE_APPLICATION_CREDENTIALS_JSON'
    );
  }

  let credentials;

  try {
    credentials = JSON.parse(credentialsJson);
  } catch {
    throw new Error(
      'GOOGLE_APPLICATION_CREDENTIALS_JSON no es un JSON valido'
    );
  }

  auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return auth;
};

// ============================================================
// TEMPORAL TRANSITIONAL LOGIC
// Determina la hoja según horario operacional.
// Esto será eliminado cuando Google Sheets deje de usarse.
// ============================================================

const resolveSheetIdBySchedule = () => {
  const totalMinutes = getCurrentBogotaMinutes();

  // ------------------------------------------------------------
  // Subsidiado
  // Almuerzo: 08:00 - 10:16
  // Refrigerio: 17:00 - 18:29
  // ------------------------------------------------------------

  const isSubsidizedRange =
    (totalMinutes >= 480 && totalMinutes <= 616) ||
    (totalMinutes >= 1020 && totalMinutes <= 1109);

  return isSubsidizedRange
    ? process.env.SHEET_ID_SUBSIDIADOS
    : process.env.SHEET_ID_VENTA_LIBRE;
};

const appendRedencion = async (data) => {
  const client = getAuth();

  const sheets = google.sheets({
    version: 'v4',
    auth: client,
  });

  const sheetId = resolveSheetIdBySchedule();

  if (!sheetId) {
    throw new Error(
      'No se encontro SHEET_ID para el horario actual'
    );
  }

  const values = [[
    data.fechaHora,
    data.codigo,
    data.documento,
    data.nombre,
    data.email,
    data.programa,
    data.recibo,
    data.codBono,
  ]];

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Hoja1!A2:H',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });

    return true;
  } catch (error) {
    console.error(
      'Error al enviar a Google Sheets:',
      error.message
    );

    throw error;
  }
};

module.exports = {
  appendRedencion,
};
