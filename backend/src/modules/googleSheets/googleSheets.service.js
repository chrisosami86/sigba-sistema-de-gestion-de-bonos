const { google } = require('googleapis');

let auth = null;
let sheetId = null;

const getAuth = () => {
  if (auth) return auth;

  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  sheetId = process.env.SHEET_ID;

  if (!credentialsJson || !sheetId) {
    throw new Error('Google Sheets no configurado: faltan variables de entorno (GOOGLE_APPLICATION_CREDENTIALS_JSON o SHEET_ID)');
  }

  let credentials;

  try {
    credentials = JSON.parse(credentialsJson);
  } catch {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON no es un JSON valido');
  }

  auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return auth;
};

const appendRedencion = async (data) => {
  const client = getAuth();
  const sheets = google.sheets({ version: 'v4', auth: client });

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
    console.error('Error al enviar a Google Sheets:', error.message);
    throw error;
  }
};

module.exports = {
  appendRedencion,
};
