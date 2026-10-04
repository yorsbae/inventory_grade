/* ===== helper ===== */
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(9)) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return e;
}
const fmtNum = v => (v == null || v === 0) ? '-' : Number(v).toLocaleString('id-ID');
const fmtDate = v => { if (!v) return ''; const p = v.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : v; };
const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const monthStart = () => todayISO().slice(0, 8) + '01';
const DEFAULT_DAYS = 7, PAGE_SIZES = [25, 50, 100];
const daysAgo = n => new Date(Date.now() - new Date().getTimezoneOffset() * 60000 - n * 864e5).toISOString().slice(0, 10);
const defaultFrom = () => daysAgo(DEFAULT_DAYS - 1);
const J = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/* ===== Combo: kolom pilihan dengan pencarian di server (tidak memuat semua data) ===== */
class Combo {
  constructor(src, o = {}) {
    this.src = src; this.o = o; this.idx = -1; this.items = []; this.typing = false;
    this.picked = null; this._seq = 0; this._t = null; this._lastQ = null;
    this.input = h('input', { type: 'text', autocomplete: 'off', placeholder: o.placeholder || 'Ketik atau pilih…' });
    this.list = h('div', { class: 'combo-list' });
    this.arrow = h('button', {
      type: 'button', class: 'combo-arrow', tabindex: '-1',
      onmousedown: e => { e.preventDefault(); if (this.isOpen()) this.close(); else { this.input.focus(); this.typing = false; this.open(); } }
    }, '▾');
    this.el = h('div', { class: 'combo' }, this.input, this.arrow, this.list);
    this.input.addEventListener('focus', () => { this.typing = false; this.input.select(); this.open(); });
    this.input.addEventListener('input', () => { this.typing = true; this.idx = -1; this.input.classList.remove('bad'); this.open(); });
    this.input.addEventListener('keydown', e => this.key(e));
    this.input.addEventListener('blur', () => { this.close(); this.snap(); });
  }
  get value() { return this.input.value; }
  set value(v) { this.input.value = v == null ? '' : v; this.input.classList.remove('bad'); this.picked = null; }
  focus() { this.input.focus(); }
  isOpen() { return this.list.style.display === 'block'; }
  async fetchOpts(q) {
    try {
      return await (await fetch('/api/opt/' + this.src + '?' + new URLSearchParams({ q: q || '', limit: 50 }))).json();
    } catch { return []; }
  }
  place() {  // dropdown position:fixed -> tidak terpotong modal/tabel, dijaga tetap di dalam layar
    const l = this.list, r = this.input.getBoundingClientRect(), m = 8;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const maxW = Math.min(420, vw - 2 * m);
    Object.assign(l.style, { maxHeight: '240px', minWidth: Math.min(r.width, maxW) + 'px', maxWidth: maxW + 'px' });
    const w = Math.min(l.offsetWidth, maxW), hh = Math.min(l.scrollHeight, 240);
    const below = vh - r.bottom - m, above = r.top - m;
    l.style.left = Math.max(m, Math.min(r.left, vw - m - w)) + 'px';
    if (below < Math.min(hh, 160) && above > below) {
      l.style.top = 'auto'; l.style.bottom = (vh - r.top + 2) + 'px'; l.style.maxHeight = Math.min(240, above) + 'px';
    } else {
      l.style.bottom = 'auto'; l.style.top = (r.bottom + 2) + 'px'; l.style.maxHeight = Math.min(240, Math.max(below, 120)) + 'px';
    }
  }
  open() {
    const q = this.typing ? this.input.value.trim() : '';
    this.list.style.display = 'block'; this.place();
    if (!this._re) {
      this._re = e => { if (e && e.target && this.list.contains(e.target)) return; this.place(); };
      window.addEventListener('scroll', this._re, true); window.addEventListener('resize', this._re);
    }
    if (!this.items.length) { this.list.innerHTML = ''; this.list.append(h('div', { class: 'combo-empty' }, 'Mencari…')); }
    const seq = ++this._seq;
    clearTimeout(this._t);
    this._t = setTimeout(async () => {
      const items = await this.fetchOpts(q);
      if (seq !== this._seq || !this.isOpen()) return;
      this.items = items; this.idx = -1; this.renderList();
    }, q === this._lastQ ? 0 : 150);
    this._lastQ = q;
  }
  renderList() {
    this.list.innerHTML = '';
    this.items.forEach((o, i) => this.list.append(h('div', {
      class: 'combo-item' + (i === this.idx ? ' on' : ''),
      onmousedown: e => { e.preventDefault(); this.pick(o); }
    }, h('b', {}, o.v), o.sub ? h('span', {}, o.sub) : null)));
    if (!this.items.length) this.list.append(h('div', { class: 'combo-empty' }, 'Tidak ada di master (tambahkan di halaman DB)'));
  }
  close() {
    this.list.style.display = 'none'; this.idx = -1;
    if (this._re) { window.removeEventListener('scroll', this._re, true); window.removeEventListener('resize', this._re); this._re = null; }
  }
  mark() {
    [...this.list.children].forEach((c, i) => c.classList.toggle('on', i === this.idx));
    const c = this.list.children[this.idx]; if (c) c.scrollIntoView({ block: 'nearest' });
  }
  key(e) {
    const open = this.isOpen();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); if (!open) { this.open(); return; }
      const n = this.items.length; if (!n) return;
      this.idx = (this.idx + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; this.mark();
    } else if (e.key === 'Enter') {
      if (open && this.items.length && (this.idx >= 0 || this.typing)) {
        e.preventDefault(); e.stopImmediatePropagation(); this.pick(this.items[Math.max(this.idx, 0)]);
      }
    } else if (e.key === 'Escape' && open) { e.stopPropagation(); this.close(); }
  }
  pick(o) {
    this.input.value = o.v; this.typing = false; this.input.classList.remove('bad'); this.picked = o; this.close();
    if (this.o.onPick) this.o.onPick(o);
  }
  async snap() {
    const v = this.input.value.trim();
    if (!v) { this.input.classList.remove('bad'); this.picked = null; if (this.o.onPick) this.o.onPick(null); return null; }
    if (this.picked && this.picked.v && this.picked.v.toLowerCase() === v.toLowerCase()) {
      this.input.classList.remove('bad'); return this.picked;
    }
    const items = await this.fetchOpts(v);
    const f = items.find(x => x.v.toLowerCase() === v.toLowerCase());
    if (f) { this.input.value = f.v; this.picked = f; }
    this.input.classList.toggle('bad', !f);
    if (this.o.onPick) this.o.onPick(f || null);
    return f || null;
  }
}

