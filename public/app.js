/* Mini ATS frontend (vanilla JS) */
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const state = { stages: [], sort: 'created_at', order: 'desc', view: 'dashboard', editing: null };

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 2200);
}
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const stars = (n) => '<span class="stars">' + '★'.repeat(n) + '☆'.repeat(5 - n) + '</span>';
const date = (s) => new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString();
const badge = (s) => `<span class="badge ${s}">${s}</span>`;
const stageColor = (s) => `var(--${s})`;

/* ---------- Navigation ---------- */
function show(view) {
  state.view = view;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('hidden', v.id !== 'view-' + view));
  refresh();
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => show(t.dataset.view)));
const refresh = () => ({ dashboard: loadDashboard, pipeline: loadBoard, candidates: loadTable }[state.view]());

/* ---------- Dashboard ---------- */
function bars(rows, key, colorFn) {
  const max = Math.max(1, ...rows.map((r) => r.c ?? r.reached));
  return rows.map((r) => {
    const v = r.c ?? r.reached;
    return `<div class="bar-row"><span>${esc(r[key])}</span><div class="bar"><i style="width:${(v / max) * 100}%;background:${colorFn ? colorFn(r[key]) : 'var(--brand)'}"></i></div><b>${v}</b></div>`;
  }).join('') || '<div class="empty">No data</div>';
}
async function loadDashboard() {
  const d = await api('/dashboard');
  const kpi = (v, l) => `<div class="card kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`;
  $('#view-dashboard').innerHTML = `
    <div class="kpis">
      ${kpi(d.total, 'Total candidates')}${kpi(d.active, 'Active in pipeline')}${kpi(d.hired, 'Hired')}
      ${kpi(d.rejected, 'Rejected')}${kpi(d.last7, 'New (7 days)')}
      ${kpi(d.conversionRate + '%', 'Hire rate')}${kpi(d.avgDaysToHire ?? '—', 'Avg days to hire')}${kpi(d.avgExperience, 'Avg experience (yrs)')}
    </div>
    <div class="panels">
      <div class="card"><h3>Candidates by stage</h3>${bars(state.stages.map((s) => ({ stage: s, c: d.byStage[s] })), 'stage', stageColor)}</div>
      <div class="card"><h3>Hiring funnel (reached stage)</h3>${bars(d.funnel, 'stage', stageColor)}</div>
      <div class="card"><h3>By position</h3>${bars(d.byPosition, 'position')}</div>
      <div class="card"><h3>By source</h3>${bars(d.bySource, 'source')}</div>
      <div class="card"><h3>Recent applicants</h3><ul class="recent">${d.recent.map((r) =>
        `<li data-id="${r.id}"><span><b>${esc(r.name)}</b> · ${esc(r.position)}</span>${badge(r.stage)}</li>`).join('') || '<div class="empty">None yet</div>'}</ul></div>
    </div>`;
  document.querySelectorAll('.recent li').forEach((li) => li.addEventListener('click', () => openDetail(li.dataset.id)));
}

/* ---------- Pipeline (kanban with drag & drop) ---------- */
async function loadBoard() {
  const q = $('#pipeSearch').value;
  const { data } = await api(`/candidates?limit=500&q=${encodeURIComponent(q)}`);
  $('#board').innerHTML = state.stages.map((s) => {
    const items = data.filter((c) => c.stage === s);
    return `<div class="col" data-stage="${s}"><h4>${s}<span class="n">${items.length}</span></h4><div class="stripe" style="background:${stageColor(s)}"></div>
      ${items.map((c) => `<div class="kcard" draggable="true" data-id="${c.id}">
        <div class="n">${esc(c.name)}</div><div class="p">${esc(c.position)}</div>
        <div class="s">${stars(c.rating)} · ${c.experience_years} yrs</div></div>`).join('')}</div>`;
  }).join('');
  document.querySelectorAll('.kcard').forEach((el) => {
    el.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', el.dataset.id));
    el.addEventListener('click', () => openDetail(el.dataset.id));
  });
  document.querySelectorAll('.col').forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault(); col.classList.remove('over');
      const id = e.dataTransfer.getData('text/plain');
      await moveStage(id, col.dataset.stage);
    });
  });
}
async function moveStage(id, stage) {
  try { await api('/candidates/' + id, { method: 'PATCH', body: { stage } }); toast(`Moved to ${stage}`); refresh(); }
  catch (e) { toast(e.message); }
}
$('#pipeSearch').addEventListener('input', debounce(loadBoard));

