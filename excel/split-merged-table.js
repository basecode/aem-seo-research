// Function to sanitize worksheet names
function sanitizeWorksheetName(name: string): string {
  // Remove invalid characters
  const sanitized = name.replace(/[:\\/\\?\\*\\[\\]]/g, "");

  // Truncate to 31 characters
  return sanitized.substring(0, 31);
}

async function main(workbook: ExcelScript.Workbook) {
  // Get the worksheet with the merged data
  const mergedSheet = workbook.getWorksheet("metrics-events");

  // Get the table in the worksheet
  const table = mergedSheet.getTables()[0]; // Assumes there's only one table in the sheet

  // Get the data in the table
  const range = table.getRangeBetweenHeaderAndTotal();
  const values = range.getValues();

  // Create an object to hold the rows for each siteId
  const rowsBySiteId: { [key: string]: (string | boolean | number)[][] } = {};

  // Loop through each row in the table
  for (let i = 0; i < values.length; i++) {
    // Get the siteId for the row
    const siteId: string = values[i][0] as string; // Assumes siteId is in the first column

    // Add the row to the list for this siteId
    if (!rowsBySiteId[siteId]) {
      rowsBySiteId[siteId] = [];
    }
    rowsBySiteId[siteId].push(values[i]);
  }

  // Get the number of columns in the table
  const columnCount = table.getRange().getColumnCount();

  // Loop through each siteId and create a new worksheet
  for (const siteId in rowsBySiteId) {
    // Sanitize the siteId to use it as a worksheet name
    const sanitizedSiteId = sanitizeWorksheetName(siteId);

    // Check if the worksheet already exists
    let newSheet = workbook.getWorksheet(sanitizedSiteId);
    if (newSheet) {
      // If the worksheet exists, clear it
      newSheet.getUsedRange()?.clear();

      // Delete any existing tables in the worksheet
      newSheet.getTables().forEach(table => table.delete());
    } else {
      // If the worksheet does not exist, create it
      newSheet = workbook.addWorksheet(sanitizedSiteId);
    }

    // Add a new table with the rows for this siteId
    const newTable: ExcelScript.Table = newSheet.addTable(newSheet.getRange(`A1:${String.fromCharCode(64 + columnCount)}${rowsBySiteId[siteId].length + 1}`), true);

    // Set the values for the new table
    newTable.getRange().setValues([table.getHeaderRowRange().getValues()[0]].concat(rowsBySiteId[siteId]));
  }
}