/* ===== Modal (overlay) ===== */
function openModal(title, body, footer) {
  const ov = h('div', { class: 'overlay' });
  const ttl = h('h2', {}, title);
  const panel = h('div', { class: 'modal', role: 'dialog' },
    h('div', { class: 'modal-h' }, ttl, h('button', { type: 'button', class: 'x', title: 'Tutup (Esc)', onclick: () => close() }, '×')),
    h('div', { class: 'modal-b' }, body), h('div', { class: 'modal-f' }, footer));
  ov.append(panel); document.body.append(ov); document.body.classList.add('noscroll');
  const esc = e => { if (e.key === 'Escape' && !e.defaultPrevented) close(); };
  document.addEventListener('keydown', esc);
  function close() { document.removeEventListener('keydown', esc); ov.remove(); document.body.classList.remove('noscroll'); }
  return { close, panel, setTitle: t => { ttl.textContent = t; } };
}

/* ===== komponen bersama ===== */
function makeNotifier(el) {
  let t;
  return (text, cls, sticky) => {
    clearTimeout(t); el.className = 'msg ' + (cls || ''); el.textContent = text;
    if (cls === 'ok' && !sticky) t = setTimeout(() => { el.className = 'msg'; el.textContent = ''; }, 4000);
  };
}
function ioTools(key, onDone, notify, impBox, hideTemplate) {
  const file = h('input', { type: 'file', accept: '.xlsx', style: 'display:none' });
  file.onchange = async () => {
    if (!file.files[0]) return;
    const fd = new FormData(); fd.append('file', file.files[0]);
    const res = await fetch('/import/' + key, { method: 'POST', body: fd });
    const r = await res.json(); file.value = ''; impBox.innerHTML = '';
    if (!res.ok) { notify(r.errors.map(e => e.msg).join('\n'), 'err'); return; }
    notify(`Import selesai: ${r.inserted} ${r.unit} masuk, ${r.error_count} ditolak.`, r.error_count ? 'warn' : 'ok', true);
    for (const e of r.errors) impBox.append(h('div', {}, `Baris Excel ${e.row}: ${e.msg}`));
    onDone();
  };
  const exp = h('a', { class: 'btn', href: '#' }, 'Export Excel');
  return {
    exp,
    els: [h('button', { class: 'btn', onclick: () => file.click() }, 'Import Excel'), file,
          hideTemplate ? null : h('a', { class: 'btn', href: '/template/' + key }, 'Template'), exp].filter(Boolean)
  };
}
function pagerInto(el, page, pages, total, extra, go, size, onSize) {
  el.innerHTML = '';
  const from = total ? (page - 1) * size + 1 : 0, to = Math.min(page * size, total);
  const sel = h('select', { class: 'pgsize', title: 'Baris per halaman', onchange: () => onSize(parseInt(sel.value)) },
    PAGE_SIZES.map(n => h('option', { value: n, selected: n === size }, n + ' / hal')));
  el.append(h('button', { class: 'btn sm', disabled: page <= 1, onclick: () => go(page - 1) }, '‹ Prev'),
    `Hal ${page} / ${pages}`,
    h('button', { class: 'btn sm', disabled: page >= pages, onclick: () => go(page + 1) }, 'Next ›'),
    sel, `· ${from.toLocaleString('id-ID')}–${to.toLocaleString('id-ID')} dari ${total.toLocaleString('id-ID')} baris`, extra || '');
}
function rangeInputs(range, onChange) {
  const a = h('input', { type: 'date', value: range.from || '' }), b = h('input', { type: 'date', value: range.to || '' });
  const ch = () => {  // tanggal tidak boleh kosong: kosong = semua data = lemot
    if (!a.value) a.value = defaultFrom();
    if (!b.value) b.value = todayISO();
    if (a.value > b.value) { if (document.activeElement === a) b.value = a.value; else a.value = b.value; }
    range.from = a.value; range.to = b.value; onChange();
  };
  a.onchange = b.onchange = ch;
  return [h('label', {}, 'Dari', a), h('label', {}, 'Sampai', b)];
}
/* kotak pencarian: filter server-side (bukan filter di browser) supaya data yang dimuat tetap sedikit */
function searchBox(state, onChange, placeholder) {
  const inp = h('input', { type: 'search', placeholder: placeholder || 'Cari…', value: state.q || '' });
  let t;
  inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = inp.value.trim(); onChange(); }, 300); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(t); state.q = inp.value.trim(); onChange(); } });
  return h('label', { class: 'searchbox' }, 'Cari', inp);
}
/* "view by kategori": filter per tabel — Jenis untuk Motif/Stok Awal/Produksi, Dept untuk Barang Masuk/Keluar */
const CAT_CACHE = {};
async function catOptions(src) {
  if (!CAT_CACHE[src]) CAT_CACHE[src] = (await (await fetch('/api/opt/' + src + '?limit=200')).json()).map(x => x.v);
  return CAT_CACHE[src];
}
function categoryFilter(state, onChange, src, key, labelAll) {
  src = src || 'jenis'; key = key || 'jenis';
  const sel = h('select', {}, h('option', { value: '' }, labelAll || ('Semua ' + (src === 'dept' ? 'Dept' : 'Jenis'))));
  sel.addEventListener('change', () => { state[key] = sel.value; onChange(); });
  catOptions(src).then(list => {
    for (const v of list) sel.append(h('option', { value: v, selected: v === state[key] }, v));
  });
  return h('label', { class: 'catfilter' }, 'Kategori', sel);
}
/* daftar tabel tercentang: pilih kolom mana yang ditampilkan, disimpan per halaman */
function colChecklist(storeKey, cols, onChange) {
  let vis;
  try { vis = JSON.parse(localStorage.getItem('colvis:' + storeKey)) || {}; } catch { vis = {}; }
  const save = () => { try { localStorage.setItem('colvis:' + storeKey, JSON.stringify(vis)); } catch {} };
  const pop = h('div', { class: 'colpop' });
  for (const c of cols) {
    const cb = h('input', { type: 'checkbox', checked: vis[c.n] !== false });
    cb.addEventListener('change', () => { vis[c.n] = cb.checked; save(); onChange(vis); });
    pop.append(h('label', { class: 'colitem' }, cb, c.l));
  }
  const btn = h('button', { type: 'button', class: 'btn', title: 'Pilih kolom yang ditampilkan' }, 'Kolom ▾');
  btn.addEventListener('click', e => { e.stopPropagation(); pop.classList.toggle('open'); });
  document.addEventListener('click', e => { if (!pop.contains(e.target) && e.target !== btn) pop.classList.remove('open'); });
  queueMicrotask(() => onChange(vis));
  return { el: h('div', { class: 'colcheck' }, btn, pop), vis };
}
function applyColVis(theadRow, tbody, cols, vis) {
  [...theadRow.children].forEach((th, i) => { if (i < cols.length) th.style.display = vis[cols[i].n] === false ? 'none' : ''; });
  [...tbody.children].forEach(tr => {
    [...tr.children].forEach((td, i) => { if (i < cols.length) td.style.display = vis[cols[i].n] === false ? 'none' : ''; });
  });
}

