/* Sesi habis (401): kembali ke halaman login. */
(() => {
  const orig = window.fetch.bind(window);
  window.fetch = async (...a) => {
    const r = await orig(...a);
    if (r.status === 401) { location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search); }
    return r;
  };
})();

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
const DEFAULT_DAYS = 1, PAGE_SIZES = [25, 50, 100];
const daysAgo = n => new Date(Date.now() - new Date().getTimezoneOffset() * 60000 - n * 864e5).toISOString().slice(0, 10);
const defaultFrom = () => daysAgo(DEFAULT_DAYS - 1);
const J = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const STATUSES = ['Pending', 'Proses', 'Selesai'];

/* ===== ikon, badge status, tombol aksi ===== */
const ICON = {
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
  del: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  print: '<svg viewBox="0 0 24 24"><path d="M7 9V3h10v6M7 17H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2M7 14h10v7H7z"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6zM14 3v5h5"/></svg>',
  dl: '<svg viewBox="0 0 24 24"><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14"/></svg>'
};
function ibtn(kind, title, onclick, href) {
  const e = h(href ? 'a' : 'button', { class: 'ibtn' + (kind === 'del' ? ' del' : (kind === 'print' ? ' mut' : '')), title, href: href || null, type: href ? null : 'button', onclick });
  e.innerHTML = ICON[kind]; return e;
}
const badge = v => { v = v || 'Selesai'; return h('span', { class: 'badge ' + String(v).toLowerCase() }, v); };

