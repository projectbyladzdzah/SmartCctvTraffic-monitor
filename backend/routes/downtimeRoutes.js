const db = require('../database');
const { exportDowntimeToExcel } = require('../services/excelExportService');
const { requireAuth, requireAdmin } = require('../middleware/auth');

function mountDowntimeRoutes(app) {
  /**
   * GET /api/downtime-records
   * Get all downtime records
   */
  app.get('/api/downtime-records', requireAuth, requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 1000, 1), 10000);
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

      const [rows] = await db.getPool().query(
        `SELECT * FROM cctv_downtime_records 
         ORDER BY downtime_start DESC 
         LIMIT ? OFFSET ?`,
        [limit, offset],
      );

      const [[{ total }]] = await db.getPool().query(
        'SELECT COUNT(*) as total FROM cctv_downtime_records',
      );

      res.json({
        data: rows,
        pagination: {
          limit,
          offset,
          total: parseInt(total, 10),
        },
      });
    } catch (error) {
      console.error('❌ Error getting downtime records:', error.message);
      res.status(500).json({ error: 'Gagal mengambil riwayat downtime' });
    }
  });

  /**
   * GET /api/downtime-records/cctv/:cctvId
   * Get downtime records for specific CCTV
   */
  app.get('/api/downtime-records/cctv/:cctvId', requireAuth, async (req, res) => {
    try {
      const { cctvId } = req.params;
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 1000);
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

      const [rows] = await db.getPool().query(
        `SELECT * FROM cctv_downtime_records 
         WHERE cctv_id = ? 
         ORDER BY downtime_start DESC 
         LIMIT ? OFFSET ?`,
        [cctvId, limit, offset],
      );

      const [[{ total }]] = await db.getPool().query(
        'SELECT COUNT(*) as total FROM cctv_downtime_records WHERE cctv_id = ?',
        [cctvId],
      );

      res.json({
        data: rows,
        pagination: {
          limit,
          offset,
          total: parseInt(total, 10),
        },
      });
    } catch (error) {
      console.error('❌ Error getting CCTV downtime records:', error.message);
      res.status(500).json({ error: 'Gagal mengambil riwayat downtime CCTV' });
    }
  });

  /**
   * GET /api/downtime-records/export
   * Export downtime records to Excel
   */
  app.get('/api/downtime-records/export', requireAuth, requireAdmin, async (req, res) => {
    try {
      const startDate = req.query.start_date ? new Date(req.query.start_date) : null;
      const endDate = req.query.end_date ? new Date(req.query.end_date) : null;

      let query = 'SELECT * FROM cctv_downtime_records WHERE 1=1';
      const params = [];

      if (startDate) {
        query += ' AND downtime_start >= ?';
        params.push(startDate);
      }

      if (endDate) {
        query += ' AND downtime_start <= ?';
        params.push(endDate);
      }

      query += ' ORDER BY downtime_start DESC';

      const [rows] = await db.getPool().query(query, params);

      const buffer = await exportDowntimeToExcel(rows);

      const filename = `downtime_report_${new Date().toISOString().slice(0, 10)}.xlsx`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buffer);
    } catch (error) {
      console.error('❌ Error exporting downtime records:', error.message);
      res.status(500).json({ error: 'Gagal export ke Excel' });
    }
  });

  /**
   * DELETE /api/downtime-records/:id
   * Delete a downtime record
   */
  app.delete('/api/downtime-records/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const [result] = await db.getPool().query(
        'DELETE FROM cctv_downtime_records WHERE id = ?',
        [id],
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Record tidak ditemukan' });
      }

      res.json({ message: 'Record downtime berhasil dihapus' });
    } catch (error) {
      console.error('❌ Error deleting downtime record:', error.message);
      res.status(500).json({ error: 'Gagal menghapus record' });
    }
  });

  /**
   * DELETE /api/downtime-records
   * Delete downtime records by date range
   */
  app.delete('/api/downtime-records', requireAuth, requireAdmin, async (req, res) => {
    try {
      const startDate = req.query.start_date ? new Date(req.query.start_date) : null;
      const endDate = req.query.end_date ? new Date(req.query.end_date) : null;

      let query = 'DELETE FROM cctv_downtime_records WHERE 1=1';
      const params = [];

      if (startDate) {
        query += ' AND downtime_start >= ?';
        params.push(startDate);
      }

      if (endDate) {
        query += ' AND downtime_start <= ?';
        params.push(endDate);
      }

      const [result] = await db.getPool().query(query, params);

      res.json({
        message: `${result.affectedRows} record downtime berhasil dihapus`,
        deletedRows: result.affectedRows,
      });
    } catch (error) {
      console.error('❌ Error deleting downtime records:', error.message);
      res.status(500).json({ error: 'Gagal menghapus records' });
    }
  });

  /**
   * GET /api/downtime-stats
   * Get statistics of downtime
   */
  app.get('/api/downtime-stats', requireAuth, requireAdmin, async (req, res) => {
    try {
      const startDate = req.query.start_date ? new Date(req.query.start_date) : null;
      const endDate = req.query.end_date ? new Date(req.query.end_date) : null;

      let query = `
        SELECT 
          cctv_id,
          cctv_name,
          COUNT(*) as downtime_count,
          SUM(duration_minutes) as total_downtime_minutes,
          AVG(duration_minutes) as avg_downtime_minutes,
          MIN(downtime_start) as first_downtime,
          MAX(downtime_end) as last_downtime
        FROM cctv_downtime_records 
        WHERE 1=1
      `;
      const params = [];

      if (startDate) {
        query += ' AND downtime_start >= ?';
        params.push(startDate);
      }

      if (endDate) {
        query += ' AND downtime_start <= ?';
        params.push(endDate);
      }

      query += ' GROUP BY cctv_id, cctv_name ORDER BY total_downtime_minutes DESC';

      const [rows] = await db.getPool().query(query, params);

      res.json({
        stats: rows.map((row) => ({
          cctv_id: row.cctv_id,
          cctv_name: row.cctv_name,
          downtime_count: parseInt(row.downtime_count, 10),
          total_downtime_hours: (parseInt(row.total_downtime_minutes, 10) / 60).toFixed(2),
          avg_downtime_minutes: row.avg_downtime_minutes ? Math.round(row.avg_downtime_minutes) : 0,
          first_downtime: row.first_downtime,
          last_downtime: row.last_downtime,
        })),
      });
    } catch (error) {
      console.error('❌ Error getting downtime stats:', error.message);
      res.status(500).json({ error: 'Gagal mendapatkan statistik downtime' });
    }
  });
}

module.exports = { mountDowntimeRoutes };
