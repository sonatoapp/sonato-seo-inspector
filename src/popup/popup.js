const api = globalThis.browser ?? globalThis.chrome;

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = String(text);
  return n;
};

const NS = 'http://www.w3.org/2000/svg';
function icon(d, size) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size || 16);
  s.setAttribute('height', size || 16);
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.7');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', d);
  s.appendChild(p);
  return s;
}

const I_BAN   = 'M18.4 5.6L5.6 18.4 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0';
const I_WARN  = 'M12 9v4 M12 17h.01 M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z';

let DATA = null;
let PROBE = null;
let EXPANDED = false;

const RESTRICTED = /^(chrome|edge|about|moz-extension|chrome-extension|view-source|devtools|data):/i;

function fail(msg) {
  const m = $('body');
  m.textContent = '';
  m.appendChild(el('div', 'empty', msg));
}

function counted(len, lo, hi) {
  if (!len) return 'bad';
  if (len < lo || len > hi) return 'warn';
  return '';
}

function section(title, right) {
  const s = el('div', 'sec');
  if (right != null) {
    const h = el('div', 'card-h');
    h.style.marginBottom = '10px';
    h.appendChild(el('span', 'sec-h', title));
    h.appendChild(el('span', 'card-n', right));
    h.firstChild.style.marginBottom = '0';
    s.appendChild(h);
  } else {
    s.appendChild(el('div', 'sec-h', title));
  }
  return s;
}

function finding(kind, title, body, iconPath) {
  const c = el('div', 'find ' + kind);
  const h = el('div', 'find-h');
  const w = el('span', 'find-ico');
  w.appendChild(icon(iconPath, 16));
  h.appendChild(w);
  h.appendChild(el('span', 'find-t', title));
  c.appendChild(h);
  c.appendChild(el('div', 'find-b', body));
  return c;
}

function row(key, value, count, cls) {
  const r = el('div', 'row');
  const h = el('div', 'row-h');
  h.appendChild(el('span', 'row-k', key));
  if (count != null) h.appendChild(el('span', 'row-c ' + (cls || ''), count));
  r.appendChild(h);
  if (value == null || value === '') {
    r.appendChild(el('div', 'row-v none', 'Missing'));
  } else {
    r.appendChild(el('div', 'row-v dim', value));
  }
  return r;
}

function inlineRow(key, value, cls) {
  const r = el('div', 'row inline');
  const h = el('div', 'row-h');
  h.appendChild(el('span', 'row-k', key));
  r.appendChild(h);
  r.appendChild(el('span', 'row-v ' + (cls || ''), value));
  return r;
}

/* ---------- compare ---------- */

