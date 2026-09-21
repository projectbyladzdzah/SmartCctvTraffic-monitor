const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

/**
 * Export downtime records to Excel file
 * @param {Array} downtimeRecords - Array of downtime records dari database
 * @param {string} filename - Output filename (optional, default: downtime_report.xlsx)
 * @returns {Promise<Buffer>} - Excel file buffer
 */
async function exportDowntimeToExcel(downtimeRecords = [], filename = 'downtime_report.xlsx') {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Downtime Report');

    // Set column widths
    worksheet.columns = [
      { header: 'No', key: 'no', width: 5 },
      { header: 'CCTV Name', key: 'cctv_name', width: 25 },
      { header: 'CCTV IP', key: 'cctv_ip', width: 15 },
      { header: 'Downtime Start', key: 'downtime_start', width: 20 },
      { header: 'Downtime End', key: 'downtime_end', width: 20 },
      { header: 'Duration (Minutes)', key: 'duration_minutes', width: 18 },
      { header: 'Recorded At', key: 'recorded_at', width: 20 },
    ];

    // Style header
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4E78' }, // Dark blue
    };
    worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'center' };

    // Add data rows
    downtimeRecords.forEach((record, index) => {
      worksheet.addRow({
        no: index + 1,
        cctv_name: record.cctv_name || 'Unknown',
        cctv_ip: record.cctv_ip || 'Unknown',
        downtime_start: record.downtime_start ? new Date(record.downtime_start).toLocaleString() : '',
        downtime_end: record.downtime_end ? new Date(record.downtime_end).toLocaleString() : '',
        duration_minutes: record.duration_minutes || 0,
        recorded_at: record.recorded_at ? new Date(record.recorded_at).toLocaleString() : '',
      });
    });

    // Format number columns
    worksheet.getColumn('duration_minutes').numFmt = '0';

    // Add border and alternating row colors
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        if (rowNumber % 2 === 0) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF2F2F2' }, // Light gray
          };
        }
        row.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      }
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  } catch (err) {
    console.error('❌ Error saat export ke Excel:', err.message);
    throw err;
  }
}

/**
 * Export downtime records ke file physical
 */
async function exportDowntimeToFile(downtimeRecords = [], outputPath = null) {
  try {
    if (!outputPath) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      outputPath = path.join(__dirname, `../../downtime_reports/downtime_${timestamp}.xlsx`);
    }

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const buffer = await exportDowntimeToExcel(downtimeRecords);
    fs.writeFileSync(outputPath, buffer);

    console.log(`✅ Downtime report exported: ${outputPath}`);
    return outputPath;
  } catch (err) {
    console.error('❌ Error exporting to file:', err.message);
    throw err;
  }
}

module.exports = {
  exportDowntimeToExcel,
  exportDowntimeToFile,
};
