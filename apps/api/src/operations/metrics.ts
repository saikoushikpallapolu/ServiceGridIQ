import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

export function createMetrics(token?: string, database?: () => Promise<{ bytes: string; connections: number; max: number }>) {
  const buckets = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 15, 60];
  const counts = buckets.map(() => 0); let count = 0; let sum = 0; let errors = 0; let rejected = 0; let active = 0;
  const observe: RequestHandler = (_req, res, next) => { const start = performance.now(); active++; res.once('finish', () => { const seconds = (performance.now() - start) / 1000; active--; count++; sum += seconds; if (res.statusCode >= 500) errors++; if (res.statusCode === 429) rejected++; buckets.forEach((upper, i) => { if (seconds <= upper) counts[i]!++; }); }); next(); };
  const endpoint: RequestHandler = async (req, res) => {
    const supplied = Buffer.from(req.get('Authorization') ?? ''); const expected = Buffer.from(`Bearer ${token ?? ''}`);
    if (!token || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { res.sendStatus(404); return; }
    let capacity: string[] = [];
    if (database) { try { const current = await database(); capacity = [`servicegrid_database_bytes ${current.bytes}`, `servicegrid_database_connections ${current.connections}`, `servicegrid_database_max_connections ${current.max}`]; } catch { res.sendStatus(503); return; } }
    res.set('Cache-Control', 'no-store').type('text/plain').send([
      '# TYPE servicegrid_http_requests_total counter', `servicegrid_http_requests_total ${count}`,
      '# TYPE servicegrid_http_errors_total counter', `servicegrid_http_errors_total ${errors}`,
      '# TYPE servicegrid_http_rate_limited_total counter', `servicegrid_http_rate_limited_total ${rejected}`,
      '# TYPE servicegrid_http_inflight gauge', `servicegrid_http_inflight ${active}`,
      '# TYPE servicegrid_http_duration_seconds histogram', ...buckets.map((upper, i) => `servicegrid_http_duration_seconds_bucket{le="${upper}"} ${counts[i]}`), `servicegrid_http_duration_seconds_bucket{le="+Inf"} ${count}`, `servicegrid_http_duration_seconds_sum ${sum}`, `servicegrid_http_duration_seconds_count ${count}`,
      '# TYPE servicegrid_process_rss_bytes gauge', `servicegrid_process_rss_bytes ${process.memoryUsage().rss}`, ...capacity, '',
    ].join('\n'));
  };
  return { observe, endpoint };
}