// Reuses diffSnapshots from the history feature. Compares markup-level fields
// rather than page text: "how does this page differ from that one" is the
// question worth answering, and a prose diff would be noise.
function renderCompare(target) {
  if (!PINNED || !PROBE) return;
  if (PINNED.url === DATA.page.url) return;   // pinned page is the current one

  const now = snapshot(DATA, PROBE, runChecks(DATA, PROBE));
  const diffs = diffSnapshots(PINNED.snap, now, true);

  const s = section('Compared with pinned page', diffs.length ? String(diffs.length) : null);

  const head = el('div', 'cmp-head');
  const u = el('span', 'cmp-url', PINNED.url.replace(/^https?:\/\//, ''));
  u.title = PINNED.url;
  head.appendChild(u);
  const clear = el('button', 'cmp-clear', 'Unpin');
  clear.addEventListener('click', async () => {
    PINNED = null;
    try { await api.storage.local.remove('pinned'); } catch (e) { /* nothing to remove */ }
    $('pin').classList.remove('on');
    paint();
  });
  head.appendChild(clear);
  s.appendChild(head);

  if (!diffs.length) {
    s.appendChild(el('div', 'clean', 'Identical on every field checked.'));
    target.appendChild(s);
    return;
  }

  const box = el('div', 'chg');
  diffs.forEach((d) => {
    const r = el('div', 'cmp-row');
    r.appendChild(el('div', 'cmp-k', d.label));

    let host = 'pinned';
    try { host = new URL(PINNED.url).hostname; } catch (e) { /* keep the fallback */ }

    const a = el('div', 'cmp-side');
    a.appendChild(el('span', 'cmp-tag', host));
    a.appendChild(el('span', 'cmp-val', d.from === '' || d.from == null ? '(none)' : d.from));
    r.appendChild(a);

    const b = el('div', 'cmp-side this');
    b.appendChild(el('span', 'cmp-tag', 'This page'));
    b.appendChild(el('span', 'cmp-val', d.to === '' || d.to == null ? '(none)' : d.to));
    r.appendChild(b);

    box.appendChild(r);
  });
  s.appendChild(box);
  target.appendChild(s);
}

/* ---------- score ---------- */

function renderScore(target) {
  // Four rules cannot run until the probe lands. Showing a number before then
  // means showing one that corrects itself downward a moment later, which
  // reads as a glitch and leaves people quoting the wrong figure.
  if (!PROBE) {
    const w = el('div', 'sc flat');
    w.appendChild(el('div', 'sc-wait', 'Checking\u2026'));
    w.appendChild(el('div', 'sc-sub', 'Reading robots.txt and the page HTML.'));
    target.appendChild(w);
    return;
  }

  const found = runChecks(DATA, PROBE);
  const r = scorePage(found, !!PROBE);

  const box = el('div', 'sc' + (r.fatal ? ' flat' : ''));
  const top = el('div', 'sc-top');

  if (r.fatal) {
    top.appendChild(el('span', 'sc-lbl', r.label));
    box.appendChild(top);
    box.appendChild(el('div', 'sc-sub', r.why));
    target.appendChild(box);
    return;
  }

  const cls = r.score >= 90 ? 'good' : (r.score >= 60 ? 'mid' : 'bad');
  top.appendChild(el('span', 'sc-n ' + cls, r.score));
  top.appendChild(el('span', 'sc-of', 'of 100'));
  box.appendChild(top);

  const bits = [];
  if (r.items.length) bits.push(r.items.length + ' issue' + (r.items.length > 1 ? 's' : '') + ' cost ' + r.lost);
  else bits.push('Nothing deducted');
  if (r.skipped) bits.push(r.skipped + ' checks still running');
  box.appendChild(el('div', 'sc-sub', bits.join(' \u00b7 ') + (r.items.length ? '. Tap for the breakdown.' : '.')));

  if (SC_OPEN && r.items.length) {
    const br = el('div', 'sc-break');
    r.items.forEach((it) => {
      const row = el('div', 'sc-row');
      row.appendChild(el('span', null, it.title));
      row.appendChild(el('span', null, '-' + it.cost));
      br.appendChild(row);
    });
    const t = el('div', 'sc-row total');
    t.appendChild(el('span', null, 'Total deducted'));
    t.appendChild(el('span', null, '-' + r.lost));
    br.appendChild(t);
    box.appendChild(br);
  }

  if (r.items.length) {
    box.addEventListener('click', () => { SC_OPEN = !SC_OPEN; paint(); });
  } else {
    box.classList.add('flat');
  }

  target.appendChild(box);
}

/* ---------- findings ---------- */

function renderFindings(target) {
  const found = runChecks(DATA, PROBE);
  const broken = found.filter((f) => f.sev === 'broken');
  const missing = found.filter((f) => f.sev === 'missing');
  const ordered = broken.concat(missing);

  const label = PROBE ? 'Findings' : 'Findings so far';
  const s = section(label, found.length ? String(found.length) : null);

  if (!ordered.length) {
    s.appendChild(el('div', 'clean', PROBE ? 'Nothing missing. Every check passed.' : 'Nothing missing yet.'));
    target.appendChild(s);
    return;
  }

  ordered.forEach((f) => {
    const c = el('div', 'fnd ' + f.sev + (f.sev === 'missing' ? ' tap' : ''));
    const w = el('span', 'fnd-ico');
    w.appendChild(icon(f.sev === 'broken' ? I_BAN : I_WARN, 15));
    c.appendChild(w);
    const t = el('div', 'fnd-txt');
    t.appendChild(el('div', 'fnd-t', f.title));
    if (f.items) t.appendChild(el('div', 'fnd-items', f.items.join(' · ')));
    // Broken findings always explain themselves. Missing ones explain on tap,
    // so a page with a dozen gaps stays scannable. The why sits above the
    // evidence, since it reads as a caption to the list rather than a footnote.
    const why = el('div', 'fnd-w' + (f.sev === 'missing' ? ' hide' : ''), f.why);
    t.appendChild(why);
    if (f.evidence) {
      const ev = el('div', 'fnd-ev');
      f.evidence.slice(0, 3).forEach((x) => ev.appendChild(el('code', null, x)));
      if (f.evidence.length > 3) ev.appendChild(el('div', 'rest', 'and ' + (f.evidence.length - 3) + ' more'));
      t.appendChild(ev);
    }
    c.appendChild(t);
    if (f.sev === 'missing') {
      c.addEventListener('click', () => why.classList.toggle('hide'));
    }

    if (f.targets && f.targets.length) {
      c.classList.add('hasTarget');
      let pos = 0;
      c.addEventListener('mouseenter', () => { pos = 0; highlight(f.targets[0]); });
      c.addEventListener('mouseleave', clearHighlight);

      // Stepping lives on its own button, not on the card. Clicking the card
      // toggles the explanation, and one click must not do two things.
      if (f.targets.length > 1) {
        const step = el('button', 'fnd-step', '1 of ' + f.targets.length);
        step.addEventListener('click', (ev) => {
          ev.stopPropagation();
          pos = (pos + 1) % f.targets.length;
          step.textContent = (pos + 1) + ' of ' + f.targets.length;
          highlight(f.targets[pos]);
        });
        step.addEventListener('mouseenter', (ev) => { ev.stopPropagation(); highlight(f.targets[pos]); });
        t.appendChild(step);
      }
    }

    s.appendChild(c);
  });

  target.appendChild(s);
}

/* ---------- AI crawler access ---------- */

function renderAgents(target) {
  const p = PROBE;

  if (!p || !p.robots) {
    const s = section('AI crawler access');
    s.appendChild(el('div', 'card skel', 'Checking robots.txt…'));
    target.appendChild(s);
    return;
  }

  if (!p.robots.ok) {
    const s = section('AI crawler access');
    if (p.robots.status === 404) {
      s.appendChild(finding('warn', 'No robots.txt', 'Every crawler is allowed by default. Nothing is being controlled here.', I_WARN));
    } else {
      const c = el('div', 'card');
      c.appendChild(el('div', 'card-t', 'robots.txt'));
      c.appendChild(el('div', 'card-note', p.robots.error || ('Returned ' + p.robots.status + '.')));
      s.appendChild(c);
    }
    target.appendChild(s);
    return;
  }

  const returned = p.robots.agents.map((a) => a.token);
  const known = Object.keys(AGENT_META);
  const missing = returned.filter((t) => known.indexOf(t) === -1);
  const extra = known.filter((t) => returned.indexOf(t) === -1);
  if (missing.length || extra.length) {
    console.error('[sona] agent token drift. In probe not meta:', missing, '| in meta not probe:', extra);
  }

  const s = section('AI crawler access', p.robots.agents.length + ' checked');
  const rows = el('div', 'rows');

  JOB_ORDER.forEach((job) => {
    const list = p.robots.agents.filter((a) => a.job === job);
    if (!list.length) return;
    const allowed = list.filter((a) => a.allowed).length;
    const meta = JOB_META[job];

    const r = el('div', 'jrow');
    const ic = el('span', 'jrow-ico');
    ic.appendChild(icon(meta.icon, 16));
    r.appendChild(ic);

    const t = el('div', 'jrow-txt');
    t.appendChild(el('div', 'jrow-t', meta.title));
    t.appendChild(el('div', 'jrow-s', meta.sub));
    r.appendChild(t);

    const bad = allowed < list.length && job !== 'training';
    r.appendChild(el('span', 'jrow-n' + (bad ? ' bad' : ''), allowed + ' of ' + list.length));
    rows.appendChild(r);
  });

  s.appendChild(rows);

  JOB_ORDER.forEach((job) => {
    if (job === 'training') return;
    const blocked = p.robots.agents.filter((a) => a.job === job && !a.allowed);
    if (!blocked.length) return;
    const names = blocked.map((a) => a.token);
    s.appendChild(finding('bad', names.join(', ') + ' blocked', JOB_META[job].blocked, I_BAN));
  });

  const trainBlocked = p.robots.agents.filter((a) => a.job === 'training' && !a.allowed);
  if (trainBlocked.length) {
    const c = el('div', 'card');
    c.style.marginTop = '8px';
    c.appendChild(el('div', 'card-note', trainBlocked.map((a) => a.token).join(', ') + ' blocked. ' + JOB_META.training.blocked));
    s.appendChild(c);
  }

  const btn = el('button', 'more', EXPANDED ? 'Hide crawler list' : 'Show all ' + p.robots.agents.length + ' crawlers');
  s.appendChild(btn);

  const detail = el('div');
  detail.style.display = EXPANDED ? 'block' : 'none';
  btn.addEventListener('click', () => {
    EXPANDED = !EXPANDED;
    detail.style.display = EXPANDED ? 'block' : 'none';
    btn.textContent = EXPANDED ? 'Hide crawler list' : 'Show all ' + p.robots.agents.length + ' crawlers';
  });

  {
    JOB_ORDER.forEach((job) => {
      const list = p.robots.agents.filter((a) => a.job === job);
      if (!list.length) return;
      const c = el('div', 'card');
      c.appendChild(el('div', 'card-t', JOB_META[job].title));
      c.style.marginTop = '8px';
      const chips = el('div', 'chips');
      chips.style.marginTop = '9px';
      list.forEach((a) => {
        const chip = el('span', 'chip' + (a.allowed ? '' : ' bad'));
        chip.appendChild(document.createTextNode(AGENT_META[a.token] ? AGENT_META[a.token].label : a.token));
        if (a.ignoresRobots) {
          const sup = el('sup', null, '!');
          sup.title = 'Does not reliably honour robots.txt';
          chip.appendChild(sup);
        }
        chip.title = (AGENT_META[a.token] ? AGENT_META[a.token].operator + ' — ' : '') + a.reason
          + (a.explicit ? '' : ' (matched the * group)')
          + (a.tokenOnly ? ' — robots.txt token only, never appears in logs' : '');
        chips.appendChild(chip);
      });
      c.appendChild(chips);
      detail.appendChild(c);
    });
  }

  s.appendChild(detail);
  target.appendChild(s);
}

/* ---------- crawler view ---------- */

function renderRaw(target) {
  const p = PROBE;
  if (!p || !p.raw) return;
  if (!p.raw.ok) {
    if (p.raw.error || (p.raw.status && p.raw.status >= 400)) {
      const s = section('Crawler view');
      const c = el('div', 'card');
      c.appendChild(el('div', 'card-note', p.raw.error ? ('Could not refetch: ' + p.raw.error) : ('Refetch returned ' + p.raw.status + '.')));
      s.appendChild(c);
      target.appendChild(s);
    }
    return;
  }

  const rawW = p.raw.words;
  const domW = DATA.content.domWords;
  const big = Math.max(rawW, domW);
  const delta = domW - rawW;
  const share = big ? Math.abs(delta) / big : 0;

  const s = section('Crawler view');

  if (share > 0.10) {
    const c = el('div', 'card');
    const sp = el('div', 'split');
    const a = el('div');
    a.appendChild(el('div', 'stat-l', 'In the HTML'));
    a.appendChild(el('div', 'stat-v', rawW.toLocaleString()));
    const rule = el('div', 'split-rule');
    const b = el('div');
    b.appendChild(el('div', 'stat-l', 'After JavaScript'));
    b.appendChild(el('div', 'stat-v', domW.toLocaleString()));
    sp.appendChild(a); sp.appendChild(rule); sp.appendChild(b);
    c.appendChild(sp);
    c.appendChild(el('div', 'card-note',
      delta > 0
        ? 'Words. ' + delta.toLocaleString() + ' only appear after JavaScript runs.'
        : 'Words. ' + Math.abs(delta).toLocaleString() + ' are in the HTML but never rendered.'));
    s.appendChild(c);
  }

  if (p.raw.xRobotsTag) {
    const noindex = /noindex/i.test(p.raw.xRobotsTag);
    if (noindex) {
      s.appendChild(finding('bad', 'X-Robots-Tag: noindex', 'Sent as a response header, so it is invisible in the page source. This page will not be indexed.', I_BAN));
    } else {
      const c = el('div', 'card');
      c.appendChild(el('div', 'card-note', 'X-Robots-Tag: ' + p.raw.xRobotsTag));
      s.appendChild(c);
    }
  }

  if (s.children.length > 1) target.appendChild(s);
}

/* ---------- social previews ---------- */

// Each platform reads the same og tags but picks its own layout. These
// reproduce the card shape and field order, not the exact chrome, which
// differs by client and changes without notice.
const PLATFORMS = [
  { key: 'x',  cls: 'card-x',  name: 'X' },
  { key: 'fb', cls: 'card-fb', name: 'Facebook' },
  { key: 'li', cls: 'card-li', name: 'LinkedIn' }
];

let SP_TAB = 'x';
let SC_OPEN = false;
let PINNED = null;   // one snapshot, kept under a fixed key

let HISTORY = null;   // snapshot list for this URL, previous visits only
let TAB_ID = null;
let HL_TIMER = null;

// Two executeScript calls per highlight: one to set the target, one to draw.
// Debounced, because mouseenter fires far more often than the page needs
// redrawing and each call is an IPC round trip.
function highlight(target) {
  if (!TAB_ID) return;
  clearTimeout(HL_TIMER);
  HL_TIMER = setTimeout(async () => {
    try {
      await api.scripting.executeScript({
        target: { tabId: TAB_ID },
        func: (t) => { window.__sonaTarget = t; },
        args: [target]
      });
      await api.scripting.executeScript({ target: { tabId: TAB_ID }, files: ['/lib/highlight.js'] });
    } catch (e) { /* restricted page or navigation, nothing to draw */ }
  }, 90);
}

function clearHighlight() { highlight(null); }

function socialValues() {
  const d = DATA;
  const og = d.social.og, tw = d.social.twitter;
  return {
    title: tw.title || og.title || d.meta.title || '',
    desc: tw.description || og.description || d.meta.description || '',
    image: tw.image || og.image || '',
    host: d.page.hostname,
    card: (tw.card || '').toLowerCase(),
    fromOg: !!(og.title || og.description || og.image)
  };
}

function socialCard(pf, v) {
  const card = el('div', pf.cls);

  if (v.image) {
    const im = el('img', 'sp-img');
    im.src = v.image;
    im.alt = '';
    im.addEventListener('error', () => {
      const ph = el('div', 'sp-noimg', 'og:image did not load');
      if (im.parentNode) im.parentNode.replaceChild(ph, im);
    });
    card.appendChild(im);
  } else {
    card.appendChild(el('div', 'sp-noimg', 'No image. This renders as a text row.'));
  }

  const meta = el('div', 'sp-meta');
  // Field order per platform. Facebook leads with the domain in caps,
  // LinkedIn puts the domain under the title, X puts it under both.
  if (pf.key === 'fb') meta.appendChild(el('div', 'sp-dom', v.host));
  if (v.title) meta.appendChild(el('div', 'sp-title', v.title));
  if (pf.key === 'li') meta.appendChild(el('div', 'sp-dom', v.host));
  if (v.desc && pf.key !== 'li') meta.appendChild(el('div', 'sp-desc', v.desc));
  if (pf.key === 'x') meta.appendChild(el('div', 'sp-dom', v.host));
  card.appendChild(meta);
  return card;
}

function socialNote(pf, v) {
  if (pf.key === 'x') {
    if (v.image && v.card !== 'summary_large_image') {
      return ['warn', 'twitter:card is not summary_large_image, so X shows a small square thumbnail whatever the image size.'];
    }
    if (!v.image) return [null, 'X falls back to a compact row with no image.'];
    return [null, 'Large card. X crops to 2:1, so allow for the top and bottom edges.'];
  }
  if (pf.key === 'fb') {
    if (!v.image) return [null, 'Facebook shows the domain and title with no image.'];
    return [null, 'Facebook crops to 1.91:1.'];
  }
  return [null, 'LinkedIn shows the image and title, and does not display og:description.'];
}

function renderSocial(target) {
  const v = socialValues();
  const s = section('Share preview', v.fromOg ? null : 'no og tags');
  const wrap = el('div', 'sp');

  const tabs = el('div', 'sp-tabs');
  PLATFORMS.forEach((pf) => {
    const b = el('button', 'sp-tab' + (SP_TAB === pf.key ? ' on' : ''), pf.name);
    b.addEventListener('click', () => {
      SP_TAB = pf.key;
      // Mutate in place. A full repaint here would lose scroll and the
      // crawler list's expanded state.
      Array.prototype.forEach.call(tabs.children, (c, i) => {
        c.classList.toggle('on', PLATFORMS[i].key === SP_TAB);
      });
      body.textContent = '';
      fillBody();
    });
    tabs.appendChild(b);
  });
  wrap.appendChild(tabs);

  const body = el('div', 'sp-body');
  function fillBody() {
    const pf = PLATFORMS.filter((x) => x.key === SP_TAB)[0];
    body.appendChild(socialCard(pf, v));
    const n = socialNote(pf, v);
    body.appendChild(el('div', 'sp-note' + (n[0] ? ' ' + n[0] : ''), n[1]));
  }
  fillBody();

  wrap.appendChild(body);
  s.appendChild(wrap);
  target.appendChild(s);
}

/* ---------- structured data ---------- */

const I_CHEV = 'M9 18l6-6-6-6';

// A block often wraps several entities in @graph or a bare array, so counting
// blocks hides what is actually declared. Flatten to the type names.
function schemaTypes(node, out) {
  out = out || [];
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach((n) => schemaTypes(n, out)); return out; }
  const t = node['@type'];
  if (typeof t === 'string') out.push(t);
  else if (Array.isArray(t)) t.forEach((x) => { if (typeof x === 'string') out.push(x); });
  if (node['@graph']) schemaTypes(node['@graph'], out);
  return out;
}

function renderSchema(target) {
  const d = DATA;
  const blocks = d.structured.jsonld;
  const micro = d.structured.microdata;
  if (!blocks.length && !micro.length) return;

  const all = [];
  blocks.forEach((b) => { if (b.ok) schemaTypes(b.data, all); });
  const s = section('Structured data', all.length ? all.length + ' item' + (all.length > 1 ? 's' : '') : null);
  const box = el('div', 'sd');

  blocks.forEach((b, i) => {
    const row = el('div', 'sd-row');
    const hd = el('div', 'sd-hd');
    const chev = el('span', 'sd-chev');
    chev.appendChild(icon(I_CHEV, 14));
    hd.appendChild(chev);

    if (b.ok) {
      const types = schemaTypes(b.data);
      hd.appendChild(el('span', 'sd-t', types.length ? types.join(', ') : 'No @type declared'));
      hd.appendChild(el('span', 'sd-n', types.length > 1 ? types.length + ' items' : 'JSON-LD'));
    } else {
      hd.appendChild(el('span', 'sd-t bad', 'Block ' + (i + 1) + ' will not parse'));
      hd.appendChild(el('span', 'sd-n', 'JSON-LD'));
    }
    row.appendChild(hd);

    const body = el('div', 'sd-body');
    body.style.display = 'none';
    // The pre gets its own positioning context so the copy button lands on
    // its corner rather than the padded card edge.
    const wrap = el('div', 'sd-pre');
    const pre = el('pre');
    const raw = b.ok ? JSON.stringify(b.data, null, 2) : (b.error + '\n\n' + (b.preview || ''));
    pre.textContent = raw;
    wrap.appendChild(pre);
    body.appendChild(wrap);

    // Ctrl+A inside a scrolling pre selects the whole panel, so a button is
    // the only way to get just this block.
    const cp = el('button', 'sd-copy', 'Copy');
    cp.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      try {
        await navigator.clipboard.writeText(raw);
        cp.textContent = 'Copied';
        cp.classList.add('done');
        setTimeout(() => { cp.textContent = 'Copy'; cp.classList.remove('done'); }, 1200);
      } catch (e) { console.error('[sona] clipboard', e); }
    });
    wrap.appendChild(cp);
    row.appendChild(body);

    hd.addEventListener('click', () => {
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      chev.classList.toggle('open', !open);
    });

    box.appendChild(row);
  });

  if (micro.length) {
    const row = el('div', 'sd-row');
    const hd = el('div', 'sd-hd');
    hd.style.cursor = 'default';
    hd.appendChild(el('span', 'sd-t', micro.map((m) => m.split('/').pop()).join(', ')));
    hd.appendChild(el('span', 'sd-n', 'Microdata'));
    row.appendChild(hd);
    box.appendChild(row);
  }

  s.appendChild(box);
  target.appendChild(s);
}