/* ---------- Candidates list: search / filter / sort ---------- */
async function loadFacets() {
  const f = await api('/facets');
  const fill = (sel, vals, keep) => {
    const cur = $(sel).value;
    $(sel).innerHTML = `<option value="">${keep}</option>` + vals.map((v) => `<option>${esc(v)}</option>`).join('');
    $(sel).value = cur;
  };
  fill('#fPosition', f.positions, 'All positions'); fill('#fSource', f.sources, 'All sources');
  $('#posList').innerHTML = f.positions.map((p) => `<option value="${esc(p)}">`).join('');
}
async function loadTable() {
  await loadFacets();
  const p = new URLSearchParams({ sort: state.sort, order: state.order, limit: 500 });
  [['q', '#q'], ['stage', '#fStage'], ['position', '#fPosition'], ['source', '#fSource'], ['min_exp', '#fExp']]
    .forEach(([k, s]) => $(s).value && p.set(k, $(s).value));
  const { data, total } = await api('/candidates?' + p);
  $('#rows').innerHTML = data.map((c) => `<tr data-id="${c.id}"><td><b>${esc(c.name)}</b><br><small class="muted">${esc(c.email)}</small></td>
    <td>${esc(c.position)}</td><td>${esc(c.skills)}</td><td>${c.experience_years} yrs</td><td>${badge(c.stage)}</td>
    <td>${stars(c.rating)}</td><td>${date(c.created_at)}</td></tr>`).join('')
    || '<tr><td colspan="7" class="empty">No candidates match your filters</td></tr>';
  $('#count').textContent = `${total} candidate${total === 1 ? '' : 's'}`;
  document.querySelectorAll('#rows tr[data-id]').forEach((tr) => tr.addEventListener('click', () => openDetail(tr.dataset.id)));
  document.querySelectorAll('th[data-sort]').forEach((th) => {
    th.textContent = th.textContent.replace(/ [▲▼]$/, '') + (th.dataset.sort === state.sort ? (state.order === 'asc' ? ' ▲' : ' ▼') : '');
  });
}
document.querySelectorAll('th[data-sort]').forEach((th) => th.addEventListener('click', () => {
  const s = th.dataset.sort;
  state.order = state.sort === s && state.order === 'asc' ? 'desc' : 'asc'; state.sort = s; loadTable();
}));
$('#q').addEventListener('input', debounce(loadTable));
['#fStage', '#fPosition', '#fSource', '#fExp'].forEach((s) => $(s).addEventListener('change', loadTable));
$('#clearFilters').addEventListener('click', () => {
  ['#q', '#fStage', '#fPosition', '#fSource', '#fExp'].forEach((s) => ($(s).value = ''));
  loadTable();
});

/* ---------- Add / edit form ---------- */
function openForm(c = null) {
  state.editing = c;
  const f = $('#candForm');
  f.reset(); $('#formErr').textContent = '';
  $('#formTitle').textContent = c ? 'Edit candidate' : 'Add candidate';
  if (c) for (const [k, v] of Object.entries(c)) if (f.elements[k] && typeof v !== 'object') f.elements[k].value = v ?? '';
  $('#formDlg').showModal();
}
$('#addBtn').addEventListener('click', () => openForm());
$('#formCancel').addEventListener('click', () => $('#formDlg').close());
$('#candForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  try {
    if (state.editing) await api('/candidates/' + state.editing.id, { method: 'PATCH', body });
    else await api('/candidates', { method: 'POST', body });
    $('#formDlg').close(); toast('Saved'); refresh();
    if ($('#detailDlg').open) openDetail(state.editing.id);
  } catch (err) { $('#formErr').textContent = err.message; }
});

