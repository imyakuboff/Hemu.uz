// Server monitoringi: CPU, xotira, so'rovlar soni, javob vaqti va oxirgi xatolar
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const MINUTES = 60;          // so'rovlar statistikasi: oxirgi 60 daqiqa
const CPU_SAMPLES = 120;     // CPU: har 5 soniyada, oxirgi 10 daqiqa
const buckets = [];          // { t, count, err4, err5, ms }
const cpu = [];              // { t, sys, proc, mem }
const errors = [];           // oxirgi 50 ta server xatosi
const started = Date.now();
let totals = { count: 0, err4: 0, err5: 0 };

function bucket() {
  const t = Math.floor(Date.now() / 60000) * 60000;
  let b = buckets[buckets.length - 1];
  if (!b || b.t !== t) {
    b = { t, count: 0, err4: 0, err5: 0, ms: 0 };
    buckets.push(b);
    if (buckets.length > MINUTES) buckets.shift();
  }
  return b;
}

// Express middleware: faqat API so'rovlari hisoblanadi
function middleware(req, res, next) {
  const t0 = process.hrtime.bigint();
  res.on('finish', () => {
    if (req.path === '/stream') return;
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const b = bucket();
    b.count++; b.ms += ms; totals.count++;
    if (res.statusCode >= 500) { b.err5++; totals.err5++; } else if (res.statusCode >= 400) { b.err4++; totals.err4++; }
  });
  next();
}

function recordError(req, err) {
  errors.unshift({ time: new Date().toISOString(), method: req.method, path: req.originalUrl?.slice(0, 200), message: String(err?.message || err).slice(0, 500), stack: String(err?.stack || '').split('\n').slice(0, 4).join('\n') });
  if (errors.length > 50) errors.pop();
}

// CPU foizini o'lchash (tizim va jarayon)
let prevSys = os.cpus().map((c) => c.times);
let prevProc = process.cpuUsage();
let prevAt = process.hrtime.bigint();
function sampleCpu() {
  const now = os.cpus().map((c) => c.times);
  let idle = 0; let total = 0;
  now.forEach((c, i) => {
    const p = prevSys[i] || c;
    const d = { user: c.user - p.user, nice: c.nice - p.nice, sys: c.sys - p.sys, idle: c.idle - p.idle, irq: c.irq - p.irq };
    idle += d.idle;
    total += d.user + d.nice + d.sys + d.idle + d.irq;
  });
  const at = process.hrtime.bigint();
  const proc = process.cpuUsage(prevProc);
  const elapsedUs = Number(at - prevAt) / 1000;
  const sysPct = total ? Math.round((1 - idle / total) * 1000) / 10 : 0;
  const procPct = elapsedUs ? Math.round(((proc.user + proc.system) / elapsedUs / os.cpus().length) * 1000) / 10 : 0;
  prevSys = now; prevProc = process.cpuUsage(); prevAt = at;
  cpu.push({ t: Date.now(), sys: sysPct, proc: procPct, mem: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 1000) / 10 });
  if (cpu.length > CPU_SAMPLES) cpu.shift();
}
let timer = null;
function start() {
  if (timer) return;
  sampleCpu();
  timer = setInterval(sampleCpu, 5000);
  timer.unref();
}

function fileSize(f) {
  try { return fs.statSync(f).size; } catch { return 0; }
}
function dirSize(dir, depth = 0) {
  let n = 0; let files = 0;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory() && depth < 3) { const s = dirSize(p, depth + 1); n += s.bytes; files += s.files; } else if (e.isFile()) { n += fileSize(p); files++; }
    }
  } catch { /* papka yo'q */ }
  return { bytes: n, files };
}

function snapshot({ dbFile, uploadDir }) {
  const mem = process.memoryUsage();
  const last = buckets.slice(-5);
  const reqs = last.reduce((a, b) => a + b.count, 0);
  const ms = last.reduce((a, b) => a + b.ms, 0);
  // Bo'sh daqiqalarni 0 bilan to'ldiramiz (grafik uchun)
  const now = Math.floor(Date.now() / 60000) * 60000;
  const byT = new Map(buckets.map((b) => [b.t, b]));
  const series = [];
  for (let i = 29; i >= 0; i--) {
    const t = now - i * 60000;
    const b = byT.get(t);
    series.push({ t, count: b?.count || 0, err: (b?.err5 || 0), avg_ms: b?.count ? Math.round((b.ms / b.count) * 10) / 10 : 0 });
  }
  let disk = null;
  try {
    const s = fs.statfsSync(path.dirname(dbFile));
    disk = { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
  } catch { /* eski Node */ }
  return {
    time: new Date().toISOString(),
    host: { hostname: os.hostname(), platform: `${os.type()} ${os.release()} (${os.arch()})`, cpus: os.cpus().length, cpu_model: os.cpus()[0]?.model?.trim(), loadavg: os.loadavg(), uptime_sec: Math.round(os.uptime()) },
    process: { pid: process.pid, node: process.version, uptime_sec: Math.round((Date.now() - started) / 1000), rss: mem.rss, heap_used: mem.heapUsed, heap_total: mem.heapTotal },
    memory: { total: os.totalmem(), free: os.freemem() },
    cpu: { now: cpu[cpu.length - 1] || null, series: cpu.slice(-60) },
    disk,
    storage: { db: fileSize(dbFile), wal: fileSize(`${dbFile}-wal`), uploads: dirSize(uploadDir) },
    requests: { per_min_5: Math.round((reqs / Math.max(1, last.length)) * 10) / 10, avg_ms_5: reqs ? Math.round((ms / reqs) * 10) / 10 : 0, totals, series },
    errors: errors.slice(0, 20),
  };
}

module.exports = { middleware, recordError, start, snapshot };