/* ---------- what changed ---------- */

function renderHistory(target) {
  if (!HISTORY || !HISTORY.length) return;
  const now = snapshot(DATA, PROBE, runChecks(DATA, PROBE));

  // The newest entry is usually this same page state, written at the end of a
  // previous open. Walk back to the most recent snapshot that actually differs,
  // which is the last time the page was something else.
  let prev = null, diffs = null;
  const cutoff = Date.now() - HIST_MAX_AGE;
  for (let i = HISTORY.length - 1; i >= 0; i--) {
    // Already dismissed, or old enough that it is no longer news.
    if (HISTORY[i].seen) continue;
    if (HISTORY[i].t < cutoff) continue;
    const d = diffSnapshots(HISTORY[i], now);
    if (d.length) { prev = HISTORY[i]; diffs = d; break; }
  }
  if (!prev) return;

  const s = el('div', 'sec');
  const head = el('div', 'chg-head');
  head.appendChild(el('span', 'sec-h', 'Changed since ' + agoLabel(prev.t)));
  head.firstChild.style.marginBottom = '0';
  const dis = el('button', 'chg-dismiss', 'Dismiss');
  dis.addEventListener('click', async () => {
    // Marks the snapshot this was measured against, so the card stays until
    // you say you have seen it rather than reappearing on every visit.
    await historyDismiss(api, DATA.page.url, prev.t);
    HISTORY = await historyLoad(api, DATA.page.url);
    paint();
  });
  head.appendChild(dis);
  s.appendChild(head);
  const box = el('div', 'chg');

  diffs.forEach((d) => {
    const r = el('div', 'chg-row' + (d.kind === 'num' ? ' chg-num' : ''));
    r.appendChild(el('div', 'chg-k', d.label));
    const v = el('div', 'chg-v');
    if (d.kind === 'num') {
      v.appendChild(el('span', 'chg-from', d.from));
      v.appendChild(el('span', 'chg-arrow', '\u2192'));
      const dir = d.field === 'score' ? (d.to > d.from ? ' chg-up' : ' chg-down') : '';
      v.appendChild(el('span', 'chg-to' + dir, d.to));
    } else if (!d.from) {
      v.appendChild(el('span', 'chg-to', d.to || '(empty)'));
      v.appendChild(el('span', 'chg-arrow', '  added'));
    } else if (!d.to) {
      v.appendChild(el('span', 'chg-from', d.from));
      v.appendChild(el('span', 'chg-arrow', '  removed'));
    } else {
      v.appendChild(el('span', 'chg-from', d.from));
      v.appendChild(el('div', 'chg-to', d.to));
    }
    r.appendChild(v);
    box.appendChild(r);
  });

  s.appendChild(box);
  target.appendChild(s);
}