/* judul kolom tabel: teks, klik = urutkan asc/desc (tabel master DB saja; halaman lain pakai panel Filter) */
function thCell(label, opts) {
  const { align, sortOn, onSort } = opts || {};
  const lab = h('span', { class: 'th-label', onclick: onSort }, label, sortOn ? h('i', { class: 'th-sort' }, sortOn === 'asc' ? ' \u25B2' : ' \u25BC') : null);
  return h('th', { class: align || '' }, h('span', { class: 'th-wrap' }, lab));
}
/* cetak SSTB dengan tata letak seperti formulir kertas Surat Serah Terima Barang */
function printSSTB(doc, label) {
  const items = doc.items || [];
  const hasLink = items.some(it => it.link_produksi);  // kolom ke-4 hanya ada kalau benar2 dipakai
  const rows = items.map(it => `<tr><td>${esc(it.kode_motif)}</td><td>${esc(it.ket || '')}</td>
    <td class="num">${fmtNum(it.jumlah)}</td>${hasLink ? `<td>${esc(it.link_produksi ? it.link_produksi.replace(/#\d+$/, '').trim() : '')}</td>` : ''}</tr>`).join('');
  const total = items.reduce((s, it) => s + (parseInt(it.jumlah) || 0), 0);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>SSTB ${esc(doc.sstb)}</title>
<style>
/* Kertas A4 potret, tapi isi cetakan hanya mengisi separuh atas halaman */
@page{size:A4 portrait;margin:0}
*{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}
html,body{margin:0;color:#111;background:#ccc}
.sheet{width:210mm;min-height:148.5mm;margin:0 auto;padding:14mm 16mm;background:#fff}
/* catatan: tinggi dibiarkan menyesuaikan kalau barang sangat banyak, supaya data tidak pernah terpotong */
h1{font-size:15px;text-align:center;margin:0 0 2px;text-transform:uppercase;letter-spacing:.5px}
h2{font-size:11.5px;text-align:center;margin:0 0 10px;font-weight:normal;color:#444}
.hdr{display:flex;justify-content:space-between;gap:10px;margin-bottom:10px;font-size:11px;border:1px solid #333;padding:7px 10px}
.hdr div{line-height:1.6;min-width:0}
.hdr b{display:inline-block;min-width:60px}
table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:11px;margin-bottom:6px}
th,td{border:1px solid #333;padding:4px 6px;vertical-align:top;overflow-wrap:break-word;word-break:break-word}
th{background:#eee;text-align:left}
td.num,th.num{text-align:right}
tfoot td{font-weight:bold;background:#f7f7f7}
.sig{display:flex;justify-content:space-between;margin-top:22px;font-size:11px}
.sig div{width:45%;text-align:center}
.sig .line{margin-top:28px;border-top:1px solid #333;padding-top:4px}
.foot{margin-top:6px;font-size:9px;color:#777;text-align:right}
@media print{html,body{background:#fff}.sheet{margin:0;box-shadow:none}}
@media screen{body{padding:10mm 0}.sheet{box-shadow:0 2px 10px rgba(0,0,0,.25)}}
</style></head><body>
<div class="sheet">
<h1>Surat Serah Terima Barang</h1>
<h2>${esc(label)}</h2>
<div class="hdr">
  <div><b>No SSTB</b> ${esc(doc.sstb)}<br><b>Dept</b> ${esc(doc.dept || '-')}</div>
  <div style="text-align:right"><b>Tanggal</b> ${fmtDate(doc.tanggal)}<br><b>Pengrajin</b> ${esc(doc.pengrajin || '-')}</div>
</div>
<table><thead><tr><th>Motif</th><th>Ket</th><th class="num">Jumlah</th>${hasLink ? '<th>Sumber Produksi</th>' : ''}</tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td colspan="2">TOTAL</td><td class="num">${fmtNum(total)}</td>${hasLink ? '<td></td>' : ''}</tr></tfoot>
</table>
<div class="sig">
  <div>Yang Menyerahkan<div class="line">&nbsp;</div></div>
  <div>Yang Menerima<div class="line">&nbsp;</div></div>
</div>
<div class="foot">Dicetak ${fmtDate(todayISO())} dari Stok Grade</div>
</div>
<script>window.onload=()=>setTimeout(()=>window.print(),250)</script>
</body></html>`;
  const win = window.open('', '_blank');
  if (!win) { alert('Popup diblokir browser. Izinkan popup untuk mencetak SSTB.'); return; }
  win.document.write(html); win.document.close();
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* tabel yang boleh difilter per Jenis ("view by kategori") */
const JENIS_FILTER_KEYS = ['motif', 'opening'];

/* ===========================================================================
   Panel "Filter" terpadu — dipakai bersama oleh Barang Masuk, Produksi, Barang
   Keluar: Cari + semua dropdown field + rentang Jumlah + Urut + Kelompokkan,
   semuanya dalam satu tombol, supaya pengalamannya konsisten di 3 halaman itu.
   =========================================================================== */
function newFilterState() { return { q: '', filters: {}, ranges: {}, sort: '', dir: 'desc', group: '' }; }
function filterActiveCount(st) {
  let n = st.q ? 1 : 0;
  n += Object.keys(st.filters).length;
  n += Object.values(st.ranges).filter(r => r && (r.min !== undefined || r.max !== undefined)).length;
  if (st.sort) n++;
  if (st.group) n++;
  return n;
}
function buildFilterToolbarItem(inst, cfg) {
  // inst: instance dengan inst.pstate, inst.page, inst.load(). cfg: lihat pemanggilnya (Crud/DocPage).
  const btn = h('button', { type: 'button', class: 'btn' }, '🔍 Filter');
  const chipsRow = h('div', { class: 'chips filterchips' });
  function refresh() {
    const n = filterActiveCount(inst.pstate);
    btn.textContent = n ? `🔍 Filter (${n})` : '🔍 Filter';
    chipsRow.innerHTML = '';
    const st = inst.pstate;
    const fieldLbl = {}; cfg.fields.forEach(f => { fieldLbl[f.n] = f.l; });
    const sortLbl = {}; cfg.sortFields.forEach(f => { sortLbl[f.n] = f.l; });
    const groupLbl = {}; cfg.groupFields.forEach(f => { groupLbl[f.n] = f.l; });
    const chips = [];
    if (st.q) chips.push(`Cari: "${st.q}"`);
    for (const [k, v] of Object.entries(st.filters)) chips.push(`${fieldLbl[k] || k}: ${v[0]}`);
    for (const [k, r] of Object.entries(st.ranges)) {
      if (r && (r.min !== undefined || r.max !== undefined))
        chips.push(`${(cfg.rangeField && cfg.rangeField.n === k) ? cfg.rangeField.l : k}: ${r.min ?? ''}–${r.max ?? ''}`);
    }
    if (st.sort) chips.push(`Urut: ${sortLbl[st.sort] || st.sort} ${st.dir === 'asc' ? '↑' : '↓'}`);
    if (st.group) chips.push(`Kelompok: ${groupLbl[st.group] || st.group}`);
    for (const c of chips) chipsRow.append(h('span', { class: 'chip' }, c));
  }
  btn.addEventListener('click', () => openFilterModal(inst, cfg, refresh));
  inst._refreshFilterUI = refresh;
  refresh();
  return { btn, chipsRow };
}
function openFilterModal(inst, cfg, refreshToolbar) {
  const st = inst.pstate;
  const qInput = h('input', { type: 'text', value: st.q, placeholder: cfg.searchPlaceholder || 'Cari…' });
  const grid = h('div', { class: 'form-grid' });
  const selects = {};
  for (const f of cfg.fields) {
    const sel = h('select', {}, h('option', { value: '' }, 'Semua'));
    sel.disabled = true;
    selects[f.n] = sel;
    grid.append(h('label', {}, f.l, sel));
    cfg.fetchDistinct(f.n).then(vals => {
      sel.disabled = false;
      const cur = (st.filters[f.n] || [])[0];
      for (const v of vals) sel.append(h('option', { value: v, selected: cur === v }, v));
    });
  }
  let minInp, maxInp;
  if (cfg.rangeField) {
    const r = st.ranges[cfg.rangeField.n] || {};
    minInp = h('input', { type: 'number', value: r.min ?? '', placeholder: 'Minimal' });
    maxInp = h('input', { type: 'number', value: r.max ?? '', placeholder: 'Maksimal' });
    grid.append(h('label', {}, cfg.rangeField.l + ' Minimal', minInp), h('label', {}, cfg.rangeField.l + ' Maksimal', maxInp));
  }
  const sortSel = h('select', {}, h('option', { value: '' }, 'Default'),
    cfg.sortFields.map(f => h('option', { value: f.n, selected: st.sort === f.n }, f.l)));
  const dirSel = h('select', {}, h('option', { value: 'desc', selected: st.dir !== 'asc' }, 'Descending ↓'),
    h('option', { value: 'asc', selected: st.dir === 'asc' }, 'Ascending ↑'));
  const groupSel = h('select', {}, h('option', { value: '' }, 'Tidak ada'),
    cfg.groupFields.map(f => h('option', { value: f.n, selected: st.group === f.n }, f.l)));
  const body = h('div', {},
    h('label', { class: 'span2' }, 'Cari', qInput),
    grid,
    h('h3', { class: 'sub' }, 'Urutkan & Kelompokkan'),
    h('div', { class: 'form-grid' },
      h('label', {}, 'Urut berdasarkan', sortSel), h('label', {}, 'Urutan', dirSel),
      h('label', {}, 'Kelompokkan berdasarkan', groupSel)));
  const apply = () => {
    st.q = qInput.value.trim();
    st.filters = {};
    for (const f of cfg.fields) if (selects[f.n].value) st.filters[f.n] = [selects[f.n].value];
    st.ranges = {};
    if (cfg.rangeField) {
      const r = {};
      if (minInp.value !== '') r.min = minInp.value;
      if (maxInp.value !== '') r.max = maxInp.value;
      if (r.min !== undefined || r.max !== undefined) st.ranges[cfg.rangeField.n] = r;
    }
    st.sort = sortSel.value; st.dir = dirSel.value; st.group = groupSel.value;
    modal.close(); refreshToolbar(); inst.page = 1; inst.load();
  };
  const foot = [
    h('button', { class: 'btn', onclick: () => {
      Object.assign(st, newFilterState());
      modal.close(); refreshToolbar(); inst.page = 1; inst.load();
    } }, 'Reset'),
    h('span', { class: 'grow' }),
    h('button', { class: 'btn', onclick: () => modal.close() }, 'Batal'),
    h('button', { class: 'btn primary', onclick: apply }, 'Terapkan Filter')
  ];
  const modal = openModal('Filter ' + cfg.title, body, foot);
}

/* tabel dengan opsi Kelompokkan (Group By): satu <tbody> per kelompok supaya baris bisa dilipat/dibuka */
function renderGroupedTable(table, rows, groupCol, colspan, rowFn, emptyMsg) {
  [...table.querySelectorAll('tbody')].forEach(tb => tb.remove());
  if (!rows.length) {
    table.append(h('tbody', {}, h('tr', { class: 'none' }, h('td', { class: 'empty', colspan }, emptyMsg))));
    return;
  }
  if (!groupCol) {
    const tb = h('tbody');
    for (const row of rows) tb.append(rowFn(row));
    table.append(tb);
    return;
  }
  const counts = {};
  for (const row of rows) { const k = row[groupCol] || '(kosong)'; counts[k] = (counts[k] || 0) + 1; }
  let curKey = null, tb = null;
  for (const row of rows) {
    const key = row[groupCol] || '(kosong)';
    if (key !== curKey) {
      curKey = key;
      const head = h('tr', { class: 'grouphead' }, h('td', { colspan },
        h('button', { type: 'button', class: 'grouptoggle', onclick: e => {
          const b = e.currentTarget, tbb = b.closest('tbody'); tbb.classList.toggle('collapsed');
          b.querySelector('.gi').textContent = tbb.classList.contains('collapsed') ? '▶' : '▼';
        } }, h('span', { class: 'gi' }, '▼'), ` ${key} `, h('small', {}, `(${counts[key]})`))));
      tb = h('tbody', { class: 'grp' }, head);
      table.append(tb);
    }
    tb.append(rowFn(row));
  }
}

/* ===== Crud: master + produksi (daftar + form overlay) ===== */
class Crud {
  constructor(root, key, o = {}) {
    this.root = root; this.key = key; this.o = o; this.page = 1; this.size = PAGE_SIZES[0]; this.sort = ''; this.dir = 'desc';
    this.range = o.range || { from: defaultFrom(), to: todayISO() };
    this.qstate = { q: '' }; this.catstate = { jenis: '' }; this.filters = {}; this.sticky = {};
    this.pstate = o.filterPanel ? newFilterState() : null;  // panel "Filter" terpadu (Produksi); tabel master pakai cara lama
    this.ready = this.init();
  }
  async init() {
    this.meta = await (await fetch('/api/meta/' + this.key)).json();
    this.build(); await this.load();
  }
  build() {
    const m = this.meta; this.root.innerHTML = '';
    this.msg = h('div', { class: 'msg' }); this.notify = makeNotifier(this.msg);
    this.impBox = h('div', { class: 'imp' });
    const tb = h('div', { class: 'toolbar' });
    if (!this.o.hideAdd) tb.append(h('button', { class: 'btn primary', onclick: () => this.openForm() }, '+ Tambah'));
    if (m.datecol && !this.o.noRange) tb.append(...rangeInputs(this.range, () => { this.page = 1; this.load(); }));
    if (this.pstate) {
      tb.append(h('span', { class: 'grow' }));
      const io = ioTools(this.key, () => { this.load(); if (this.o.onChange) this.o.onChange(); }, this.notify, this.impBox, true);
      this.exp = io.exp;
      const fi = buildFilterToolbarItem(this, this.o.filterPanel);
      tb.append(fi.btn, ...io.els);
      this.chipsRow = fi.chipsRow;
    } else {
      tb.append(searchBox(this.qstate, () => { this.page = 1; this.load(); }));
      if (JENIS_FILTER_KEYS.includes(this.key)) tb.append(categoryFilter(this.catstate, () => { this.page = 1; this.load(); }));
      tb.append(h('span', { class: 'grow' }));
      const io = ioTools(this.key, () => { this.load(); if (this.o.onChange) this.o.onChange(); }, this.notify, this.impBox);
      this.exp = io.exp; tb.append(...io.els);
      const cc = colChecklist(this.key, m.cols, vis => { this.colvis = vis; this.applyVis(); });
      tb.append(cc.el);
    }
    this.thead = h('thead'); this.theadRow = h('tr'); this.thead.append(this.theadRow); this.tbody = h('tbody');
    this.table = h('table', { class: 'resp' }, this.thead, this.tbody);
    if (this.pstate) {
      for (const c of m.cols) this.theadRow.append(h('th', { class: this.isInt(c) ? 'num' : '' }, c.l));
      this.theadRow.append(h('th', {}, 'Aksi'));
    } else {
      this.refreshHead();
    }
    this.pager = h('div', { class: 'pager' });
    this.root.append(tb, this.chipsRow || '', this.msg, this.impBox,
      h('div', { class: 'tablewrap' }, this.table), this.pager);
  }
  refreshHead() {
    this.theadRow.innerHTML = '';
    for (const c of this.meta.cols) this.theadRow.append(thCell(c.l, {
      align: this.isInt(c) ? 'num' : '', sortOn: this.sort === c.n ? this.dir : null,
      onSort: () => { this.dir = (this.sort === c.n && this.dir === 'desc') ? 'asc' : 'desc'; this.sort = c.n; this.load(); }
    }));
    this.theadRow.append(h('th', {}, 'Aksi'));
  }
  applyVis() { if (this.colvis) applyColVis(this.theadRow, this.tbody, this.meta.cols, this.colvis); }
  params(extra) {
    const p = new URLSearchParams(extra || {});
    for (const [k, v] of Object.entries(this.range)) if (v) p.set(k, v);
    if (this.pstate) {
      const st = this.pstate;
      if (st.q) p.set('q', st.q);
      if (Object.keys(st.filters).length) p.set('filters', JSON.stringify(st.filters));
      if (Object.keys(st.ranges).length) p.set('ranges', JSON.stringify(st.ranges));
      if (st.sort) { p.set('sort', st.sort); p.set('dir', st.dir); }
      if (st.group) p.set('group', st.group);
    } else {
      if (this.qstate.q) p.set('q', this.qstate.q);
      if (this.catstate.jenis) p.set('jenis', this.catstate.jenis);
      if (Object.keys(this.filters).length) p.set('filters', JSON.stringify(this.filters));
      if (this.sort) { p.set('sort', this.sort); p.set('dir', this.dir); }
    }
    return p;
  }
  isInt(c) { return c.t === 'int' || c.num; }
  rowEl(row) {
    const tr = h('tr');
    for (const c of this.meta.cols) {
      const v = row[c.n];
      tr.append(h('td', { class: this.isInt(c) ? 'num' : '', 'data-label': c.l },
        this.isInt(c) ? fmtNum(v) : c.t === 'date' ? fmtDate(v) : v == null ? '' : v));
    }
    tr.append(h('td', { class: 'act', 'data-label': 'Aksi' },
      h('button', { class: 'btn sm', onclick: () => this.openForm(row) }, 'Edit'), ' ',
      h('button', { class: 'btn sm danger', onclick: () => this.del(row) }, 'Hapus')));
    return tr;
  }
  async load() {
    if (!this.pstate) this.refreshHead();
    const r = await (await fetch('/api/' + this.key + '?' + this.params({ page: this.page, size: this.size }))).json();
    this.exp.href = '/export/' + this.key + '?' + this.params();
    const filterActive = this.pstate ? filterActiveCount(this.pstate) > 0
      : (this.qstate.q || this.catstate.jenis || Object.keys(this.filters).length);
    const emptyMsg = filterActive ? 'Tidak ada data yang cocok dengan filter.' : 'Belum ada data.';
    renderGroupedTable(this.table, r.rows, this.pstate ? this.pstate.group : null, this.meta.cols.length + 1,
      row => this.rowEl(row), emptyMsg);
    this.tbody = this.table.querySelector('tbody');
    pagerInto(this.pager, this.page, r.pages, r.total, r.sum != null ? ` · Total jumlah: ${r.sum.toLocaleString('id-ID')}` : '',
      p => { this.page = p; this.load(); }, this.size, n => { this.size = n; this.page = 1; this.load(); });
    this.applyVis();
  }
  recalcSum() {
    if (this.f.jumlah && this.key === 'produksi')
      this.f.jumlah.value = this.meta.cats.reduce((s, c) => s + (parseInt(this.f[c].value) || 0), 0);
  }
  onPickField(c, o) {
    if (c.n === 'kode_motif' && this.f.motif && this.f.jenis) {
      this.f.motif.value = o ? o.motif : ''; this.f.jenis.value = o ? o.jenis : '';
    }
  }
  async openForm(row) {
    const m = this.meta;
    const editId = row ? row.id : null; this.f = {};
    const grid = h('div', { class: 'form-grid' });
    const fmsg = h('div', { class: 'msg' });
    const onEnter = e => { if (e.key === 'Enter' && !e.defaultPrevented) { e.preventDefault(); this.save(editId ? false : true); } };
    for (const c of m.cols) {
      let ctl, el;
      if (c.t === 'ref' || c.t === 'linkref') {
        ctl = new Combo(c.src, { placeholder: c.t === 'linkref' ? 'Opsional — cari & pilih…' : undefined,
          onPick: o => this.onPickField(c, o) });
        el = ctl.el; ctl.input.addEventListener('keydown', onEnter);
      } else {
        ctl = h('input', {
          type: c.t === 'date' ? 'date' : c.t === 'int' ? 'number' : 'text', min: c.t === 'int' ? 0 : null,
          inputmode: c.t === 'int' ? 'numeric' : null, readonly: c.t === 'auto', class: c.t === 'auto' ? 'auto' : '',
          autocomplete: 'off', tabindex: c.t === 'auto' ? -1 : null
        });
        if (c.t !== 'auto') ctl.addEventListener('keydown', onEnter);
        if (this.key === 'produksi' && m.cats.includes(c.n)) ctl.addEventListener('input', () => this.recalcSum());
        el = ctl;
      }
      this.f[c.n] = ctl;
      grid.append(h('label', { class: c.n === 'catatan' ? 'span2' : '' }, c.l + (c.req ? ' *' : ''), el));
    }
    for (const c of m.cols) {
      let v = row ? row[c.n] : (this.sticky[c.n] != null ? this.sticky[c.n] : (c.n === 'tgl_produksi' ? todayISO() : ''));
      if (c.t === 'auto') continue;
      this.f[c.n].value = v == null ? '' : v;
    }
    this.recalcSum();
    const btnCancel = h('button', { class: 'btn', onclick: () => modal.close() }, 'Batal');
    const foot = [btnCancel];
    if (!editId) foot.push(h('button', { class: 'btn', onclick: () => this.save(true) }, 'Simpan & Tambah Lagi'));
    foot.push(h('button', { class: 'btn primary', onclick: () => this.save(false) }, editId ? 'Update' : 'Simpan'));
    const modal = openModal((editId ? 'Edit ' : 'Tambah ') + m.title, h('div', {}, fmsg, grid,
      editId ? null : h('p', { class: 'hint' }, 'Enter = simpan & tambah lagi. Kolom abu-abu terisi otomatis.')), foot);
    this.modal = modal; this.fmsg = fmsg; this.editId = editId;
    const first = m.cols.find(c => c.t !== 'auto' && !this.f[c.n].value);
    (this.f[(first || m.cols[0]).n]).focus();
  }
  async save(again) {
    const m = this.meta, body = {};
    for (const c of m.cols) if (c.t !== 'auto') body[c.n] = this.f[c.n].value;
    const editId = this.editId;
    const res = await fetch('/api/' + this.key + (editId ? '/' + editId : ''), J(editId ? 'PUT' : 'POST', body));
    const r = await res.json();
    if (!res.ok) { this.fmsg.className = 'msg err'; this.fmsg.textContent = r.errors.join('\n'); return; }
    if (!editId && this.key === 'produksi')
      this.sticky = { tgl_produksi: body.tgl_produksi, tgl_masuk_sanggan: body.tgl_masuk_sanggan, nama: body.nama, pasangan: body.pasangan };
    this.modal.close(); this.notify('Tersimpan.', 'ok');
    this.load(); if (this.o.onChange) this.o.onChange();
    if (again && !editId) this.openForm();
  }
  async del(row) {
    if (!confirm('Hapus baris ini?')) return;
    const res = await fetch(`/api/${this.key}/${row.id}`, { method: 'DELETE' });
    if (!res.ok) { const r = await res.json(); this.notify(r.errors.join('\n'), 'err'); return; }
    this.load(); if (this.o.onChange) this.o.onChange();
  }
}

/* ===== DocPage: Barang Masuk / Barang Keluar (1 SSTB = 1 dokumen, banyak baris) ===== */
const DOC_COLS_BASE = [['sstb', 'SSTB'], ['tanggal', 'Tanggal', 'date'], ['dept', 'Dept'], ['kode_motif', 'Kode Motif'],
  ['motif', 'Motif'], ['jenis', 'Jenis'], ['jumlah', 'Jumlah', 'int'], ['ket', 'Ket'], ['pengrajin', 'Nama Pengrajin'], ['rumus', 'Rumus']];

class DocPage {
  constructor(root, arah) {
    this.root = root; this.arah = arah; this.keluar = arah === 'keluar';
    this.label = arah === 'masuk' ? 'Barang Masuk' : 'Barang Keluar';
    this.cols = DOC_COLS_BASE.concat(this.keluar ? [['link_produksi', 'Link Produksi']] : []);
    this.page = 1; this.size = PAGE_SIZES[0]; this.sticky = {};
    this.range = { from: defaultFrom(), to: todayISO() };
    this.pstate = newFilterState();
    /* field panel Filter, disesuaikan dengan kolom yang benar-benar ada di Barang Masuk/Keluar */
    this.filterCfg = {
      title: this.label,
      searchPlaceholder: 'Cari SSTB, Dept, Motif, Jenis, Ket, Pengrajin, Rumus…',
      fields: [
        { n: 'dept', l: 'Departemen' }, { n: 'sstb', l: 'SSTB' },
        { n: 'kode_motif', l: 'Kode Motif' }, { n: 'motif', l: 'Motif' },
        { n: 'jenis', l: 'Jenis' }, { n: 'pengrajin', l: 'Nama Pengrajin' },
        { n: 'rumus', l: 'Rumus' }, { n: 'ket', l: 'Keterangan' }
      ].concat(this.keluar ? [{ n: 'link_produksi', l: 'Link Produksi' }] : []),
      rangeField: { n: 'jumlah', l: 'Jumlah' },
      sortFields: this.cols.map(([n, l]) => ({ n, l })),
      groupFields: [['sstb', 'SSTB'], ['tanggal', 'Tanggal'], ['dept', 'Dept'], ['kode_motif', 'Kode Motif'],
        ['motif', 'Motif'], ['jenis', 'Jenis'], ['pengrajin', 'Nama Pengrajin'], ['rumus', 'Rumus'], ['ket', 'Keterangan']]
        .map(([n, l]) => ({ n, l })),
      fetchDistinct: async col => await (await fetch(`/api/distinct/lines/${this.arah}?col=${col}&` + this.params())).json()
    };
    this.ready = this.init();
  }
  async init() { this.build(); await this.load(); }
  build() {
    this.msg = h('div', { class: 'msg' }); this.notify = makeNotifier(this.msg);
    this.impBox = h('div', { class: 'imp' });
    this.chips = h('div', { class: 'chips' });
    const fi = buildFilterToolbarItem(this, this.filterCfg);
    this.chipsRow = fi.chipsRow;
    const tb = h('div', { class: 'toolbar' },
      h('button', { class: 'btn primary', onclick: () => this.openForm() }, '+ Tambah ' + this.label),
      ...rangeInputs(this.range, () => { this.page = 1; this.load(); }),
      fi.btn,
      h('span', { class: 'grow' }));
    const io = ioTools(this.arah, () => this.load(), this.notify, this.impBox, true);
    this.exp = io.exp; tb.append(...io.els);
    this.theadRow = h('tr');
    for (const [n, l, k] of this.cols) this.theadRow.append(h('th', { class: k === 'int' ? 'num' : '' }, l));
    this.theadRow.append(h('th', {}, 'Aksi'));
    this.tbody = h('tbody'); this.pager = h('div', { class: 'pager' });
    this.table = h('table', { class: 'resp' }, h('thead', {}, this.theadRow), this.tbody);
    this.root.append(tb, this.chipsRow, this.chips, this.msg, this.impBox,
      h('div', { class: 'tablewrap' }, this.table), this.pager);
  }
  params(extra) {
    const p = new URLSearchParams(extra || {});
    for (const [k, v] of Object.entries(this.range)) if (v) p.set(k, v);
    const st = this.pstate;
    if (st.q) p.set('q', st.q);
    if (Object.keys(st.filters).length) p.set('filters', JSON.stringify(st.filters));
    if (Object.keys(st.ranges).length) p.set('ranges', JSON.stringify(st.ranges));
    if (st.sort) { p.set('sort', st.sort); p.set('dir', st.dir); }
    if (st.group) p.set('group', st.group);
    return p;
  }
  rowEl(row) {
    const tr = h('tr');
    for (const [n, l, k] of this.cols) {
      const v = row[n];
      tr.append(h('td', { class: k === 'int' ? 'num' : '', 'data-label': l }, k === 'int' ? fmtNum(v) : k === 'date' ? fmtDate(v) : v == null ? '' : v));
    }
    tr.append(h('td', { class: 'act', 'data-label': 'Aksi' },
      h('button', { class: 'btn sm', title: 'Edit seluruh SSTB ini', onclick: () => this.openForm(row.doc_id) }, 'Edit'), ' ',
      h('button', { class: 'btn sm', title: 'Cetak SSTB', onclick: () => this.printRow(row) }, 'Cetak'), ' ',
      h('button', { class: 'btn sm danger', onclick: () => this.delItem(row) }, 'Hapus')));
    return tr;
  }
  async load() {
    const r = await (await fetch(`/api/lines/${this.arah}?` + this.params({ page: this.page, size: this.size }))).json();
    this.exp.href = `/export/${this.arah}?` + this.params();
    this.chips.innerHTML = '';
    this.chips.append(h('span', { class: 'chip' }, h('b', {}, r.docs.toLocaleString('id-ID')), ' SSTB'),
      h('span', { class: 'chip' }, h('b', {}, r.total.toLocaleString('id-ID')), ' baris'),
      h('span', { class: 'chip big' }, 'Total jumlah ', h('b', {}, r.sum.toLocaleString('id-ID'))));
    const emptyMsg = filterActiveCount(this.pstate)
      ? 'Tidak ada data yang cocok dengan filter.'
      : 'Belum ada data pada rentang tanggal ini. Klik "+ Tambah ' + this.label + '".';
    renderGroupedTable(this.table, r.rows, this.pstate.group, this.cols.length + 1, row => this.rowEl(row), emptyMsg);
    this.tbody = this.table.querySelector('tbody');
    pagerInto(this.pager, this.page, r.pages, r.total, '', p => { this.page = p; this.load(); },
      this.size, n => { this.size = n; this.page = 1; this.load(); });
  }
  async printRow(row) {
    const d = await (await fetch(`/api/doc/${this.arah}/${row.doc_id}`)).json();
    printSSTB(d, this.label);
  }
  async delItem(row) {
    if (!confirm(`Hapus baris ${row.kode_motif} (${row.jumlah}) dari SSTB ${row.sstb}?`)) return;
    await fetch(`/api/item/${this.arah}/${row.id}`, { method: 'DELETE' }); this.load();
  }
  async openForm(docId) {
    let doc = null;
    if (docId) doc = await (await fetch(`/api/doc/${this.arah}/${docId}`)).json();
    const st = this.sticky, keluar = this.keluar;
    this.rows = []; const self = this;
    const fmsg = h('div', { class: 'msg' });
    const sstb = h('input', { type: 'text', autocomplete: 'off', placeholder: 'mis. 001/PCG-GRD/IX/2026' });
    const tgl = h('input', { type: 'date' });
    const dept = new Combo('dept'), peng = new Combo('pengrajin', { placeholder: 'Boleh kosong' });
    sstb.value = doc ? doc.sstb : ''; tgl.value = doc ? doc.tanggal : (st.tanggal || todayISO());
    dept.value = doc ? doc.dept : (st.dept || ''); peng.value = doc ? (doc.pengrajin || '') : '';
    const total = h('b', {}, '0');
    const itemsBox = h('div', { class: 'items' });
    const headLabels = ['Kode Motif', 'Motif · Jenis', 'Ket', 'Rumus', 'Jumlah'].concat(keluar ? ['Link Produksi'] : []).concat(['']);
    itemsBox.append(h('div', { class: 'irow ihead' + (keluar ? ' has-link' : '') }, ...headLabels.map(x => h('div', {}, x))));
    const upTotal = () => { total.textContent = this.rows.reduce((s, r) => s + (parseInt(r.jml.value) || 0), 0).toLocaleString('id-ID'); };
    const cell = (lab, el) => h('div', { class: 'cell' }, h('small', {}, lab), el);
    const stockHint = async r => {
      if (!keluar || !r.opt) { r.stock.textContent = ''; return; }
      const q = new URLSearchParams({ jenis: r.opt.jenis, tanggal: tgl.value, doc: docId || '' });
      const j = await (await fetch('/api/available?' + q)).json();
      r.stock.textContent = j.available == null ? '' : `Stok ${r.opt.jenis}: ${j.available.toLocaleString('id-ID')}`;
      r.stock.className = 'stock' + (j.available != null && j.available <= 0 ? ' low' : '');
    };
    const addRow = (it) => {
      const r = { opt: null };
      r.info = h('div', { class: 'info' }); r.stock = h('div', { class: 'stock' });
      r.rumus = h('span', { class: 'tag' }, '—');
      r.motif = new Combo('motif', {
        onPick: o => { r.opt = o; r.info.textContent = o ? `${o.motif} · ${o.jenis}` : ''; stockHint(r); }
      });
      r.ket = new Combo('ket', { onPick: o => { r.rumus.textContent = o ? o.kode : '—'; } });
      r.jml = h('input', { type: 'number', min: 1, inputmode: 'numeric', placeholder: '0' });
      if (keluar) r.link = new Combo('produksilink', { placeholder: 'Opsional — cari produksi sumbernya…' });
      r.jml.addEventListener('input', upTotal);
      r.jml.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return; e.preventDefault();
        const i = this.rows.indexOf(r);
        if (i === this.rows.length - 1) { if (r.jml.value) addRow().motif.focus(); } else this.rows[i + 1].motif.focus();
      });
      const cells = [cell('Kode Motif', r.motif.el), cell('Motif · Jenis', h('div', {}, r.info, r.stock)),
        cell('Ket', r.ket.el), cell('Rumus', r.rumus), cell('Jumlah', r.jml)];
      if (keluar) cells.push(cell('Link Produksi', r.link.el));
      r.el = h('div', { class: 'irow' + (keluar ? ' has-link' : '') }, ...cells,
        h('button', { type: 'button', class: 'btn sm danger rm', title: 'Hapus baris', onclick: () => {
          if (this.rows.length > 1) { this.rows.splice(this.rows.indexOf(r), 1); r.el.remove(); upTotal(); }
        } }, '×'));
      if (it) {
        r.motif.value = it.kode_motif; r.ket.value = it.ket; r.jml.value = it.jumlah;
        r.motif.snap(); r.ket.snap();
        if (keluar && r.link) { r.link.value = it.link_produksi || ''; if (it.link_produksi) r.link.snap(); }
      }
      this.rows.push(r); itemsBox.append(r.el); return r;
    };
    (doc && doc.items.length ? doc.items : [null]).forEach(addRow); upTotal();
    tgl.addEventListener('change', () => this.rows.forEach(stockHint));
    const lab = (t, el, cls) => h('label', { class: cls || '' }, t, el);
    const body = h('div', {}, fmsg,
      h('div', { class: 'form-grid' }, lab('SSTB *', sstb), lab('Tanggal *', tgl), lab('Dept *', dept.el), lab('Nama Pengrajin', peng.el)),
      h('h3', { class: 'sub' }, 'Barang dalam SSTB ini'), itemsBox,
      h('div', { class: 'items-foot' },
        h('button', { type: 'button', class: 'btn', onclick: () => addRow().motif.focus() }, '+ Tambah baris'),
        h('span', { class: 'grow' }), h('span', {}, 'Total SSTB: ', total)));
    const send = async again => {
      const payload = { sstb: sstb.value, tanggal: tgl.value, dept: dept.value, pengrajin: peng.value,
        items: this.rows.map(r => ({ kode_motif: r.motif.value, ket: r.ket.value, jumlah: r.jml.value,
          link_produksi: keluar && r.link ? r.link.value : '' })) };
      const res = await fetch(`/api/doc/${this.arah}` + (docId ? '/' + docId : ''), J(docId ? 'PUT' : 'POST', payload));
      const r = await res.json();
      if (!res.ok) {
        fmsg.className = 'msg err';
        fmsg.textContent = r.errors.map(e => (e.i == null ? '' : `Baris ${e.i + 1}: `) + e.msg).join('\n');
        fmsg.scrollIntoView({ block: 'nearest' }); return;
      }
      modal.close();
      const w = r.warnings || [];
      this.notify(w.length ? 'Tersimpan, tetapi perhatikan:\n' + w.join('\n') : `SSTB ${payload.sstb} tersimpan.`, w.length ? 'warn' : 'ok');
      if (!docId) this.sticky = { tanggal: payload.tanggal, dept: payload.dept };
      this.load(); if (again && !docId) this.openForm();
    };
    sstb.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.rows[0].motif.focus(); } });
    const foot = [];
    if (docId) {
      foot.push(h('button', { class: 'btn danger mr-auto', onclick: async () => {
        if (!confirm(`Hapus seluruh SSTB ${doc.sstb} beserta semua barisnya?`)) return;
        await fetch(`/api/doc/${this.arah}/${docId}`, { method: 'DELETE' }); modal.close(); this.load();
      } }, 'Hapus SSTB'));
      foot.push(h('button', { class: 'btn', onclick: () => printSSTB(doc, this.label) }, 'Cetak SSTB'));
    }
    foot.push(h('button', { class: 'btn', onclick: () => modal.close() }, 'Batal'));
    if (!docId) foot.push(h('button', { class: 'btn', onclick: () => send(true) }, 'Simpan & Tambah Lagi'));
    foot.push(h('button', { class: 'btn primary', onclick: () => send(false) }, docId ? 'Update' : 'Simpan'));
    const modal = openModal((docId ? 'Edit ' : 'Tambah ') + this.label + (docId ? ' — ' + doc.sstb : ''), body, foot);
    (docId ? this.rows[0].motif : sstb).focus();
  }
}
