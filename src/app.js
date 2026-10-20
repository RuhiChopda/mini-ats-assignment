const express = require('express');
const path = require('path');
const { openDb, STAGES } = require('./db');

function createApp(db = openDb()) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validate(body, partial = false) {
    const errors = [];
    const req = (k) => !partial || k in body;
    if (req('name') && !String(body.name || '').trim()) errors.push('name is required');
    if (req('email') && !EMAIL_RE.test(String(body.email || ''))) errors.push('valid email is required');
    if (req('position') && !String(body.position || '').trim()) errors.push('position is required');
    if ('stage' in body && !STAGES.includes(body.stage)) errors.push(`stage must be one of: ${STAGES.join(', ')}`);
    if ('rating' in body && !(Number.isInteger(+body.rating) && +body.rating >= 0 && +body.rating <= 5))
      errors.push('rating must be an integer 0-5');
    if ('experience_years' in body && !(+body.experience_years >= 0)) errors.push('experience_years must be >= 0');
    return errors;
  }

  const clean = (b) => ({
    name: b.name?.trim(),
    email: b.email?.trim().toLowerCase(),
    phone: b.phone?.trim(),
    position: b.position?.trim(),
    skills: Array.isArray(b.skills) ? b.skills.join(', ') : b.skills?.trim(),
    experience_years: b.experience_years !== undefined ? +b.experience_years : undefined,
    source: b.source?.trim(),
    stage: b.stage,
    rating: b.rating !== undefined ? +b.rating : undefined,
  });

  // ---- Meta ----
  app.get('/api/stages', (_req, res) => res.json(STAGES));

  // ---- List + search + filter + sort + pagination ----
  app.get('/api/candidates', (req, res) => {
    const { q, stage, position, source, min_exp, sort = 'created_at', order = 'desc', page = 1, limit = 100 } = req.query;
    const where = [];
    const params = {};
    if (q) {
      where.push('(name LIKE @q OR email LIKE @q OR position LIKE @q OR skills LIKE @q)');
      params.q = `%${q}%`;
    }
    if (stage) { where.push('stage = @stage'); params.stage = stage; }
    if (position) { where.push('position = @position'); params.position = position; }
    if (source) { where.push('source = @source'); params.source = source; }
    if (min_exp) { where.push('experience_years >= @min_exp'); params.min_exp = +min_exp; }
    const sortable = ['name', 'position', 'stage', 'experience_years', 'rating', 'created_at', 'updated_at'];
    const sortCol = sortable.includes(sort) ? sort : 'created_at';
    const dir = String(order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const lim = Math.min(Math.max(+limit || 100, 1), 500);
    const off = (Math.max(+page || 1, 1) - 1) * lim;
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = db.prepare(`SELECT COUNT(*) c FROM candidates ${w}`).get(params).c;
    const rows = db
      .prepare(`SELECT * FROM candidates ${w} ORDER BY ${sortCol} ${dir}, id DESC LIMIT ${lim} OFFSET ${off}`)
      .all(params);
    res.json({ total, page: +page || 1, limit: lim, data: rows });
  });

  // ---- Detail ----
  app.get('/api/candidates/:id', (req, res) => {
    const c = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id);
    if (!c) return res.status(404).json({ error: 'Candidate not found' });
    c.history = db.prepare('SELECT * FROM stage_history WHERE candidate_id = ? ORDER BY id').all(c.id);
    c.notes = db.prepare('SELECT * FROM notes WHERE candidate_id = ? ORDER BY id DESC').all(c.id);
    res.json(c);
  });

  // ---- Create ----
  app.post('/api/candidates', (req, res) => {
    const errors = validate(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join('; '), errors });
    const c = clean(req.body);
    try {
      const tx = db.transaction(() => {
        const info = db
          .prepare(
            `INSERT INTO candidates (name,email,phone,position,skills,experience_years,source,stage,rating)
             VALUES (@name,@email,@phone,@position,@skills,@experience_years,@source,@stage,@rating)`
          )
          .run({
            name: c.name, email: c.email, phone: c.phone ?? '', position: c.position, skills: c.skills ?? '',
            experience_years: c.experience_years ?? 0, source: c.source || 'Direct',
            stage: c.stage || 'Applied', rating: c.rating ?? 0,
          });
        db.prepare('INSERT INTO stage_history (candidate_id, from_stage, to_stage) VALUES (?,?,?)').run(
          info.lastInsertRowid, null, c.stage || 'Applied'
        );
        return info.lastInsertRowid;
      });
      const id = tx();
      res.status(201).json(db.prepare('SELECT * FROM candidates WHERE id = ?').get(id));
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'A candidate with this email already exists' });
      throw e;
    }
  });

  // ---- Update (fields and/or stage) ----
  app.patch('/api/candidates/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Candidate not found' });
    const errors = validate(req.body, true);
    if (errors.length) return res.status(400).json({ error: errors.join('; '), errors });
    const c = clean(req.body);
    const fields = Object.keys(c).filter((k) => c[k] !== undefined && k in req.body);
    if (!fields.length) return res.json(existing);
    try {
      db.transaction(() => {
        const set = fields.map((f) => `${f} = @${f}`).join(', ');
        db.prepare(`UPDATE candidates SET ${set}, updated_at = datetime('now') WHERE id = @id`).run({
          ...Object.fromEntries(fields.map((f) => [f, c[f]])), id: existing.id,
        });
        if (c.stage && c.stage !== existing.stage)
          db.prepare('INSERT INTO stage_history (candidate_id, from_stage, to_stage) VALUES (?,?,?)').run(existing.id, existing.stage, c.stage);
      })();
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'A candidate with this email already exists' });
      throw e;
    }
    res.json(db.prepare('SELECT * FROM candidates WHERE id = ?').get(existing.id));
  });

  // ---- Delete ----
  app.delete('/api/candidates/:id', (req, res) => {
    const info = db.prepare('DELETE FROM candidates WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Candidate not found' });
    res.status(204).end();
  });

  // ---- Notes ----
  app.post('/api/candidates/:id/notes', (req, res) => {
    const body = String(req.body.body || '').trim();
    if (!body) return res.status(400).json({ error: 'note body is required' });
    if (!db.prepare('SELECT 1 FROM candidates WHERE id = ?').get(req.params.id)) return res.status(404).json({ error: 'Candidate not found' });
    const info = db.prepare('INSERT INTO notes (candidate_id, body) VALUES (?,?)').run(req.params.id, body);
    res.status(201).json(db.prepare('SELECT * FROM notes WHERE id = ?').get(info.lastInsertRowid));
  });

  app.delete('/api/notes/:id', (req, res) => {
    const info = db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Note not found' });
    res.status(204).end();
  });

  // ---- Dashboard metrics ----
  app.get('/api/dashboard', (_req, res) => {
    const total = db.prepare('SELECT COUNT(*) c FROM candidates').get().c;
    const byStageRows = db.prepare('SELECT stage, COUNT(*) c FROM candidates GROUP BY stage').all();
    const byStage = Object.fromEntries(STAGES.map((s) => [s, 0]));
    byStageRows.forEach((r) => (byStage[r.stage] = r.c));
    const byPosition = db.prepare('SELECT position, COUNT(*) c FROM candidates GROUP BY position ORDER BY c DESC').all();
    const bySource = db.prepare('SELECT source, COUNT(*) c FROM candidates GROUP BY source ORDER BY c DESC').all();
    const last7 = db.prepare("SELECT COUNT(*) c FROM candidates WHERE created_at >= datetime('now','-7 days')").get().c;
    const avgExp = db.prepare('SELECT ROUND(AVG(experience_years),1) a FROM candidates').get().a || 0;
    const hired = byStage.Hired, rejected = byStage.Rejected;
    const active = total - hired - rejected;
    // average days from application to hire
    const tth = db
      .prepare(
        `SELECT AVG(julianday(h.changed_at) - julianday(c.created_at)) d
         FROM stage_history h JOIN candidates c ON c.id = h.candidate_id WHERE h.to_stage = 'Hired'`
      )
      .get().d;
    // funnel: how many candidates ever reached each stage (rejected excluded)
    const funnel = STAGES.filter((s) => s !== 'Rejected').map((s) => ({
      stage: s,
      reached: db.prepare('SELECT COUNT(DISTINCT candidate_id) c FROM stage_history WHERE to_stage = ?').get(s).c,
    }));
    const recent = db.prepare('SELECT id,name,position,stage,created_at FROM candidates ORDER BY id DESC LIMIT 5').all();
    res.json({
      total, active, hired, rejected, last7, avgExperience: avgExp,
      avgDaysToHire: tth == null ? null : Math.round(tth * 10) / 10,
      conversionRate: total ? Math.round((hired / total) * 1000) / 10 : 0,
      byStage, byPosition, bySource, funnel, recent,
    });
  });

  // facets for filter dropdowns
  app.get('/api/facets', (_req, res) => {
    res.json({
      positions: db.prepare('SELECT DISTINCT position p FROM candidates ORDER BY p').all().map((r) => r.p),
      sources: db.prepare('SELECT DISTINCT source s FROM candidates ORDER BY s').all().map((r) => r.s),
    });
  });

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}

module.exports = { createApp };