/* ---------- content ---------- */

// Always shown. The raw-versus-rendered split only appears when the two
// diverge, so without this the word count had nowhere to live.
function renderContent(target) {
  const d = DATA;
  const s = section('Content');
  const box = el('div', 'det');
  const g = el('div', 'det-grid');
  cell(g, 'Words', d.content.domWords.toLocaleString());
  cell(g, 'Headings', d.headings.total);
  cell(g, 'H1', d.headings.counts.h1);
  cell(g, 'Page weight', Math.round(d.page.htmlBytes / 1024) + ' KB');
  box.appendChild(g);
  s.appendChild(box);
  target.appendChild(s);
}

/* ---------- hreflang ---------- */

function renderHreflang(target) {
  const alts = DATA.alternates;
  if (!alts.length) return;
  const s = section('hreflang', String(alts.length));
  const box = el('div', 'hl');
  alts.forEach((a) => {
    const code = (a.hreflang || '').toLowerCase();
    const isXdef = code === 'x-default';
    // x-default routinely points at the English page, so matching the current
    // URL there is expected rather than notable.
    const isSelf = !isXdef && a.href === DATA.page.url;
    const r = el('div', 'hl-row' + (isSelf ? ' self' : '') + (isXdef ? ' xdef' : ''));
    r.appendChild(el('span', 'hl-code', a.hreflang || '?'));
    const u = el('span', 'hl-url', (a.href || '').replace(/^https?:\/\//, ''));
    u.title = a.href || '';
    r.appendChild(u);
    box.appendChild(r);
  });
  s.appendChild(box);
  target.appendChild(s);
}

/* ---------- links ---------- */

function cell(grid, label, value, dim) {
  const c = el('div', 'det-cell');
  c.appendChild(el('div', 'det-l', label));
  c.appendChild(el('div', 'det-v' + (dim ? ' dim' : ''), value));
  grid.appendChild(c);
}

function renderLinks(target) {
  const l = DATA.links;
  if (!l.total) return;
  const s = section('Links', String(l.total));
  const box = el('div', 'det');

  const g = el('div', 'det-grid');
  cell(g, 'Internal', l.internal);
  cell(g, 'External', l.external);
  cell(g, 'Nofollow', l.nofollow);
  cell(g, 'Sponsored or UGC', l.sponsored + l.ugc);
  box.appendChild(g);

  if (l.externalDomains.length) {
    const m = el('div', 'det-more');
    m.appendChild(el('div', 'det-more-h', l.externalDomains.length + ' external domain' + (l.externalDomains.length > 1 ? 's' : '')));
    const list = el('div', 'dom-list');
    l.externalDomains.slice(0, 24).forEach((d) => list.appendChild(el('span', 'dom', d)));
    if (l.externalDomains.length > 24) list.appendChild(el('span', 'dom', '+' + (l.externalDomains.length - 24)));
    m.appendChild(list);
    box.appendChild(m);
  }

  s.appendChild(box);
  target.appendChild(s);
}

/* ---------- images ---------- */

function renderImages(target) {
  const im = DATA.images;
  if (!im.total && !(DATA.svg && DATA.svg.total)) return;
  const s = section('Images', String(im.total));
  const box = el('div', 'det');

  const g = el('div', 'det-grid');
  cell(g, 'With alt', im.withAlt);
  cell(g, 'Decorative, alt=""', im.emptyAlt);
  cell(g, 'Missing alt', im.missingAlt);
  cell(g, 'Lazy loaded', im.lazy);
  box.appendChild(g);

  // Inline svg is reported separately: <svg> takes no alt, so folding it into
  // the figures above would make the alt columns wrong.
  const sv = DATA.svg;
  if (sv && sv.total) {
    const m = el('div', 'det-more');
    m.appendChild(el('div', 'det-more-h', 'Inline SVG, counted separately'));
    const parts = [sv.total + ' total', sv.hidden + ' hidden from readers', sv.named + ' labelled'];
    if (sv.bare) parts.push(sv.bare + ' unlabelled');
    m.appendChild(el('div', 'alt-txt', parts.join(' \u00b7 ')));
    box.appendChild(m);
  }

  // Show the ones that need attention, not the whole set.
  const bad = im.list.filter((i) => i.alt === null).slice(0, 6);
  if (bad.length) {
    const m = el('div', 'det-more');
    m.appendChild(el('div', 'det-more-h', 'Missing alt'));
    const list = el('div', 'alt-list');
    bad.forEach((i) => {
      const r = el('div', 'alt-row');
      if (i.src) {
        const t = el('img', 'alt-thumb');
        t.src = i.src;
        t.alt = '';
        t.addEventListener('error', () => { t.style.visibility = 'hidden'; });
        r.appendChild(t);
      }
      const name = i.src ? i.src.split('/').pop().split('?')[0] : '(no src)';
      r.appendChild(el('span', 'alt-txt none', name));
      list.appendChild(r);
    });
    m.appendChild(list);
    box.appendChild(m);
  }

  s.appendChild(box);
  target.appendChild(s);
}

/* ---------- overview ---------- */

function renderOverview(target) {
  const d = DATA;
  const s = section('Overview');
  const rows = el('div', 'rows');

  if (d.meta.titleLength) rows.appendChild(row('Title', d.meta.title, d.meta.titleLength, counted(d.meta.titleLength, 30, 60)));
  if (d.meta.descriptionLength) rows.appendChild(row('Description', d.meta.description, d.meta.descriptionLength, counted(d.meta.descriptionLength, 70, 160)));
  if (d.meta.canonical && d.meta.canonicalIsSelf) rows.appendChild(inlineRow('Canonical', 'Self-referencing', 'pass'));
  if (d.meta.canonical && !d.meta.canonicalIsSelf) rows.appendChild(row('Canonical', d.meta.canonical, null, null));
  if (d.meta.robots) rows.appendChild(inlineRow('Meta robots', d.meta.robots, /noindex/i.test(d.meta.robots) ? 'bad' : 'pass'));
  if (d.page.lang) rows.appendChild(inlineRow('Language', d.page.lang, 'pass'));

  if (!rows.children.length) return;
  s.appendChild(rows);
  target.appendChild(s);
}

function renderHeadings(target) {
  const d = DATA;
  if (!d.headings.total) return;
  const s = section('Headings');
  const t = el('div', 'htree');
  d.headings.list.forEach((h) => {
    const i = el('div', 'h-item');
    i.style.paddingLeft = ((h.level - 1) * 10) + 'px';
    i.appendChild(el('span', 'h-tag', 'H' + h.level));
    i.appendChild(el('span', 'h-txt', h.text || '(empty)'));
    t.appendChild(i);
  });
  s.appendChild(t);
  target.appendChild(s);
}

/* ---------- paint ---------- */

function paint() {
  const m = $('body');
  const scroll = m.scrollTop;
  m.textContent = '';
  renderScore(m);
  renderCompare(m);
  renderFindings(m);
  renderAgents(m);
  renderRaw(m);
  renderHistory(m);
  renderSchema(m);
  renderSocial(m);
  renderOverview(m);
  renderContent(m);
  renderLinks(m);
  renderImages(m);
  renderHreflang(m);
  renderHeadings(m);
  m.scrollTop = scroll;
}

function markdown() {
  const d = DATA;
  const L = [];
  L.push('# ' + (d.meta.title || '(no title)'));
  L.push('');
  L.push(d.page.url);
  L.push('');
  L.push('- Title: ' + d.meta.titleLength + ' chars');
  L.push('- Description: ' + d.meta.descriptionLength + ' chars');
  L.push('- Canonical: ' + (d.meta.canonical || 'missing'));
  L.push('- Language: ' + (d.page.lang || 'not declared'));
  L.push('- Words: ' + d.content.domWords);
  L.push('- Headings: ' + d.headings.total + ' (H1 ' + d.headings.counts.h1 + ')');
  L.push('- Images: ' + d.images.total + ', ' + d.images.missingAlt + ' without alt');
  L.push('- Links: ' + d.links.internal + ' internal, ' + d.links.external + ' external');
  if (PROBE && PROBE.raw && PROBE.raw.ok) {
    L.push('- HTML words: ' + PROBE.raw.words + ' vs ' + d.content.domWords + ' after JavaScript');
  }
  if (PROBE && PROBE.robots && PROBE.robots.ok) {
    const blocked = PROBE.robots.agents.filter((a) => !a.allowed).map((a) => a.token);
    L.push('- Blocked crawlers: ' + (blocked.length ? blocked.join(', ') : 'none'));
    L.push('- Sitemaps declared: ' + (PROBE.robots.sitemaps.length || 'none'));
  }
  L.push('');
  const _sc = scorePage(runChecks(DATA, PROBE), !!PROBE);
  L.push(_sc.fatal ? ('Status: ' + _sc.label + '. ' + _sc.why) : ('Score: ' + _sc.score + '/100'));
  L.push('');
  L.push('Findings');
  const _f = runChecks(DATA, PROBE);
  if (!_f.length) L.push('  none');
  _f.forEach((f) => {
    L.push('  [' + f.sev + '] ' + f.title);
    if (f.items) L.push('      ' + f.items.join(', '));
    if (f.evidence) f.evidence.slice(0, 10).forEach((x) => L.push('      ' + x));
  });
  L.push('');
  L.push('Headings');
  d.headings.list.forEach((h) => L.push('  '.repeat(h.level - 1) + 'H' + h.level + ' ' + h.text));
  return L.join('\n');
}

async function main() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || RESTRICTED.test(tab.url)) {
    fail('This page cannot be inspected. Browser and extension pages are off limits.');
    return;
  }

  TAB_ID = tab.id;

  try {
    const u = new URL(tab.url);
    $('host').textContent = u.hostname;
    $('path').textContent = (u.pathname + u.search) || '/';
  } catch (e) { /* leave blank */ }

  let res;
  try {
    res = await api.scripting.executeScript({ target: { tabId: tab.id }, files: ['/lib/collect.js'] });
  } catch (e) {
    fail('Could not read this page. ' + ((e && e.message) || e));
    return;
  }

  DATA = res && res[0] && res[0].result;
  if (!DATA) { fail('Could not read this page.'); return; }
  if (DATA.fatal) { fail('Read failed: ' + DATA.fatal); return; }

  HISTORY = await historyLoad(api, DATA.page.url);
  try {
    const got = await api.storage.local.get('pinned');
    PINNED = (got && got.pinned) || null;
    if (PINNED && PINNED.url !== DATA.page.url) $('pin').classList.add('on');
  } catch (e) { PINNED = null; }

  paint();

  try {
    const pr = await api.scripting.executeScript({ target: { tabId: tab.id }, files: ['/lib/probe.js'] });
    PROBE = (pr && pr[0] && pr[0].result) || null;
  } catch (e) {
    PROBE = { robots: { ok: false, error: (e && e.message) || String(e) }, raw: { ok: false, error: 'blocked' } };
  }
  paint();

  // Written last so the snapshot reflects probe-derived findings too.
  await historySave(api, DATA.page.url, snapshot(DATA, PROBE, runChecks(DATA, PROBE)));
}

$('pin').addEventListener('click', async () => {
  if (!DATA || !PROBE) return;
  const rec = { url: DATA.page.url, snap: snapshot(DATA, PROBE, runChecks(DATA, PROBE)) };
  try {
    await api.storage.local.set({ pinned: rec });
    PINNED = rec;
    $('pin').classList.add('on');
    paint();
  } catch (e) { console.error('[sona] pin', e); }
});

$('copy').addEventListener('click', async () => {
  if (!DATA) return;
  try {
    await navigator.clipboard.writeText(markdown());
    $('copy').classList.add('done');
    setTimeout(() => $('copy').classList.remove('done'), 1200);
  } catch (e) { console.error('[sona] clipboard', e); }
});

main();