/* ---------- Detail dialog ---------- */
async function openDetail(id) {
  const c = await api('/candidates/' + id);
  $('#detail').innerHTML = `
    <div class="detail-head"><div><h2 style="margin:0">${esc(c.name)}</h2><div class="muted" style="margin:0">${esc(c.position)} · ${stars(c.rating)}</div></div>
      <div><button class="btn" id="dEdit">Edit</button> <button class="btn danger" id="dDel">Delete</button> <button class="btn" id="dClose">✕</button></div></div>
    <dl class="kv"><dt>Email</dt><dd>${esc(c.email)}</dd><dt>Phone</dt><dd>${esc(c.phone) || '—'}</dd>
      <dt>Experience</dt><dd>${c.experience_years} years</dd><dt>Skills</dt><dd>${esc(c.skills) || '—'}</dd>
      <dt>Source</dt><dd>${esc(c.source)}</dd><dt>Applied</dt><dd>${date(c.created_at)}</dd></dl>
    <h3>Stage</h3>
    <div class="stage-pick">${state.stages.map((s) => `<button data-s="${s}" class="${s === c.stage ? 'cur' : ''}" ${s === c.stage ? `style="background:${stageColor(s)}"` : ''}>${s}</button>`).join('')}</div>
    <h3>History</h3>
    <ul class="timeline">${c.history.map((h) => `<li>${h.from_stage ? esc(h.from_stage) + ' → ' : 'Applied as '}<b>${esc(h.to_stage)}</b> <small class="muted">${date(h.changed_at)}</small></li>`).join('')}</ul>
    <h3>Notes</h3>
    <div id="notes">${c.notes.map((n) => `<div class="note"><div>${esc(n.body)}<br><small>${date(n.created_at)}</small></div><button data-n="${n.id}" title="Delete note">✕</button></div>`).join('') || '<div class="muted">No notes yet</div>'}</div>
    <form id="noteForm" style="display:flex;gap:8px;margin-top:8px"><input id="noteBody" placeholder="Add a note…" required><button class="btn primary">Add</button></form>`;
  const dlg = $('#detailDlg'); if (!dlg.open) dlg.showModal();
  $('#dClose').onclick = () => dlg.close();
  $('#dEdit').onclick = () => openForm(c);
  $('#dDel').onclick = async () => {
    if (!confirm(`Delete ${c.name}? This cannot be undone.`)) return;
    await api('/candidates/' + c.id, { method: 'DELETE' }); dlg.close(); toast('Deleted'); refresh();
  };
  document.querySelectorAll('.stage-pick button').forEach((b) => (b.onclick = async () => {
    if (b.dataset.s === c.stage) return;
    await moveStage(c.id, b.dataset.s); openDetail(c.id);
  }));
  document.querySelectorAll('.note button').forEach((b) => (b.onclick = async () => {
    await api('/notes/' + b.dataset.n, { method: 'DELETE' }); openDetail(c.id);
  }));
  $('#noteForm').onsubmit = async (e) => {
    e.preventDefault();
    await api(`/candidates/${c.id}/notes`, { method: 'POST', body: { body: $('#noteBody').value } }); openDetail(c.id);
  };
}

/* ---------- Boot ---------- */
(async () => {
  state.stages = await api('/stages');
  $('#fStage').innerHTML += state.stages.map((s) => `<option>${s}</option>`).join('');
  $('#formStage').innerHTML = state.stages.map((s) => `<option>${s}</option>`).join('');
  show('dashboard');
})();
