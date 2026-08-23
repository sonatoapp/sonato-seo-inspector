// Injected after collect.js, as a second executeScript call. Async, same-origin only.
// Fetches run in the page's isolated world and inherit its origin, which is why
// activeTab alone is sufficient and no host_permission is ever needed.
(async () => {
  const T = 8000;

  // Tokens must stay in sync with popup/agents.js. The popup asserts this at load.
  // job: 'training' (no citation cost if blocked) | 'retrieval' (blocking kills
  // citations) | 'user' (fetches on a human action) | 'search' (classic index).
  const AGENTS = [
    { t: 'Googlebot',           job: 'search'    },
    { t: 'Bingbot',             job: 'search'    },
    { t: 'GPTBot',              job: 'training'  },
    { t: 'OAI-SearchBot',       job: 'retrieval' },
    { t: 'ChatGPT-User',        job: 'user'      },
    { t: 'ClaudeBot',           job: 'training'  },
    { t: 'Claude-SearchBot',    job: 'retrieval' },
    { t: 'Claude-User',         job: 'user'      },
    { t: 'PerplexityBot',       job: 'retrieval' },
    { t: 'Perplexity-User',     job: 'user',      ignoresRobots: true },
    { t: 'Google-Extended',     job: 'training',  tokenOnly: true },
    { t: 'Applebot-Extended',   job: 'training',  tokenOnly: true },
    { t: 'Applebot',            job: 'search'    },
    { t: 'DuckAssistBot',       job: 'retrieval' },
    { t: 'CCBot',               job: 'training'  },
    { t: 'Bytespider',          job: 'training',  ignoresRobots: true },
    { t: 'Meta-ExternalAgent',  job: 'training'  },
    { t: 'Amazonbot',           job: 'training'  },
  ];

  const timed = async (url, opts) => {
    const ac = new AbortController();
    const id = setTimeout(() => ac.abort(), T);
    try { return await fetch(url, Object.assign({ signal: ac.signal, credentials: 'same-origin' }, opts || {})); }
    finally { clearTimeout(id); }
  };

  const txt = (s) => (s == null ? '' : String(s).replace(/\s+/g, ' ').trim());

  // Must match collect.js exactly, or the raw/rendered comparison is meaningless.
  const countWords = (text, lang) => {
    if (!text) return 0;
    try {
      if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        const seg = new Intl.Segmenter(lang || undefined, { granularity: 'word' });
        let n = 0;
        for (const s of seg.segment(text)) { if (s.isWordLike) n++; }
        return n;
      }
    } catch (e) { /* invalid tag */ }
    return text.trim().split(/\s+/).filter(Boolean).length;
  };
  const textOf = (doc) => {
    const body = doc && doc.body;
    if (!body) return '';
    const clone = body.cloneNode(true);
    clone.querySelectorAll('script,style,noscript,template,svg').forEach((n) => n.remove());
    return txt(clone.textContent);
  };

  // --- robots.txt -------------------------------------------------------
  // Groups: consecutive user-agent lines share one group; a rule line closes it.
  const parseRobots = (text) => {
    const groups = [];
    const sitemaps = [];
    let cur = null, collectingAgents = false;
    for (let raw of text.split(/\r?\n/)) {
      const h = raw.indexOf('#');
      if (h !== -1) raw = raw.slice(0, h);
      const line = raw.trim();
      if (!line) continue;
      const i = line.indexOf(':');
      if (i === -1) continue;
      const field = line.slice(0, i).trim().toLowerCase();
      const value = line.slice(i + 1).trim();
      if (field === 'user-agent') {
        if (!collectingAgents || !cur) { cur = { agents: [], rules: [] }; groups.push(cur); collectingAgents = true; }
        if (value) cur.agents.push(value.toLowerCase());
      } else if (field === 'allow' || field === 'disallow') {
        if (!cur) { cur = { agents: ['*'], rules: [] }; groups.push(cur); }
        collectingAgents = false;
        if (value) cur.rules.push({ allow: field === 'allow', path: value });
        else if (field === 'disallow') cur.rules.push({ allow: true, path: '/', empty: true });
      } else if (field === 'sitemap' && value) {
        sitemaps.push(value);
      }
    }
    return { groups, sitemaps };
  };

  // '*' is any run, trailing '$' anchors the end, otherwise prefix match.
  const pathMatches = (pattern, path) => {
    let p = pattern, anchored = false;
    if (p.endsWith('$')) { anchored = true; p = p.slice(0, -1); }
    const parts = p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
    try { return new RegExp('^' + parts.join('.*') + (anchored ? '$' : '')).test(path); }
    catch (e) { return false; }
  };

  // Most specific matching group wins: exact token, else longest prefix, else '*'.
  const groupFor = (groups, token) => {
    const tok = token.toLowerCase();
    let best = null, bestLen = -1;
    groups.forEach((g) => {
      g.agents.forEach((a) => {
        if (a === '*') { if (bestLen < 0) { best = best || g; } return; }
        if (tok === a || tok.startsWith(a)) {
          if (a.length > bestLen) { bestLen = a.length; best = g; }
        }
      });
    });
    if (bestLen >= 0) return best;
    const star = groups.find((g) => g.agents.includes('*'));
    return star || null;
  };

  // Longest matching rule wins; on equal length Allow beats Disallow.
  const verdict = (group, path) => {
    if (!group) return { allowed: true, reason: 'no matching group' };
    let win = null;
    group.rules.forEach((r) => {
      if (!pathMatches(r.path, path)) return;
      if (!win || r.path.length > win.path.length || (r.path.length === win.path.length && r.allow)) win = r;
    });
    if (!win) return { allowed: true, reason: 'no matching rule' };
    return { allowed: win.allow, reason: (win.allow ? 'Allow: ' : 'Disallow: ') + win.path };
  };

  const out = {
    schemaVersion: 1,
    probedAt: Date.now(),
    robots: { status: null, ok: false, error: null, sitemaps: [], agents: [] },
    llms: { txt: null },
    raw: { ok: false, error: null },
    ogImage: null,
  };

  const path = location.pathname + location.search;

  // robots.txt
  try {
    const r = await timed(location.origin + '/robots.txt');
    out.robots.status = r.status;
    if (r.ok) {
      const body = await r.text();
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('html') || /^\s*</.test(body)) {
        out.robots.error = 'served HTML, not a robots.txt';
      } else {
        const parsed = parseRobots(body);
        out.robots.ok = true;
        out.robots.bytes = body.length;
        out.robots.sitemaps = parsed.sitemaps;
        out.robots.agents = AGENTS.map((a) => {
          const g = groupFor(parsed.groups, a.t);
          const v = verdict(g, path);
          return {
            token: a.t, job: a.job,
            tokenOnly: !!a.tokenOnly, ignoresRobots: !!a.ignoresRobots,
            explicit: !!(g && g.agents.some((x) => x === a.t.toLowerCase())),
            allowed: v.allowed, reason: v.reason,
          };
        });
      }
    }
  } catch (e) { out.robots.error = String((e && e.message) || e); }

  // llms.txt. HEAD only, one file. The browser logs a 404 no matter how we
  // handle it, so we make exactly one request rather than two.
  try {
    const r = await timed(location.origin + '/llms.txt', { method: 'HEAD' });
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    out.llms.txt = {
      status: r.status,
      exists: r.ok && !ct.includes('html'),
      bytes: r.headers.get('content-length') || null
    };
  } catch (e) { out.llms.txt = { status: null, exists: false, error: String((e && e.message) || e) }; }

  // og:image dimensions. Platforms pick large-card vs thumbnail layout from the
  // real pixel size, so the declared tag alone cannot tell you how it renders.
  const ogImg = document.head && document.head.querySelector('meta[property="og:image"]');
  if (ogImg && ogImg.getAttribute('content')) {
    try {
      const src = new URL(ogImg.getAttribute('content'), document.baseURI).href;
      out.ogImage = await new Promise((resolve) => {
        const im = new Image();
        const done = (v) => resolve(v);
        im.onload = () => done({ src: src, width: im.naturalWidth, height: im.naturalHeight, ok: true });
        im.onerror = () => done({ src: src, ok: false, error: 'did not load' });
        setTimeout(() => done({ src: src, ok: false, error: 'timed out' }), T);
        im.src = src;
      });
    } catch (e) { out.ogImage = { ok: false, error: String((e && e.message) || e) }; }
  }

  // Raw HTML as a crawler receives it, plus response headers the DOM cannot show.
  try {
    const r = await timed(location.href, { cache: 'no-store' });
    out.raw.status = r.status;
    out.raw.contentType = r.headers.get('content-type');
    out.raw.xRobotsTag = r.headers.get('x-robots-tag');
    out.raw.linkHeader = r.headers.get('link');
    if (r.ok) {
      const html = await r.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const lang = txt(doc.documentElement && doc.documentElement.getAttribute('lang')) || null;
      const can = doc.querySelector('link[rel="canonical"]');
      const desc = doc.querySelector('meta[name="description"]');
      out.raw.ok = true;
      out.raw.bytes = html.length;
      out.raw.title = txt(doc.title) || null;
      out.raw.description = desc ? txt(desc.getAttribute('content')) : null;
      out.raw.canonical = can ? txt(can.getAttribute('href')) : null;
      out.raw.lang = lang;
      out.raw.h1 = doc.querySelectorAll('h1').length;
      out.raw.headings = doc.querySelectorAll('h1,h2,h3,h4,h5,h6').length;
      out.raw.images = doc.querySelectorAll('img').length;
      out.raw.links = doc.querySelectorAll('a[href]').length;
      out.raw.jsonld = doc.querySelectorAll('script[type="application/ld+json"]').length;
      out.raw.words = countWords(textOf(doc), lang);
    }
  } catch (e) { out.raw.error = String((e && e.message) || e); }

  return out;
})().catch((e) => ({ schemaVersion: 1, fatal: String((e && e.message) || e) }));