/* ===== kotak konfirmasi (pengganti confirm() bawaan browser): Promise<boolean> ===== */
function confirmBox(title, text, o = {}) {
  return new Promise(res => {
    const ov = h('div', { class: 'overlay center' });
    const done = v => { document.removeEventListener('keydown', key, true); ov.remove(); document.body.classList.remove('noscroll'); res(v); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
    const soft = o.danger === false;
    const ok = h('button', { type: 'button', class: 'btn ' + (soft ? 'primary' : 'danger solid'), onclick: () => done(true) }, o.ok || 'Hapus');
    const cancel = o.info ? null : h('button', { type: 'button', class: 'btn', onclick: () => done(false) }, o.cancel || 'Batal');
    ov.append(h('div', { class: 'modal confirm', role: 'alertdialog' },
      h('div', { class: 'cicon' + (soft ? ' warn' : '') }, soft ? '?' : '!'), h('h2', {}, title), h('p', {}, text),
      h('div', { class: 'cbtns' + (cancel ? '' : ' one') }, cancel, ok)));
    ov.addEventListener('mousedown', e => { if (e.target === ov) done(false); });
    document.body.append(ov); document.body.classList.add('noscroll'); document.addEventListener('keydown', key, true);
    (cancel || ok).focus();
  });
}
const confirmDelete = (text) => confirmBox('Konfirmasi Hapus Data', (text ? text + '\n' : '') + 'Tindakan ini tidak dapat dibatalkan.');

/* ===== kerangka halaman: menu samping (mobile) + menu pengguna ===== */
(() => {
  const mb = document.getElementById('menuBtn'), bg = document.getElementById('sideBg');
  if (mb) mb.onclick = () => document.body.classList.toggle('menu-open');
  if (bg) bg.onclick = () => document.body.classList.remove('menu-open');
  const stg = document.getElementById('sideToggle');
  if (stg) stg.onclick = () => {
    const on = document.body.classList.toggle('side-collapsed');
    try { localStorage.setItem('sideCollapsed', on ? '1' : '0'); } catch {}
  };
  const um = document.getElementById('userMenu'), ub = document.getElementById('userBtn');
  if (um && ub) {
    ub.onclick = e => { e.stopPropagation(); um.classList.toggle('open'); };
    document.addEventListener('click', e => { if (!um.contains(e.target)) um.classList.remove('open'); });
  }
})();

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
  disp(o) { return o.show != null ? o.show : o.v; }  // teks yang tampil di kotak (mis. SSTB saja); o.v tetap nilai lengkap yang dikirim
  get value() {
    const p = this.picked;
    return (p && p.show != null && this.input.value === p.show) ? p.v : this.input.value;
  }
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
    }, h('b', {}, this.disp(o)), o.sub ? h('span', {}, o.sub) : null)));
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
    this.input.value = this.disp(o); this.typing = false; this.input.classList.remove('bad'); this.picked = o; this.close();
    if (this.o.onPick) this.o.onPick(o);
  }
  async snap() {
    const v = this.input.value.trim();
    if (!v) { this.input.classList.remove('bad'); this.picked = null; if (this.o.onPick) this.o.onPick(null); return null; }
    const lv = v.toLowerCase();
    if (this.picked && this.picked.v && (this.picked.v.toLowerCase() === lv || this.disp(this.picked).toLowerCase() === lv)) {
      this.input.classList.remove('bad'); return this.picked;
    }
    const items = await this.fetchOpts(v);
    let f = items.find(x => x.v.toLowerCase() === lv);
    const idm = v.match(/#(\d+)\s*$/);  // label tersimpan 'xxx #id' -> cocokkan lewat id
    if (!f && idm) f = items.find(x => ((x.v.match(/#(\d+)\s*$/) || [])[1]) === idm[1]);
    if (!f) { const m = items.filter(x => this.disp(x).toLowerCase() === lv); if (m.length === 1) f = m[0]; }  // tampilan ganda = harus dipilih dari daftar
    if (f) { this.input.value = this.disp(f); this.picked = f; }
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
  let busy = false;  // cegah import ganda (klik/pilih file dua kali) yang menggandakan data
  file.onchange = async () => {
    if (!file.files[0] || busy) return;
    busy = true;
    const fd = new FormData(); fd.append('file', file.files[0]);
    try {
      const res = await fetch('/import/' + key, { method: 'POST', body: fd });
      let r; try { r = await res.json(); } catch (_) { r = null; }
      impBox.innerHTML = '';
      if (!r) { notify('Import gagal (respon server tidak valid, HTTP ' + res.status + ').', 'err'); return; }
      if (!res.ok) { notify((r.errors || [{ msg: r.error || 'Import gagal' }]).map(e => e.msg).join('\n'), 'err'); return; }
      const dup = r.duplicates ? `, ${r.duplicates} dilewati (sudah ada)` : '';
      const app = r.appended ? `, ${r.appended} SSTB lama ditambah motif baru` : '';
      const dupf = r.duplicates_in_file ? `, ${r.duplicates_in_file} dilewati (ganda di dalam file)` : '';
      notify(`Import selesai: ${r.inserted} ${r.unit} masuk${app}${dup}${dupf}, ${r.error_count} ditolak.`, r.error_count ? 'warn' : 'ok', true);
      for (const e of r.errors) impBox.append(h('div', {}, `Baris Excel ${e.row}: ${e.msg}`));
      onDone();
    } catch (err) {
      notify('Import gagal: ' + err, 'err');
    } finally {
      file.value = ''; busy = false;
    }
  };
  const exp = h('a', { class: 'btn', href: '#' }, 'Export Excel');
  return {
    exp,
    els: [h('button', { class: 'btn', onclick: () => file.click() }, 'Import Excel'), file,
          hideTemplate ? null : h('a', { class: 'btn', href: '/template/' + key }, 'Template'), exp].filter(Boolean)
  };
}
function pagerInto(el, page, pages, total, extra, go, size, onSize, unit) {
  el.innerHTML = '';
  const from = total ? (page - 1) * size + 1 : 0, to = Math.min(page * size, total);
  const id = n => n.toLocaleString('id-ID');
  const sel = h('select', { class: 'pgsize', title: 'Baris per halaman', onchange: () => onSize(parseInt(sel.value)) },
    PAGE_SIZES.map(n => h('option', { value: n, selected: n === size }, n + ' / halaman')));
  const want = new Set([1, pages, page - 1, page, page + 1].filter(n => n >= 1 && n <= pages));
  if (pages <= 7) for (let n = 1; n <= pages; n++) want.add(n);
  const nums = [...want].sort((a, b) => a - b);
  const pg = (label, n, on, dis) => h('button', { type: 'button', class: 'pg' + (on ? ' on' : ''), disabled: dis, onclick: () => go(n) }, label);
  const pgs = h('div', { class: 'pgs' }, pg('‹', page - 1, false, page <= 1));
  nums.forEach((n, i) => { if (i && n - nums[i - 1] > 1) pgs.append(h('span', { class: 'dots' }, '…')); pgs.append(pg(String(n), n, n === page, false)); });
  pgs.append(pg('›', page + 1, false, page >= pages));
  el.append(h('div', { class: 'info' }, `Menampilkan ${id(from)} - ${id(to)} dari ${id(total)} ${unit || 'data'}`, extra || ''), pgs, sel);
}
/* ===== Periode: Harian / Bulanan / Rentang tanggal (tgl x s/d y), default hari ini. Dipakai SEMUA halaman. =====
   Mengisi range.from & range.to (YYYY-MM-DD); onChange dipanggil setelah periode berubah. Tombol ‹ › menggeser satu periode. */
const ymd = d => d.toISOString().slice(0, 10);                       // d = Date UTC
const parseYmd = v => new Date(v + 'T00:00:00Z');
const addDays = (v, n) => { const d = parseYmd(v); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const monthRange = ym => {                                            // 'YYYY-MM' -> [awal, akhir bulan]
  const [y, m] = ym.split('-').map(Number);
  return [ym + '-01', ym + '-' + String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')];
};
const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return ymd(d).slice(0, 7); };
function periodPicker(range, onChange) {
  const sel = h('select', { title: 'Periode' }, [['harian', 'Harian'], ['bulanan', 'Bulanan'], ['rentang', 'Rentang tanggal']]
    .map(([v, l]) => h('option', { value: v }, l)));
  const day = h('input', { type: 'date' }), a = h('input', { type: 'date' }), b = h('input', { type: 'date' }), mon = h('input', { type: 'month' });
  const L = (t, el) => h('label', {}, t, el);
  const lDay = L('Tanggal', day), lMon = L('Bulan', mon), lA = L('Dari tgl', a), lB = L('Sampai tgl', b);
  const prev = h('button', { type: 'button', class: 'btn', title: 'Periode sebelumnya' }, '‹');
  const next = h('button', { type: 'button', class: 'btn', title: 'Periode berikutnya' }, '›');
  const today = h('button', { type: 'button', class: 'btn', title: 'Kembali ke hari ini' }, 'Hari ini');
  const fill = () => {   // tampilkan kontrol sesuai mode & isi dari range
    const m = sel.value;
    lDay.style.display = m === 'harian' ? '' : 'none'; lMon.style.display = m === 'bulanan' ? '' : 'none';
    lA.style.display = lB.style.display = m === 'rentang' ? '' : 'none';
    day.value = range.from; mon.value = range.from.slice(0, 7); a.value = range.from; b.value = range.to;
  };
  const fire = () => { fill(); onChange(); };
  const setMode = () => {   // ganti mode: pertahankan tanggal awal sebagai acuan
    const f = range.from;
    if (sel.value === 'harian') range.to = f;
    else if (sel.value === 'bulanan') [range.from, range.to] = monthRange(f.slice(0, 7));
    else if (range.to < f) range.to = f;
    fire();
  };
  sel.onchange = setMode;
  day.onchange = () => { if (!day.value) return fill(); range.from = range.to = day.value; fire(); };
  mon.onchange = () => { if (!mon.value) return fill(); [range.from, range.to] = monthRange(mon.value); fire(); };
  const rg = () => {   // tanggal tidak boleh kosong; bila terbalik, sisi lain ikut
    if (!a.value) a.value = range.from; if (!b.value) b.value = range.to;
    if (a.value > b.value) { if (document.activeElement === a) b.value = a.value; else a.value = b.value; }
    range.from = a.value; range.to = b.value; fire();
  };
  a.onchange = b.onchange = rg;
  const shift = n => {
    if (sel.value === 'harian') range.from = range.to = addDays(range.from, n);
    else if (sel.value === 'bulanan') [range.from, range.to] = monthRange(addMonths(range.from.slice(0, 7), n));
    else { const len = Math.round((parseYmd(range.to) - parseYmd(range.from)) / 864e5) + 1; range.from = addDays(range.from, n * len); range.to = addDays(range.to, n * len); }
    fire();
  };
  prev.onclick = () => shift(-1); next.onclick = () => shift(1);
  today.onclick = () => { const t = todayISO(); sel.value = 'harian'; range.from = range.to = t; fire(); };
  /* mode awal dari range: 1 hari = Harian, selain itu Rentang (mis. dibuka dari hyperlink SSTB) */
  if (!range.from) range.from = todayISO();
  if (!range.to) range.to = range.from;
  sel.value = range.from === range.to ? 'harian' : 'rentang';
  fill();
  return {
    els: [L('Periode', sel), lDay, lMon, lA, lB, h('div', { class: 'pbtns' }, prev, next, today)],
    set(from, to) { range.from = from; range.to = to || from; sel.value = range.from === range.to ? 'harian' : 'rentang'; fill(); },
    shift
  };
}
function rangeInputs(range, onChange) { return periodPicker(range, onChange).els; }
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
/* Kategori produksi = kolom produksi (Wadimor, Junior, ...): tampilkan hanya baris yang kolom itu terisi */
function katProdFilter(state, cols, onChange) {
  const sel = h('select', {}, h('option', { value: '' }, 'Semua Kategori'));
  for (const c of cols) sel.append(h('option', { value: c.n }, c.l));
  sel.addEventListener('change', () => { state.kat = sel.value; onChange(); });
  return h('label', { class: 'catfilter' }, 'Kategori', sel);
}
/* Tampil/sembunyikan kolom — dipakai SEMUA tabel (DB, Barang Masuk, Produksi + Rekap, Barang Keluar, Laporan Stok).
   Pilihan disimpan per tabel di browser (localStorage). Kolom "Aksi" selalu tampil. */
function colToggle(storeKey, onChange) {
  let vis;
  try { vis = JSON.parse(localStorage.getItem('colvis:' + storeKey)) || {}; } catch { vis = {}; }
  const save = () => { try { localStorage.setItem('colvis:' + storeKey, JSON.stringify(vis)); } catch {} };
  let cols = [];
  const pop = h('div', { class: 'colpop' });
  const btn = h('button', { type: 'button', class: 'btn', title: 'Tampilkan / sembunyikan kolom' }, 'Kolom ▾');
  const label = () => {
    const hid = cols.filter(c => vis[c.n] === false).length;
    btn.textContent = hid ? `Kolom (${hid} disembunyikan) ▾` : 'Kolom ▾';
  };
  const setCols = list => {
    cols = list; pop.innerHTML = '';
    // Pilih semua (centang = tampilkan semua kolom, hapus centang = sembunyikan semua; setengah = sebagian)
    const allCb = h('input', { type: 'checkbox' });
    const syncAll = () => {
      const shown = cols.filter(c => vis[c.n] !== false).length;
      allCb.checked = shown === cols.length; allCb.indeterminate = shown > 0 && shown < cols.length;
    };
    allCb.addEventListener('change', () => {
      for (const c of cols) { if (allCb.checked) delete vis[c.n]; else vis[c.n] = false; }
      save(); setCols(cols); onChange(vis);
    });
    pop.append(h('div', { class: 'colpop-act' }, h('label', { class: 'colitem', style: 'padding-left:0' }, allCb, h('b', {}, 'Pilih semua'))));
    for (const c of cols) {
      const cb = h('input', { type: 'checkbox', checked: vis[c.n] !== false });
      cb.addEventListener('change', () => { vis[c.n] = cb.checked; save(); label(); syncAll(); onChange(vis); });
      pop.append(h('label', { class: 'colitem' }, cb, c.l));
    }
    syncAll(); label();
  };
  btn.addEventListener('click', e => { e.stopPropagation(); pop.classList.toggle('open'); });
  document.addEventListener('click', e => { if (!pop.contains(e.target) && e.target !== btn) pop.classList.remove('open'); });
  /* terapkan ke tabel: sel ke-i = kolom ke-i; baris judul kelompok / "belum ada data" dilewati */
  const apply = table => {
    if (!table) return;
    table.querySelectorAll('tr').forEach(tr => {
      if (tr.classList.contains('grouphead') || tr.querySelector('td.empty')) return;
      [...tr.children].forEach((c, i) => { const j = i - api.offset; if (j >= 0 && j < cols.length) c.style.display = vis[cols[j].n] === false ? 'none' : ''; });
    });
  };
  const api = { el: h('div', { class: 'colcheck' }, btn, pop), vis, setCols, apply, offset: 0 };  // offset = jumlah sel di depan yang bukan kolom data (checkbox Pilih)
  return api;
}

/* judul kolom tabel: teks, klik = urutkan asc/desc (tabel master DB saja; halaman lain pakai panel Filter) */
function thCell(label, opts) {
  const { align, sortOn, onSort } = opts || {};
  const lab = h('span', { class: 'th-label', onclick: onSort }, label, sortOn ? h('i', { class: 'th-sort' }, sortOn === 'asc' ? ' \u25B2' : ' \u25BC') : null);
  return h('th', { class: align || '' }, h('span', { class: 'th-wrap' }, lab));
}
/* cetak SSTB: judul, keterangan (No SSTB, Tanggal, Dari, Ke), daftar barang (No, Motif, Satuan, Jumlah) dan tanda tangan
   (Yang Menyerahkan / Yang Menerima) semuanya dalam SATU tabel.
   Keluar: Dari GRADE PACK -> Keluar ke <dept>. Masuk: Dari <dept> -> Masuk ke GRADE PACK. */
const GRADE_PACK = 'GRADE PACK', SATUAN_CETAK = 'PCS';
function printSSTB(doc, label, arah) {
  const keluar = arah ? arah === 'keluar' : /keluar/i.test(label || '');
  const items = doc.items || [];
  const dari = keluar ? GRADE_PACK : (doc.dept || '-'), ke = keluar ? (doc.dept || '-') : GRADE_PACK;
  const rows = items.map((it, i) => `<tr><td class="c">${i + 1}.</td>
    <td>${esc(it.kode_motif)}${it.nama_motif ? ' &ndash; ' + esc(it.nama_motif) : ''}</td>
    <td class="c">${esc(SATUAN_CETAK)}</td><td class="num">${fmtNum(it.jumlah)}</td></tr>`).join('');
  const total = items.reduce((s, it) => s + (parseInt(it.jumlah) || 0), 0);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>SSTB ${esc(doc.sstb)}</title>
<style>
/* Kertas A4 potret; satu tabel saja, tinggi menyesuaikan jumlah barang supaya data tidak terpotong */
@page{size:A4 portrait;margin:0}
*{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}
html,body{margin:0;color:#111;background:#ccc}
.sheet{width:210mm;min-height:148.5mm;margin:0 auto;padding:14mm 16mm;background:#fff}
table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #222;padding:5px 8px;vertical-align:top;overflow-wrap:break-word;word-break:break-word}
td.title{text-align:center;font-size:15px;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;padding:9px 8px}
td.title small{display:block;font-size:11.5px;font-weight:normal;letter-spacing:0;text-transform:none;color:#444;margin-top:2px}
th{background:#eee;text-align:center}
td.c{text-align:center}td.num{text-align:right}
td.info b{display:inline-block;min-width:62px}
tr.total td{font-weight:bold;background:#f5f5f5}
td.sig{height:34mm;text-align:center;vertical-align:top;padding-top:6px}
td.sig span{display:block;margin-top:24mm;border-top:1px solid #222;padding-top:3px;font-size:11px}
.foot{margin-top:6px;font-size:9px;color:#777;text-align:right}
@media print{html,body{background:#fff}.sheet{margin:0;box-shadow:none}}
@media screen{body{padding:10mm 0}.sheet{box-shadow:0 2px 10px rgba(0,0,0,.25)}}
</style></head><body>
<div class="sheet">
<table>
<colgroup><col style="width:9%"><col><col style="width:16%"><col style="width:17%"></colgroup>
<tbody>
<tr><td class="title" colspan="4">Surat Serah Terima Barang<small>${esc(label)}</small></td></tr>
<tr><td class="info" colspan="2"><b>No SSTB</b>: ${esc(doc.sstb)}</td><td class="info" colspan="2"><b>Tanggal</b>: ${fmtDate(doc.tanggal)}</td></tr>
<tr><td class="info" colspan="2"><b>Dari</b>: ${esc(dari)}</td><td class="info" colspan="2"><b>${keluar ? 'Keluar ke' : 'Masuk ke'}</b>: ${esc(ke)}</td></tr>
${doc.pengrajin ? `<tr><td class="info" colspan="4"><b>Pengrajin</b>: ${esc(doc.pengrajin)}</td></tr>` : ''}
<tr><th>No</th><th>Motif</th><th>Satuan</th><th>Jumlah</th></tr>
${rows}
<tr class="total"><td colspan="3">TOTAL</td><td class="num">${fmtNum(total)}</td></tr>
<tr><td class="sig" colspan="2">Yang Menyerahkan<span>&nbsp;</span></td><td class="sig" colspan="2">Yang Menerima<span>&nbsp;</span></td></tr>
</tbody></table>
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
/* ===== Filter overlay terpadu: SATU tombol "Filter" di semua halaman & sub-menu =====
   Isi panel (muncul menimpa halaman, bukan di toolbar): Periode · Cari · Group By (boleh lebih dari satu, urutan = urutan klik)
   · filter per field · rentang Jumlah · Urutkan · isian tambahan khusus halaman.
   inst: objek dengan inst.pstate ({q,filters,ranges,sort,dir,group}) dan, bila ada periode, inst.range ({from,to}).
   cfg : title, range (override), noRange, groupFields (array / fungsi), defaultGroup, searchPlaceholder, fields, fetchDistinct,
         rangeField, sortFields, extra() -> {els, apply(), reset(), active()}, onApply() (bila kosong: inst.page=1; inst.load()). */
function filterPanel(inst, cfg) {
  const st = inst.pstate;
  const range = cfg.range || (inst.range && !cfg.noRange ? inst.range : null);
  const btn = h('button', { type: 'button', class: 'btn fbtn', title: 'Periode, Group By, dan filter lainnya' }, '🔍 Filter');
  const chipsRow = h('div', { class: 'chips filterchips' });
  const gfields = () => (typeof cfg.groupFields === 'function' ? cfg.groupFields() : cfg.groupFields) || null;
  const gList = () => (st.group || '').split(',').filter(Boolean);
  const nameOf = (list, n) => ((list || []).find(f => f.n === n) || { l: n }).l;
  const run = () => { refresh(); if (cfg.onApply) cfg.onApply(); else { inst.page = 1; inst.load(); } };
  function refresh() {
    const gOn = gfields() && st.group && st.group !== (cfg.defaultGroup || '');
    const n = filterActiveCount(st) - (st.group ? 1 : 0) + (gOn ? gList().length : 0);
    btn.textContent = n ? `🔍 Filter (${n})` : '🔍 Filter';
    chipsRow.innerHTML = '';
    const chips = [];
    if (range) chips.push('Periode: ' + (range.from === range.to ? fmtDate(range.from) : fmtDate(range.from) + ' – ' + fmtDate(range.to)));
    if (st.q) chips.push(`Cari: "${st.q}"`);
    for (const [k, v] of Object.entries(st.filters)) chips.push(`${nameOf(cfg.fields, k)}: ${v[0]}`);
    for (const [k, r] of Object.entries(st.ranges))
      if (r && (r.min !== undefined || r.max !== undefined)) chips.push(`${cfg.rangeField ? cfg.rangeField.l : k}: ${r.min ?? ''}–${r.max ?? ''}`);
    if (st.sort) chips.push(`Urut: ${nameOf(cfg.sortFields, st.sort)} ${st.dir === 'asc' ? '↑' : '↓'}`);
    const gf = gfields();
    if (gf && gList().length) chips.push('Group By: ' + gList().map(g => nameOf(gf, g)).join(' › '));
    if (cfg.extra) { const x = cfg.extra(); if (x.chip) { const c = x.chip(); if (c) chips.push(c); } }
    for (const c of chips) chipsRow.append(h('span', { class: 'chip' }, c));
  }
  function open() {
    if (document.querySelector('.fpanel')) return;
    const snap = range ? { from: range.from, to: range.to } : null;
    const gf = gfields();
    let pick = gList();
    const sec = (t, ...kids) => h('section', { class: 'fsec' }, h('h4', {}, t), ...kids);
    const body = h('div', { class: 'fbody' });
    if (range) body.append(sec('Periode', h('div', { class: 'fgrid' }, ...periodPicker(range, () => {}).els)));
    let qInput;
    if (cfg.searchPlaceholder) {
      qInput = h('input', { type: 'text', value: st.q, placeholder: cfg.searchPlaceholder });
      body.append(sec('Cari', qInput));
    }
    let gbox;
    if (gf) {
      gbox = h('div', { class: 'gchecks' });
      const draw = () => {
        gbox.innerHTML = '';
        // Pilih semua / hapus semua (urutan yang sudah dipilih dipertahankan, sisanya ditambahkan sesuai urutan daftar)
        const all = h('input', { type: 'checkbox', checked: pick.length === gf.length });
        all.indeterminate = pick.length > 0 && pick.length < gf.length;
        all.onchange = () => { pick = all.checked ? pick.concat(gf.map(f => f.n).filter(n => !pick.includes(n))) : []; draw(); };
        gbox.append(h('label', { class: 'gitem gall' + (pick.length === gf.length ? ' on' : '') }, all, 'Pilih semua'));
        for (const f of gf) {
          const i = pick.indexOf(f.n);
          const cb = h('input', { type: 'checkbox', checked: i >= 0 });
          cb.onchange = () => { pick = cb.checked ? pick.concat(f.n) : pick.filter(x => x !== f.n); draw(); };
          gbox.append(h('label', { class: 'gitem' + (i >= 0 ? ' on' : '') }, cb, f.l, i >= 0 ? h('i', { class: 'gord' }, String(i + 1)) : ''));
        }
      };
      draw();
      body.append(sec('Group By', h('small', { class: 'hint', style: 'margin:0 0 8px;display:block' },
        'Boleh pilih lebih dari satu; urutan angka = urutan pengelompokan (kiri ke kanan).'), gbox));
    }
    const selects = {};
    if (cfg.fields && cfg.fields.length) {
      const grid = h('div', { class: 'fgrid' });
      for (const f of cfg.fields) {
        const sel = h('select', {}, h('option', { value: '' }, 'Semua')); sel.disabled = true; selects[f.n] = sel;
        grid.append(h('label', {}, f.l, sel));
        Promise.resolve(cfg.fetchDistinct(f.n)).then(vals => {
          sel.disabled = false; const cur = (st.filters[f.n] || [])[0];
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
      body.append(sec('Filter', grid));
      body._rng = [minInp, maxInp];
    }
    let sortSel, dirSel;
    if (cfg.sortFields && cfg.sortFields.length) {
      sortSel = h('select', {}, h('option', { value: '' }, 'Default'), cfg.sortFields.map(f => h('option', { value: f.n, selected: st.sort === f.n }, f.l)));
      dirSel = h('select', {}, h('option', { value: 'desc', selected: st.dir !== 'asc' }, 'Descending ↓'), h('option', { value: 'asc', selected: st.dir === 'asc' }, 'Ascending ↑'));
      body.append(sec('Urutkan', h('div', { class: 'fgrid' }, h('label', {}, 'Urut berdasarkan', sortSel), h('label', {}, 'Urutan', dirSel))));
    }
    const ex = cfg.extra ? cfg.extra() : null;
    if (ex && ex.els) body.append(sec('Lainnya', h('div', { class: 'fgrid' }, ...ex.els)));

    let closed = false;
    const close = cancel => {
      if (closed) return; closed = true;
      if (cancel && snap) { range.from = snap.from; range.to = snap.to; }
      document.removeEventListener('keydown', onKey); back.remove(); pop.remove();
    };
    const onKey = e => { if (e.key === 'Escape') close(true); };
    const apply = () => {
      if (qInput) st.q = qInput.value.trim();
      if (gbox) st.group = pick.join(',');
      if (cfg.fields) {
        st.filters = {};
        for (const f of cfg.fields) if (selects[f.n].value) st.filters[f.n] = [selects[f.n].value];
        st.ranges = {};
        if (cfg.rangeField && body._rng) {
          const [mn, mx] = body._rng, r = {};
          if (mn.value !== '') r.min = mn.value; if (mx.value !== '') r.max = mx.value;
          if (r.min !== undefined || r.max !== undefined) st.ranges[cfg.rangeField.n] = r;
        }
      }
      if (sortSel) { st.sort = sortSel.value; st.dir = dirSel.value; }
      if (ex && ex.apply) ex.apply();
      close(false); run();
    };
    const reset = () => {
      const keepRange = range ? { from: range.from, to: range.to } : null;
      Object.assign(st, newFilterState()); st.group = cfg.defaultGroup || '';
      if (ex && ex.reset) ex.reset();
      if (keepRange) { range.from = keepRange.from; range.to = keepRange.to; }
      close(false); run();
    };
    const back = h('div', { class: 'fback', onclick: () => close(true) });
    const pop = h('div', { class: 'fpanel', role: 'dialog', 'aria-label': 'Filter ' + (cfg.title || '') },
      h('div', { class: 'fhead' }, h('b', {}, 'Filter' + (cfg.title ? ' — ' + cfg.title : '')),
        h('button', { type: 'button', class: 'ibtn mut', title: 'Tutup', onclick: () => close(true) }, '✕')),
      body,
      h('div', { class: 'ffoot' },
        h('button', { type: 'button', class: 'btn', onclick: reset }, 'Reset'), h('span', { class: 'grow' }),
        h('button', { type: 'button', class: 'btn', onclick: () => close(true) }, 'Batal'),
        h('button', { type: 'button', class: 'btn primary', onclick: apply }, 'Terapkan')));
    document.body.append(back, pop);
    document.addEventListener('keydown', onKey);
    const r = btn.getBoundingClientRect(), w = Math.min(600, innerWidth - 24);
    pop.style.width = w + 'px';
    pop.style.left = Math.max(12, Math.min(r.left, innerWidth - w - 12)) + 'px';
    const top = r.bottom + 6 > innerHeight - 320 ? 12 : r.bottom + 6;
    pop.style.top = top + 'px'; pop.style.maxHeight = (innerHeight - top - 16) + 'px';
    if (qInput) qInput.focus();
  }
  btn.addEventListener('click', open);
  inst._refreshFilterUI = refresh;
  refresh();
  return { btn, chipsRow, refresh, open };
}
function buildFilterToolbarItem(inst, cfg) {   // dipakai Crud (Produksi) & DocPage (Barang Masuk/Keluar)
  const p = filterPanel(inst, cfg);
  return { btn: p.btn, chipsRow: p.chipsRow };
}

/* sel-sel kolom pengelompok pada tabel rekap (1 kolom per dimensi Group By). dims: [{k,l}] dari API; baris: x.grp (1 dimensi) / x.g0..gN (ganda) */
function grpHeads(dims, cls) { return dims.map(d => h('th', { class: cls || '' }, d.l)); }
function grpTds(dims, x) {
  return dims.map((d, i) => {
    let v = dims.length > 1 ? x['g' + i] : x.grp;
    if (x.total && dims.length > 1 && i > 0) v = '';
    else if (v == null) v = '';
    else if (!x.total && !x.awal) v = (d.k === 'tgl_masuk_sanggan' && v === '-') ? '(tanpa tgl masuk sanggan)' : (/^\d{4}-\d\d-\d\d$/.test(v) ? fmtDate(v) : v);
    return h('td', { 'data-label': d.l }, v);
  });
}

/* ===== Sub-menu sidebar: ?v=<tampilan>. Halaman memanggil pageViews(); klik sub-menu di halaman yang sama = ganti tampilan tanpa reload ===== */
function navMark(v) {
  document.querySelectorAll('.subnav a').forEach(a => a.classList.toggle('on', a.dataset.v === v && a.closest('.navg').classList.contains('open')));
}
function pageViews(items, onPick) {
  const valid = v => items.some(i => i[0] === v);
  const fromUrl = () => { const v = new URLSearchParams(location.search).get('v'); return valid(v) ? v : items[0][0]; };
  let cur = null;
  const set = (v, mode) => {
    if (!valid(v)) v = items[0][0];
    cur = v; navMark(v);
    if (mode) { const u = new URL(location.href); u.searchParams.set('v', v); history[mode === 'push' ? 'pushState' : 'replaceState']({}, '', u); }
    onPick(v);
  };
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('.subnav a');
    if (!a || a.pathname !== location.pathname || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault(); document.body.classList.remove('menu-open'); set(a.dataset.v, 'push');
  });
  window.addEventListener('popstate', () => set(fromUrl()));
  set(fromUrl());
  return { set: v => set(v, 'replace'), get value() { return cur; } };
}
/* buka/tutup grup sub-menu: klik panah = buka/tutup; klik induk di halaman aktif = buka/tutup */
document.addEventListener('click', e => {
  const p = e.target.closest && e.target.closest('.navp'); if (!p) return;
  const g = p.closest('.navg'), onChev = e.target.closest('.chev');
  if (onChev || g.classList.contains('open') && p.dataset.k === g.dataset.cur) { e.preventDefault(); g.classList.toggle('open'); }
});


/* ===== Pilih (checkbox) + Hapus terpilih. Pilihan hanya untuk baris di halaman yang tampil; hilang saat data dimuat ulang. =====
   o: { unit:'baris'|'SSTB', url:'/api/.../bulk_delete', notify(text, cls), onDone() } */
class RowSelect {
  constructor(o) {
    this.o = o; this.sel = new Set(); this.cbs = []; this.last = -1; this.allCb = null;
    this.count = h('b', {}, '0');
    this.btn = h('button', { type: 'button', class: 'btn sm danger', onclick: () => this.del() }, 'Hapus terpilih');
    this.bar = h('div', { class: 'selbar', style: 'display:none' }, this.count, ` ${o.unit} dipilih`, this.btn,
      h('button', { type: 'button', class: 'btn sm', onclick: () => this.clear() }, 'Batal pilih'));
  }
  reset() { this.sel.clear(); this.cbs = []; this.last = -1; this.update(); }
  clear() { this.cbs.forEach(x => { x.cb.checked = false; }); this.sel.clear(); this.last = -1; this.update(); }
  head() {   // sel judul kolom: pilih / batal pilih semua baris di halaman ini
    const cb = h('input', { type: 'checkbox', title: 'Pilih semua di halaman ini' });
    cb.onchange = () => {
      for (const x of this.cbs) { x.cb.checked = cb.checked; cb.checked ? this.sel.add(x.id) : this.sel.delete(x.id); }
      this.update();
    };
    this.allCb = cb;
    return h('th', { class: 'selcol nosort' }, cb);
  }
  cell(id) {
    const cb = h('input', { type: 'checkbox', title: 'Pilih baris ini (Shift+klik = pilih rentang)' });
    const rec = { id, cb }; this.cbs.push(rec);
    cb.onclick = e => {   // Shift+klik: pilih semua baris antara klik terakhir dan yang ini
      const i = this.cbs.indexOf(rec);
      if (e.shiftKey && this.last >= 0) {
        const [a, b] = [Math.min(i, this.last), Math.max(i, this.last)];
        for (let k = a; k <= b; k++) { this.cbs[k].cb.checked = cb.checked; cb.checked ? this.sel.add(this.cbs[k].id) : this.sel.delete(this.cbs[k].id); }
      }
      this.last = i;
    };
    cb.onchange = () => { cb.checked ? this.sel.add(id) : this.sel.delete(id); this.update(); };
    return h('td', { class: 'selcol', 'data-label': 'Pilih' }, cb);
  }
  update() {
    const n = this.sel.size;
    this.count.textContent = n.toLocaleString('id-ID');
    this.bar.style.display = n ? '' : 'none';
    if (this.allCb) {
      this.allCb.checked = this.cbs.length > 0 && n >= this.cbs.length && this.cbs.every(x => x.cb.checked);
      this.allCb.indeterminate = n > 0 && !this.allCb.checked;
    }
  }
  async del() {
    const ids = [...this.sel]; if (!ids.length) return;
    if (!(await confirmDelete(`${ids.length} ${this.o.unit} terpilih akan dihapus.` + (this.o.unit === 'SSTB' ? '\nSeluruh barang di dalam SSTB itu ikut terhapus.' : '')))) return;
    this.btn.disabled = true;
    try {
      const res = await fetch(this.o.url, J('POST', { ids }));
      const r = await res.json();
      if (!res.ok) { this.o.notify(r.error || 'Hapus gagal', 'err'); return; }
      const f = r.failed || [];
      if (f.length) this.o.notify(`${r.deleted} ${this.o.unit} dihapus, ${f.length} dilewati:\n` + [...new Set(f.map(x => x.msg))].join('\n'), 'warn', true);
      else this.o.notify(`${r.deleted} ${this.o.unit} dihapus.`, 'ok');
      this.reset(); this.o.onDone();
    } finally { this.btn.disabled = false; }
  }
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
  const gcols = String(groupCol).split(',').filter(Boolean);
  const keyOf = row => gcols.map(c => { const v = row[c]; return v ? (/^\d{4}-\d\d-\d\d$/.test(v) ? fmtDate(v) : v) : '(kosong)'; }).join(' · ');
  const counts = {};
  for (const row of rows) { const k = keyOf(row); counts[k] = (counts[k] || 0) + 1; }
  let curKey = null, tb = null;
  for (const row of rows) {
    const key = keyOf(row);
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
    this.rs = new RowSelect({ unit: 'baris', notify: (t, c, st) => this.notify(t, c, st),
      url: '/api/' + key + '/bulk_delete', onDone: () => { this.load(); if (this.o.onChange) this.o.onChange(); } });
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
    if (m.datecol && !this.o.noRange && !this.pstate) tb.append(...rangeInputs(this.range, () => { this.page = 1; this.load(); }));
    if (this.pstate) {
      tb.append(h('span', { class: 'grow' }));
      const io = ioTools(this.key, () => { this.load(); if (this.o.onChange) this.o.onChange(); }, this.notify, this.impBox, true);
      this.exp = io.exp;
      const fi = buildFilterToolbarItem(this, Object.assign({ noRange: !m.datecol || !!this.o.noRange }, this.o.filterPanel));
      tb.prepend(fi.btn); tb.append(...io.els);
      this.chipsRow = fi.chipsRow;
      this.ct = colToggle(this.key, () => this.applyVis()); this.ct.offset = 1; this.ct.setCols(m.cols); tb.append(this.ct.el);
    } else {
      tb.append(searchBox(this.qstate, () => { this.page = 1; this.load(); }));
      if (this.key === 'opening_prod') tb.append(katProdFilter(this.catstate, m.cols.filter(c => c.cat), () => { this.page = 1; this.load(); }));
      else if (JENIS_FILTER_KEYS.includes(this.key)) tb.append(categoryFilter(this.catstate, () => { this.page = 1; this.load(); }));
      tb.append(h('span', { class: 'grow' }));
      const io = ioTools(this.key, () => { this.load(); if (this.o.onChange) this.o.onChange(); }, this.notify, this.impBox);
      this.exp = io.exp; tb.append(...io.els);
      this.ct = colToggle(this.key, () => this.applyVis()); this.ct.offset = 1; this.ct.setCols(m.cols); tb.append(this.ct.el);
    }
    this.thead = h('thead'); this.theadRow = h('tr'); this.thead.append(this.theadRow); this.tbody = h('tbody');
    this.table = h('table', { class: 'resp' }, this.thead, this.tbody);
    if (this.pstate) {
      this.theadRow.append(this.rs.head());
      for (const c of m.cols) this.theadRow.append(h('th', { class: this.isInt(c) ? 'num' : '' }, c.l));
      this.theadRow.append(h('th', { class: 'act' }, 'Aksi'));
    } else {
      this.refreshHead();
    }
    this.pager = h('div', { class: 'pager' });
    this.root.append(tb, this.chipsRow || '', this.msg, this.rs.bar, this.impBox,
      h('div', { class: 'tablewrap' }, this.table), this.pager);
  }
  refreshHead() {
    this.theadRow.innerHTML = '';
    this.theadRow.append(this.rs.head());
    for (const c of this.meta.cols) this.theadRow.append(thCell(c.l, {
      align: this.isInt(c) ? 'num' : '', sortOn: this.sort === c.n ? this.dir : null,
      onSort: () => { this.dir = (this.sort === c.n && this.dir === 'desc') ? 'asc' : 'desc'; this.sort = c.n; this.load(); }
    }));
    this.theadRow.append(h('th', { class: 'act' }, 'Aksi'));
  }
  applyVis() { if (this.ct) this.ct.apply(this.table); }
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
      if (this.catstate.kat) p.set('kat', this.catstate.kat);
      if (Object.keys(this.filters).length) p.set('filters', JSON.stringify(this.filters));
      if (this.sort) { p.set('sort', this.sort); p.set('dir', this.dir); }
    }
    return p;
  }
  isInt(c) { return c.t === 'int' || c.num; }
  rowEl(row) {
    const tr = h('tr');
    tr.append(this.rs.cell(row.id));
    for (const c of this.meta.cols) {
      const v = row[c.n];
      let cell = this.isInt(c) ? fmtNum(v) : c.t === 'date' ? fmtDate(v) : c.t === 'enum' ? badge(v) : v == null ? '' : v;
      if (c.t === 'linkref' && v) {  // Link Barang Masuk: tampilkan SSTB saja, klik = buka Barang Masuk SSTB itu
        const sstb = String(v).replace(/\s*#\d+\s*$/, '');
        cell = h('a', { class: 'lnk', href: '/masuk?sstb=' + encodeURIComponent(sstb), title: 'Buka Barang Masuk ' + sstb }, sstb);
      }
      tr.append(h('td', { class: this.isInt(c) ? 'num' : '', 'data-label': c.l }, cell));
    }
    tr.append(h('td', { class: 'act', 'data-label': 'Aksi' },
      ibtn('edit', 'Edit', () => this.openForm(row)), ibtn('del', 'Hapus', () => this.del(row))));
    return tr;
  }
  async load() {
    if (!this.pstate) this.refreshHead();
    const r = await (await fetch('/api/' + this.key + '?' + this.params({ page: this.page, size: this.size }))).json();
    this.exp.href = '/export/' + this.key + '?' + this.params();
    this.rs.reset();
    const filterActive = this.pstate ? filterActiveCount(this.pstate) > 0
      : (this.qstate.q || this.catstate.jenis || this.catstate.kat || Object.keys(this.filters).length);
    const emptyMsg = filterActive ? 'Tidak ada data yang cocok dengan filter.' : 'Belum ada data.';
    renderGroupedTable(this.table, r.rows, this.pstate ? this.pstate.group : null, this.meta.cols.length + 2,
      row => this.rowEl(row), emptyMsg);
    this.tbody = this.table.querySelector('tbody');
    pagerInto(this.pager, this.page, r.pages, r.total, r.sum != null ? ` · Total jumlah: ${r.sum.toLocaleString('id-ID')}` : '',
      p => { this.page = p; this.load(); }, this.size, n => { this.size = n; this.page = 1; this.load(); });
    this.applyVis();
  }
  recalcSum() {
    if (this.f.jumlah && (this.key === 'produksi' || this.key === 'opening_prod'))
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
      } else if (c.t === 'enum') {
        ctl = h('select', {}, (c.opts || []).map(o => h('option', { value: o }, o))); el = ctl;
      } else {
        ctl = h('input', {
          type: c.t === 'date' ? 'date' : c.t === 'int' ? 'number' : 'text', min: c.t === 'int' ? 0 : null,
          inputmode: c.t === 'int' ? 'numeric' : null, readonly: c.t === 'auto' || c.ro, class: (c.t === 'auto' || c.ro) ? 'auto' : '',
          autocomplete: 'off', tabindex: c.t === 'auto' ? -1 : null
        });
        if (c.t !== 'auto') ctl.addEventListener('keydown', onEnter);
        if ((this.key === 'produksi' || this.key === 'opening_prod') && m.cats.includes(c.n)) ctl.addEventListener('input', () => this.recalcSum());
        el = ctl;
      }
      this.f[c.n] = ctl;
      grid.append(h('label', { class: c.n === 'catatan' ? 'span2' : '' }, c.l + (c.req ? ' *' : ''), el));
    }
    for (const c of m.cols) {
      let v = row ? row[c.n] : (this.sticky[c.n] != null ? this.sticky[c.n] : (c.n === 'tgl_produksi' ? todayISO() : ''));
      if (c.t === 'auto') continue;
      if (c.t === 'enum' && !v) v = 'Selesai';
      this.f[c.n].value = v == null ? '' : v;
    }
    this.recalcSum();
    const btnCancel = h('button', { class: 'btn', onclick: () => modal.close() }, 'Batal');
    const foot = [btnCancel];
    const btnAgain = editId ? null : h('button', { class: 'btn', onclick: () => this.save(true) }, 'Simpan & Tambah Lagi');
    const btnSave = h('button', { class: 'btn primary', onclick: () => this.save(false) }, editId ? 'Update' : 'Simpan');
    if (btnAgain) foot.push(btnAgain);
    foot.push(btnSave);
    this.footBtns = [btnAgain, btnSave].filter(Boolean);  // dikunci selama request berjalan (cegah input double)
    this.saving = false;
    const modal = openModal((editId ? 'Edit ' : 'Tambah ') + m.title, h('div', {}, fmsg, grid,
      editId ? null : h('p', { class: 'hint' }, 'Enter = simpan & tambah lagi. Kolom abu-abu terisi otomatis.')), foot);
    this.modal = modal; this.fmsg = fmsg; this.editId = editId;
    const first = m.cols.find(c => c.t !== 'auto' && !this.f[c.n].value);
    (this.f[(first || m.cols[0]).n]).focus();
  }
  async save(again) {
    if (this.saving) return;  // klik ganda / Enter ditahan: satu request saja
    this.saving = true;
    const btns = this.footBtns || [];
    btns.forEach(b => { b.disabled = true; });
    const m = this.meta, body = {};
    for (const c of m.cols) if (c.t !== 'auto') body[c.n] = this.f[c.n].value;
    const editId = this.editId;
    let res, r;
    try {
      res = await fetch('/api/' + this.key + (editId ? '/' + editId : ''), J(editId ? 'PUT' : 'POST', body));
      r = await res.json();
    } catch (err) {
      this.saving = false; btns.forEach(b => { b.disabled = false; });
      this.fmsg.className = 'msg err'; this.fmsg.textContent = 'Gagal menyimpan: ' + err;
      return;
    }
    if (!res.ok) {
      this.saving = false; btns.forEach(b => { b.disabled = false; });
      this.fmsg.className = 'msg err'; this.fmsg.textContent = (r.errors || [r.error || 'Gagal menyimpan']).join('\n'); return;
    }
    if (!editId && this.key === 'produksi')
      this.sticky = { tgl_produksi: body.tgl_produksi, tgl_masuk_sanggan: body.tgl_masuk_sanggan, nama: body.nama, pasangan: body.pasangan };
    this.modal.close(); this.notify('Tersimpan.', 'ok');
    this.load(); if (this.o.onChange) this.o.onChange();
    if (again && !editId) this.openForm();
  }
  async del(row) {
    if (!(await confirmDelete('Data ini akan dihapus secara permanen.'))) return;
    const res = await fetch(`/api/${this.key}/${row.id}`, { method: 'DELETE' });
    if (!res.ok) { const r = await res.json(); this.notify(r.errors.join('\n'), 'err'); return; }
    this.load(); if (this.o.onChange) this.o.onChange();
  }
}

/* ===== DocPage: Barang Masuk / Barang Keluar (1 SSTB = 1 dokumen, banyak baris) ===== */
const DOC_COLS_BASE = [['sstb', 'SSTB'], ['tanggal', 'Tanggal', 'date'], ['dept', 'Dept'], ['kode_motif', 'Kode Motif'],
  ['motif', 'Motif'], ['jenis', 'Jenis'], ['jumlah', 'Jumlah', 'int'], ['ket', 'Ket'], ['pengrajin', 'Nama Pengrajin'], ['rumus', 'Rumus']];

class DocPage {
  constructor(root, arah, init) {
    init = init || {};
    this.root = root; this.arah = arah; this.keluar = arah === 'keluar';
    this.label = arah === 'masuk' ? 'Barang Masuk' : 'Barang Keluar';
    this.cols = DOC_COLS_BASE.concat(this.keluar ? [['link_produksi', 'Link Produksi', 'link']] : [['ket_produksi', 'Keterangan Produksi', 'prod']]).concat([['status', 'Status', 'status']]);
    this.page = 1; this.size = PAGE_SIZES[0]; this.sticky = {};
    this.range = { from: defaultFrom(), to: todayISO() };
    this.rs = new RowSelect({ unit: 'SSTB', notify: (t, c, st) => this.notify(t, c, st), url: `/api/doc/${arah}/bulk_delete`, onDone: () => this.load() });
    this.pstate = newFilterState();
    if (init.q) {  // dari kotak pencarian di bilah atas: cari di semua tanggal
      this.pstate.q = init.q; this.range = { from: '2000-01-01', to: todayISO() };
    }
    if (init.sstb) {  // dibuka dari hyperlink SSTB: filter ke SSTB itu, rentang tanggal menyesuaikan
      this.range = { from: init.tanggal, to: init.tanggal > todayISO() ? init.tanggal : todayISO() };
      this.pstate.filters = { sstb: [init.sstb] };
    }
    /* field panel Filter, disesuaikan dengan kolom yang benar-benar ada di Barang Masuk/Keluar */
    this.filterCfg = {
      title: this.label,
      searchPlaceholder: 'Cari SSTB, Dept, Motif, Jenis, Ket, Pengrajin, Rumus…',
      fields: [
        { n: 'dept', l: 'Departemen' }, { n: 'sstb', l: 'SSTB' },
        { n: 'kode_motif', l: 'Kode Motif' }, { n: 'motif', l: 'Motif' },
        { n: 'jenis', l: 'Jenis' }, { n: 'pengrajin', l: 'Nama Pengrajin' },
        { n: 'rumus', l: 'Rumus' }, { n: 'ket', l: 'Keterangan' }, { n: 'status', l: 'Status' }
      ].concat(this.keluar ? [{ n: 'link_produksi', l: 'Link Produksi' }] : []),
      rangeField: { n: 'jumlah', l: 'Jumlah SSTB' },
      sortFields: [['sstb', 'SSTB'], ['tanggal', 'Tanggal'], ['dept', 'Dept'], ['pengrajin', 'Nama Pengrajin'], ['jumlah', 'Jumlah SSTB'], ['status', 'Status']]
        .concat(this.keluar ? [['link_produksi', 'Link Produksi']] : []).map(([n, l]) => ({ n, l })),
      groupFields: [['dept', 'Dept'], ['tanggal', 'Tanggal'], ['pengrajin', 'Nama Pengrajin'], ['status', 'Status'], ['sstb', 'SSTB']]
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
      fi.btn,
      h('span', { class: 'grow' }));
    const io = ioTools(this.arah, () => this.load(), this.notify, this.impBox, true);
    this.exp = io.exp; tb.append(...io.els);
    this.ct = colToggle('doc-' + this.arah, () => this.applyVis()); this.ct.offset = 1;
    this.ct.setCols(this.cols.map(([n, l]) => ({ n, l }))); tb.append(this.ct.el);
    this.theadRow = h('tr', {}, this.rs.head());
    for (const [n, l, k] of this.cols) this.theadRow.append(h('th', { class: k === 'int' ? 'num' : '' }, l));
    this.theadRow.append(h('th', { class: 'act' }, 'Aksi'));
    this.tbody = h('tbody'); this.pager = h('div', { class: 'pager' });
    this.table = h('table', { class: 'resp' }, h('thead', {}, this.theadRow), this.tbody);
    this.root.append(tb, this.chipsRow, this.chips, this.msg, this.rs.bar, this.impBox,
      h('div', { class: 'tablewrap' }, this.table), this.pager);
  }
  applyVis() { if (this.ct) this.ct.apply(this.table); }
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
  /* 1 SSTB = 1 baris tabel. Kolom tingkat-barang (motif, jumlah, ket, progres) berisi satu baris kecil per motif, sejajar antar kolom. */
  rowEl(row) {
    const tr = h('tr', { class: 'docrow' }, this.rs.cell(row.doc_id));
    const items = row.items || [];
    const ln = (txt, cls, title) => h('div', { class: 'ln' + (cls ? ' ' + cls : ''), title: title || (typeof txt === 'string' ? txt : null) }, txt);
    const stack = lines => h('div', { class: 'stack' }, lines);
    const itemCell = n => {
      switch (n) {
        case 'kode_motif': return stack(items.map(it => ln(it.kode_motif)));
        case 'motif': return stack(items.map(it => ln(it.motif || '')));
        case 'jenis': return stack(items.map(it => ln(it.jenis || '')));
        case 'ket': return stack(items.map(it => ln(it.ket || '')));
        case 'rumus': return stack(items.map(it => ln(it.rumus || '')));
        case 'jumlah': return stack(items.map(it => ln(fmtNum(it.jumlah))).concat(items.length > 1 ? [ln('Total ' + fmtNum(row.jumlah), 'tot')] : []));
        case 'link_produksi': return stack(items.map(it => ln(this.linkEl(it))));
        case 'ket_produksi': return this.prodCell(row);
      }
      return null;
    };
    for (const [n, l, k] of this.cols) {
      const cell = itemCell(n);
      if (cell) tr.append(h('td', { class: k === 'int' ? 'num' : '', 'data-label': l }, cell));
      else {
        const v = row[n];
        let content = k === 'date' ? fmtDate(v) : v == null ? '' : v;
        if (n === 'sstb') content = h('a', { class: 'lnk', href: `/${this.arah}/${row.doc_id}`, title: 'Buka detail SSTB' }, v);
        else if (k === 'status') content = badge(v);
        tr.append(h('td', { class: 'dl', 'data-label': l }, content));
      }
    }
    tr.append(h('td', { class: 'act', 'data-label': 'Aksi' },
      ibtn('eye', 'Lihat detail SSTB', null, `/${this.arah}/${row.doc_id}`),
      ibtn('edit', 'Edit SSTB ini (tambah / ubah motif)', () => this.openForm(row.doc_id)),
      ibtn('print', 'Cetak SSTB', () => this.printRow(row)),
      ibtn('del', 'Hapus seluruh SSTB ini', () => this.delDoc(row))));
    return tr;
  }
  linkEl(it) {  // Link Produksi (Barang Keluar): tampilkan SSTB barang masuk asalnya, klik = buka input produksinya
    const lk = it.link_produksi; if (!lk) return '';
    const id = (lk.match(/#(\d+)\s*$/) || [])[1];
    return h('a', { class: 'lnk', href: '/produksi?pid=' + id, title: 'Buka input produksi ini' },
      it.link_produksi_sstb || lk.replace(/\s*#\d+$/, ''));
  }
  prodCell(row) {  // Barang Masuk: progres produksi PER MOTIF dalam SSTB ini (dikerjakan / sisa)
    const id = n => n.toLocaleString('id-ID');
    const lines = (row.items || []).map(it => {
      let chip = '';
      if (it.sisa != null) {  // null = baris ke-2 dst dari motif yang sama (sudah dihitung di baris pertamanya)
        const d = it.dikerjakan || 0, sisa = it.sisa;
        if (!d) chip = h('span', { class: 'pnote none' }, `Belum dikerjakan · Sisa ${id(sisa)}`);
        else if (sisa > 0) chip = h('span', { class: 'pnote part' }, `Dikerjakan ${id(d)} · Sisa ${id(sisa)}`);
        else if (sisa === 0) chip = h('span', { class: 'pnote done' }, `Dikerjakan ${id(d)} · Selesai`);
        else chip = h('span', { class: 'pnote over' }, `Dikerjakan ${id(d)} · Lebih ${id(-sisa)}`);
      }
      return h('div', { class: 'ln' }, chip);
    });
    if (row.lain) lines.push(h('div', { class: 'ln' }, h('span', { class: 'pnote over', title: 'Produksi yang menaut ke SSTB ini tetapi motifnya tidak ada di SSTB' }, `Motif lain: ${id(row.lain)}`)));
    return h('div', { class: 'stack' }, lines);
  }
  async load() {
    const r = await (await fetch(`/api/lines/${this.arah}?` + this.params({ page: this.page, size: this.size }))).json();
    this.exp.href = `/export/${this.arah}?` + this.params();
    this.rs.reset();
    this.chips.innerHTML = '';
    this.chips.append(h('span', { class: 'chip' }, h('b', {}, r.docs.toLocaleString('id-ID')), ' SSTB'),
      h('span', { class: 'chip' }, h('b', {}, r.baris.toLocaleString('id-ID')), ' baris barang'),
      h('span', { class: 'chip big' }, 'Total jumlah ', h('b', {}, r.sum.toLocaleString('id-ID'))));
    const emptyMsg = filterActiveCount(this.pstate)
      ? 'Tidak ada data yang cocok dengan filter.'
      : 'Belum ada data pada rentang tanggal ini. Klik "+ Tambah ' + this.label + '".';
    renderGroupedTable(this.table, r.rows, this.pstate.group, this.cols.length + 2, row => this.rowEl(row), emptyMsg);
    this.tbody = this.table.querySelector('tbody');
    pagerInto(this.pager, this.page, r.pages, r.total, '', p => { this.page = p; this.load(); },
      this.size, n => { this.size = n; this.page = 1; this.load(); }, 'SSTB');
    this.applyVis();
  }
  async printRow(row) {
    const d = await (await fetch(`/api/doc/${this.arah}/${row.doc_id}`)).json();
    printSSTB(d, this.label, this.arah);
  }
  async delDoc(row) {
    if (!(await confirmDelete(`Data SSTB ${row.sstb} beserta ${row.items.length} baris barangnya akan dihapus secara permanen.`))) return;
    await fetch(`/api/doc/${this.arah}/${row.doc_id}`, { method: 'DELETE' }); this.load();
  }
  async openForm(docId, addMore) {
    let doc = null;
    if (docId) doc = await (await fetch(`/api/doc/${this.arah}/${docId}`)).json();
    const st = this.sticky, keluar = this.keluar;
    this.rows = []; const self = this;
    const fmsg = h('div', { class: 'msg' });
    const sstb = h('input', { type: 'text', autocomplete: 'off', placeholder: 'mis. 001/PCG-GRD/IX/2026' });
    const tgl = h('input', { type: 'date' });
    const dept = new Combo('dept'), peng = new Combo('pengrajin', { placeholder: 'Boleh kosong' });
    const status = h('select', {}, STATUSES.map(o => h('option', { value: o }, o)));
    status.value = doc ? (doc.status || 'Selesai') : 'Selesai';
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
      if (!it && this.rows.length) {  // baris baru dalam SSTB yang sama: Ket ikut baris sebelumnya (tinggal ganti motif)
        const prev = this.rows[this.rows.length - 1];
        if (prev.ket.value) { r.ket.value = prev.ket.value; r.ket.snap(); }
      }
      this.rows.push(r); itemsBox.append(r.el); upTotal(); return r;
    };
    (doc && doc.items.length ? doc.items : [null]).forEach(addRow); upTotal();
    tgl.addEventListener('change', () => this.rows.forEach(stockHint));
    const lab = (t, el, cls) => h('label', { class: cls || '' }, t, el);
    const body = h('div', {}, fmsg,
      h('div', { class: 'form-grid' }, lab('SSTB *', sstb), lab('Tanggal *', tgl), lab('Dept *', dept.el), lab('Nama Pengrajin', peng.el), lab('Status', status)),
      h('h3', { class: 'sub' }, 'Barang dalam SSTB ini'), itemsBox,
      h('div', { class: 'items-foot' },
        h('button', { type: 'button', class: 'btn', onclick: () => addRow().motif.focus() }, '+ Tambah baris'),
        h('span', { class: 'grow' }), h('span', {}, 'Total SSTB: ', total)));
    const send = async again => {
      const payload = { sstb: sstb.value, tanggal: tgl.value, dept: dept.value, pengrajin: peng.value, status: status.value,
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
    let jumping = false;
    const cekSstb = async () => {  // SSTB sudah ada -> buka SSTB itu & tambahkan motif baru (1 SSTB = 1 sesi, motif A, B, C)
      if (docId || jumping || !sstb.value.trim()) return false;
      const f = await (await fetch(`/api/doc/${this.arah}/find?` + new URLSearchParams({ sstb: sstb.value.trim() }))).json();
      if (!f.id) return false;
      jumping = true; modal.close();
      this.notify(`SSTB ${sstb.value.trim()} sudah ada — silakan tambahkan motif berikutnya di bawah.`, 'ok');
      this.openForm(f.id, true); return true;
    };
    sstb.addEventListener('blur', e => { if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.modal-f, .modal-h')) return; cekSstb(); });
    sstb.addEventListener('keydown', async e => {
      if (e.key !== 'Enter') return; e.preventDefault();
      if (!(await cekSstb())) this.rows[0].motif.focus();
    });
    const foot = [];
    if (docId) {
      foot.push(h('button', { class: 'btn danger mr-auto', onclick: async () => {
        if (!(await confirmDelete(`Data SSTB ${doc.sstb} beserta semua barisnya akan dihapus secara permanen.`))) return;
        await fetch(`/api/doc/${this.arah}/${docId}`, { method: 'DELETE' }); modal.close(); this.load();
      } }, 'Hapus SSTB'));
      foot.push(h('button', { class: 'btn', onclick: () => printSSTB(doc, this.label, this.arah) }, 'Cetak SSTB'));
    }
    foot.push(h('button', { class: 'btn', onclick: () => modal.close() }, 'Batal'));
    if (!docId) foot.push(h('button', { class: 'btn', onclick: () => send(true) }, 'Simpan & Tambah Lagi'));
    foot.push(h('button', { class: 'btn primary', onclick: () => send(false) }, docId ? 'Update' : 'Simpan'));
    const modal = openModal((docId ? 'Edit ' : 'Tambah ') + this.label + (docId ? ' — ' + doc.sstb : ''), body, foot);
    if (addMore && docId) addRow().motif.focus(); else (docId ? this.rows[0].motif : sstb).focus();
  }
}


/* Tombol dropdown pemilih tampilan (mis. Rekap / Daftar Input / Rekap Realtime). items: [[nilai, label], ...] */
function viewDropdown(items, onPick, initial) {
  let cur = initial || items[0][0];
  const btn = h('button', { type: 'button', class: 'btn viewbtn' });
  const menu = h('div', { class: 'ddmenu' });
  const el = h('div', { class: 'dd' }, btn, menu);
  const label = () => { btn.textContent = (items.find(i => i[0] === cur) || items[0])[1] + ' ▾'; };
  const set = (v, silent) => {
    cur = v; label(); el.classList.remove('open');
    [...menu.children].forEach(b => b.classList.toggle('on', b.dataset.v === v));
    if (!silent) onPick(v);
  };
  for (const [v, l] of items) menu.append(h('button', { type: 'button', 'data-v': v, onclick: () => set(v) }, l));
  btn.addEventListener('click', e => { e.stopPropagation(); el.classList.toggle('open'); });
  document.addEventListener('click', e => { if (!el.contains(e.target)) el.classList.remove('open'); });
  set(cur, true);
  return { el, set, get value() { return cur; } };
}

/* Stok Pengrajin (halaman Barang Keluar): total dikirim ke pengrajin - total kembali (Barang Masuk), per Motif & Ket */
class PengrajinStok {
  constructor(root) {
    this.root = root; this.pstate = newFilterState(); this.all = false; this.range = { from: todayISO(), to: todayISO() };
    this.build(); this.load();
  }
  params() {
    const p = new URLSearchParams({ to: this.range.to });
    if (this.pstate.q) p.set('q', this.pstate.q);
    const pg = (this.pstate.filters.pengrajin || [])[0]; if (pg) p.set('pengrajin', pg);
    if (this.all) p.set('all', '1');
    return p;
  }
  build() {
    const fp = filterPanel(this, {
      title: 'Stok Pengrajin', searchPlaceholder: 'Cari pengrajin, motif, ket…',
      fields: [{ n: 'pengrajin', l: 'Pengrajin' }], fetchDistinct: () => catOptions('pengrajin'),
      extra: () => {
        const cb = h('input', { type: 'checkbox', checked: this.all });
        return { els: [h('label', { class: 'colitem' }, cb, 'Tampilkan stok 0')], apply: () => { this.all = cb.checked; }, reset: () => { this.all = false; },
          chip: () => this.all ? 'Termasuk stok 0' : '' };
      },
      onApply: () => this.load()
    });
    this.exp = h('a', { class: 'btn' }, 'Export Excel');
    this.table = h('table', { class: 'resp' });
    this.chips = h('div', { class: 'chips' });
    this.root.append(
      h('div', { class: 'toolbar' }, fp.btn, h('span', { class: 'grow' }), this.exp), fp.chipsRow,
      h('p', { class: 'hint' }, 'Stok Pengrajin = jumlah Barang Keluar ke pengrajin itu dikurangi Barang Masuk darinya, per Motif dan Ket ' +
        '(dihitung dari seluruh transaksi s/d tanggal akhir periode, default hari ini). Contoh: keluar 600, masuk 500 → stok di pengrajin 100. ' +
        'Bila Ket saat kembali berbeda dari Ket saat dikirim (mis. Belum Neci → Sudah Neci), atur di DB › Pemetaan Keluar → Masuk. ' +
        'Barang Keluar/Masuk tanpa Nama Pengrajin tidak ikut dihitung.'),
      this.chips, h('div', { class: 'tablewrap' }, this.table));
  }
  async load() {
    this.exp.href = '/export/pengrajin_stok?' + this.params();
    const r = await (await fetch('/api/pengrajin_stok?' + this.params())).json();
    const heads = [['Pengrajin', ''], ['Kode Motif', ''], ['Motif', ''], ['Ket', ''], ['Keluar (dikirim)', 'num'], ['Masuk (kembali)', 'num'], ['Stok di Pengrajin', 'num']];
    const tb = this.table; tb.innerHTML = '';
    tb.append(h('thead', {}, h('tr', {}, heads.map(([x, c]) => h('th', { class: c }, x)))));
    const body = h('tbody');
    if (!r.rows.length) body.append(h('tr', {}, h('td', { colspan: heads.length, class: 'empty' }, 'Tidak ada stok di pengrajin.')));
    const neg = v => v < 0 ? 'num neg' : 'num';
    for (const x of r.rows) {
      body.append(h('tr', { class: x.total ? 'total' : '' },
        h('td', { 'data-label': 'Pengrajin' }, x.grand ? 'TOTAL' : x.total ? 'Total ' + x.pengrajin : x.pengrajin),
        h('td', { 'data-label': 'Kode Motif' }, x.kode_motif), h('td', { 'data-label': 'Motif' }, x.motif), h('td', { 'data-label': 'Ket' }, x.ket),
        h('td', { class: 'num', 'data-label': 'Keluar' }, fmtNum(x.keluar)), h('td', { class: 'num', 'data-label': 'Masuk' }, fmtNum(x.masuk)),
        h('td', { class: neg(x.stok), 'data-label': 'Stok' }, h('b', {}, fmtNum(x.stok)))));
    }
    tb.append(body);
  }
}


/* Ringkas Barang Masuk / Barang Keluar: dikelompokkan per Tanggal, Dept, Jenis, Motif, Ket, atau Pengrajin (Baris, SSTB, Jumlah) */
class DocRekap {
  constructor(root, arah) {
    this.root = root; this.arah = arah; this.range = { from: todayISO(), to: todayISO() };
    this.pstate = Object.assign(newFilterState(), { group: 'motif' }); this.build(); this.load();
  }
  build() {
    const fp = filterPanel(this, {
      title: 'Ringkas ' + (this.arah === 'masuk' ? 'Barang Masuk' : 'Barang Keluar'), defaultGroup: 'motif',
      groupFields: [['motif', 'Motif'], ['jenis', 'Jenis'], ['tanggal', 'Tanggal'], ['dept', 'Dept'], ['ket', 'Ket'], ['pengrajin', 'Nama Pengrajin']].map(([n, l]) => ({ n, l })),
      onApply: () => this.load()
    });
    this.exp = h('a', { class: 'btn' }, 'Export Excel');
    this.table = h('table'); this.chips = h('div', { class: 'chips' });
    this.root.append(
      h('div', { class: 'toolbar' }, fp.btn, h('span', { class: 'grow' }), this.exp), fp.chipsRow,
      h('p', { class: 'hint' }, `Ringkasan ${this.arah === 'masuk' ? 'Barang Masuk' : 'Barang Keluar'} pada periode terpilih (default hari ini), dikelompokkan menurut Group By di tombol Filter (boleh lebih dari satu). ` +
        'Baris = jumlah baris barang, SSTB = jumlah SSTB berbeda, Jumlah = total barang.'),
      this.chips, h('div', { class: 'tablewrap' }, this.table));
  }
  async load() {
    const q = new URLSearchParams({ from: this.range.from, to: this.range.to, by: this.pstate.group || 'motif' });
    this.exp.href = `/export/rekap?arah=${this.arah}&` + q;
    const r = await (await fetch(`/api/rekap/${this.arah}?` + q)).json();
    const tb = this.table; tb.innerHTML = '';
    const dims = r.dims;
    tb.append(h('thead', {}, h('tr', {}, grpHeads(dims), ['Baris', 'SSTB', 'Jumlah'].map(x => h('th', { class: 'num' }, x)))));
    const body = h('tbody');
    if (!r.rows.length) body.append(h('tr', {}, h('td', { colspan: dims.length + 3, class: 'empty' }, 'Tidak ada data pada periode ini.')));
    for (const x of r.rows) {
      body.append(h('tr', { class: x.total ? 'total' : '' }, grpTds(dims, x),
        h('td', { class: 'num', 'data-label': 'Baris' }, fmtNum(x.baris)), h('td', { class: 'num', 'data-label': 'SSTB' }, fmtNum(x.sstb)),
        h('td', { class: 'num', 'data-label': 'Jumlah' }, h('b', {}, fmtNum(x.jumlah)))));
    }
    tb.append(body);
  }
}

/* ===== Restore DB: pulihkan dari file cadangan (.db) ===== */
(function () {
  const btn = document.getElementById('restoreBtn'), inp = document.getElementById('restoreFile');
  if (!btn || !inp) return;
  btn.addEventListener('click', e => { e.preventDefault(); inp.value = ''; inp.click(); });
  inp.addEventListener('change', async () => {
    const f = inp.files[0]; if (!f) return;
    if (!(await confirmBox('Pulihkan database?', `Dari file "${f.name}".\nSeluruh data saat ini akan DIGANTI dengan isi file ini. ` +
      `Data saat ini otomatis dicadangkan dulu di folder backup (pra-restore-...).`, { ok: 'Pulihkan', danger: false }))) return;
    const fd = new FormData(); fd.append('file', f);
    if (btn.dataset.busy) return;
    btn.dataset.busy = '1'; btn.textContent = 'Memulihkan…';
    try {
      const res = await fetch('/restore', { method: 'POST', body: fd });
      const r = await res.json();
      if (!res.ok || !r.ok) { await confirmBox('Restore gagal', r.error || 'Restore gagal', { info: true, ok: 'Tutup', danger: false }); btn.textContent = 'Restore DB'; delete btn.dataset.busy; return; }
      await confirmBox('Database dipulihkan', 'Database berhasil dipulihkan.' + (r.pra ? `\nData sebelumnya disimpan sebagai backup/${r.pra}.` : '') +
        (r.warnings && r.warnings.length ? '\n\nPeringatan:\n' + r.warnings.join('\n') : ''), { info: true, ok: 'OK', danger: false });
      location.reload();
    } catch (err) { await confirmBox('Restore gagal', String(err), { info: true, ok: 'Tutup', danger: false }); btn.textContent = 'Restore DB'; delete btn.dataset.busy; }
  });
})();
