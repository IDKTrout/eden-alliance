// Members-only data for alliance.edenafk.com: the current expedition's rows from the Expedition Log
// (expedition, guild, map, league; no player names), as CSV. The site downloads this at build time
// with a secret key, so these rows are never published to the web or saved in the public repo.
// It only reads the sheet; it never changes it.
//
// Setup (once):
//  1. Go to script.google.com, New project, name it "Eden members data", paste this file in.
//  2. Project Settings (gear) -> Script properties -> Add: MEMBERS_KEY = a long random string.
//  3. Deploy -> New deployment -> type "Web app"; Execute as: Me; Who has access: Anyone.
//     Approve the access prompt (it asks to read your spreadsheets).
//  4. The web app URL + "?key=" + MEMBERS_KEY is the MEMBERS_DATA_URL secret for Cloudflare and GitHub.
// After editing this code later: Deploy -> Manage deployments -> edit -> Version: New version.

var SHEET_ID = '1WvHbO_yMP_Rl4ji_iD6omYogrt1kDkKgy__SZRY7gJQ';

function doGet(e) {
  var key = PropertiesService.getScriptProperties().getProperty('MEMBERS_KEY');
  if (!key || !e || !e.parameter || e.parameter.key !== key) {
    return ContentService.createTextOutput('Not allowed').setMimeType(ContentService.MimeType.TEXT);
  }
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var current = String(ss.getSheetByName('Lists').getRange('I2').getDisplayValue()).trim().toUpperCase();
  var log = ss.getSheetByName('Expedition Log');
  var last = log.getLastRow();
  var values = last > 1 ? log.getRange(2, 1, last - 1, 5).getDisplayValues() : [];
  var out = [['expedition', 'guild', 'map', 'league']];
  values.forEach(function (r) {
    // Columns: A Expedition, B Player (left out), C Guild, D Map, E League
    if (String(r[0]).trim().toUpperCase() === current && String(r[2]).trim()) out.push([r[0], r[2], r[3], r[4]]);
  });
  var csv = out.map(function (r) { return r.map(csvCell).join(','); }).join('\n') + '\n';
  return ContentService.createTextOutput(csv).setMimeType(ContentService.MimeType.CSV);
}

function csvCell(v) {
  v = String(v == null ? '' : v);
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
