// Snapshot history in chrome.storage.local. Everything stays on the machine;
// nothing is sent anywhere, which is what lets the manifest declare no data
// collection on Firefox.

var HIST_KEYS = 300;   // distinct URLs retained
var HIST_DEPTH = 5;    // snapshots kept per URL

// Query strings fragment history: ?utm_source=x would create a second entry
// for the same page. Hash too. Key on origin + pathname only.
function histKey(url) {
  try {
    const u = new URL(url);
    return 'h:' + u.origin + u.pathname;
  } catch (e) {
    return 'h:' + String(url).split('?')[0];
  }
}

function snapshot(d, p, findings) {
  return {
    t: Date.now(),
    title: d.meta.title || '',
    desc: d.meta.description || '',
    h1: (d.headings.list.filter((h) => h.level === 1)[0] || {}).text || '',
    canonical: d.meta.canonical || '',
    words: d.content.domWords,
    headings: d.headings.total,
    links: d.links.total,
    images: d.images.total,
    schema: d.structured.jsonld.length + d.structured.microdata.length,
    ogImage: d.social.og.image || '',
    findings: findings.length,
    // The score is the point of the history: a number that moved is the
    // signal, a field that changed is the detail. Null when fatal, since
    // "not indexable" is a state rather than a value to compare.
    score: (function () {
      try {
        var r = scorePage(findings, !!p);
        return r.fatal ? null : r.score;
      } catch (e) { return null; }
    })(),
    // Only recorded once the probe lands, so a first paint cannot write a
    // snapshot that looks like the site lost its robots.txt.
    probed: !!p
  };
}

var FIELD_LABELS = {
  title: 'Title', desc: 'Description', h1: 'H1', canonical: 'Canonical',
  score: 'Score', words: 'Word count', headings: 'Headings', links: 'Links',
  images: 'Images', schema: 'Structured data blocks', ogImage: 'og:image'
};

var TEXT_FIELDS = ['title', 'desc', 'h1', 'canonical', 'ogImage'];
var NUM_FIELDS = ['score', 'words', 'headings', 'links', 'images', 'schema'];

function diffSnapshots(prev, now) {
  const out = [];
  TEXT_FIELDS.forEach((f) => {
    if ((prev[f] || '') !== (now[f] || '')) {
      out.push({ field: f, label: FIELD_LABELS[f], kind: 'text', from: prev[f] || '', to: now[f] || '' });
    }
  });
  NUM_FIELDS.forEach((f) => {
    if (f === 'score' && (prev.score == null || now.score == null)) return;
    const a = prev[f] || 0, b = now[f] || 0;
    if (a === b) return;
    // Ignore trivial word drift: a rotating testimonial is not a content change.
    if (f === 'words' && Math.abs(b - a) <= 3) return;
    out.push({ field: f, label: FIELD_LABELS[f], kind: 'num', from: a, to: b });
  });
  return out;
}

async function historyLoad(api, url) {
  try {
    const k = histKey(url);
    const got = await api.storage.local.get(k);
    return (got && got[k]) || null;
  } catch (e) { console.error('[sona] history read', e); return null; }
}

async function historySave(api, url, snap) {
  try {
    const k = histKey(url);
    const got = await api.storage.local.get(k);
    const list = (got && got[k]) || [];
    const last = list[list.length - 1];

    // Only write when something actually differs, so opening the panel
    // repeatedly on one page does not fill storage with identical rows.
    if (last && !diffSnapshots(last, snap).length) return;

    list.push(snap);
    while (list.length > HIST_DEPTH) list.shift();
    await api.storage.local.set({ [k]: list });
    await historyEvict(api);
  } catch (e) { console.error('[sona] history write', e); }
}

async function historyEvict(api) {
  try {
    const all = await api.storage.local.get(null);
    const keys = Object.keys(all).filter((k) => k.indexOf('h:') === 0);
    if (keys.length <= HIST_KEYS) return;
    // Oldest last-seen goes first.
    keys.sort((a, b) => {
      const la = all[a][all[a].length - 1], lb = all[b][all[b].length - 1];
      return (la ? la.t : 0) - (lb ? lb.t : 0);
    });
    await api.storage.local.remove(keys.slice(0, keys.length - HIST_KEYS));
  } catch (e) { console.error('[sona] history evict', e); }
}

function agoLabel(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 90) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
  const dd = Math.floor(h / 24);
  if (dd < 30) return dd + (dd === 1 ? ' day ago' : ' days ago');
  const mo = Math.floor(dd / 30);
  return mo + (mo === 1 ? ' month ago' : ' months ago');
}
