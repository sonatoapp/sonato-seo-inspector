// Injected into the active tab on user action. Synchronous, no network.
// Returns one structured-cloneable object; the popup renders every section from it.
(() => {
  try {
  const CAP = { headings: 300, images: 500, links: 1500, alternates: 200 };

  const abs = (u) => { try { return new URL(u, document.baseURI).href; } catch (e) { return null; } };
  const txt = (s) => (s == null ? '' : String(s).replace(/\s+/g, ' ').trim());

  const metaBy = (attr, value) => {
    const el = document.head && document.head.querySelector(`meta[${attr}="${CSS.escape(value)}"]`);
    return el ? txt(el.getAttribute('content')) : null;
  };

  // Unicode-aware. Whitespace splitting undercounts to zero on CJK and Thai.
  const countWords = (text, lang) => {
    if (!text) return 0;
    try {
      if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        const seg = new Intl.Segmenter(lang || undefined, { granularity: 'word' });
        let n = 0;
        for (const s of seg.segment(text)) { if (s.isWordLike) n++; }
        return n;
      }
    } catch (e) { /* invalid BCP-47 tag, fall through */ }
    return text.trim().split(/\s+/).filter(Boolean).length;
  };

  // Same routine must run against the raw HTML in probe.js, so the two counts compare.
  const textOf = (doc) => {
    const body = doc && doc.body;
    if (!body) return '';
    const clone = body.cloneNode(true);
    clone.querySelectorAll('script,style,noscript,template,svg').forEach((n) => n.remove());
    return txt(clone.textContent);
  };

  // A link without visible text still has an accessible name if any of these
  // hold. Verified against sona.to: aria-label, img[alt] and a title attribute
  // are all in use on the same page, so testing only one of them is wrong.
  const accName = (a) => {
    if (txt(a.getAttribute('aria-label'))) return true;
    if (a.getAttribute('aria-labelledby')) return true;
    if (txt(a.getAttribute('title'))) return true;
    const im = a.querySelector('img[alt]');
    if (im && im.getAttribute('alt').trim()) return true;
    const st = a.querySelector('svg > title, svg [role="img"] > title');
    if (st && txt(st.textContent)) return true;
    if (a.querySelector('svg[aria-label]')) return true;
    return false;
  };

  const lang = txt(document.documentElement.getAttribute('lang')) || null;

  // --- meta -------------------------------------------------------------
  const canonicalEl = document.head && document.head.querySelector('link[rel="canonical"]');
  const title = txt(document.title);
  const description = metaBy('name', 'description');

  // --- headings ---------------------------------------------------------
  const hNodes = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
  const headings = hNodes.slice(0, CAP.headings).map((h, idx) => ({
    idx: idx,
    level: Number(h.tagName.slice(1)),
    text: txt(h.innerText || h.textContent),
  }));
  const headingCounts = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
  hNodes.forEach((h) => { headingCounts[h.tagName.toLowerCase()]++; });

  // --- images -----------------------------------------------------------
  const imgNodes = Array.from(document.images || []);
  let withAlt = 0, emptyAlt = 0, missingAlt = 0, lazy = 0;
  imgNodes.forEach((im) => {
    const has = im.hasAttribute('alt');
    const val = has ? im.getAttribute('alt').trim() : null;
    if (!has) missingAlt++; else if (val === '') emptyAlt++; else withAlt++;
    if ((im.getAttribute('loading') || '').toLowerCase() === 'lazy') lazy++;
  });

  // --- inline svg -------------------------------------------------------
  // Not images in the <img> sense: no alt attribute exists on <svg>. Counted
  // separately so the Images figures stay honest and alt rules never fire here.
  const svgNodes = Array.from(document.querySelectorAll('svg'));
  let svgHidden = 0, svgNamed = 0, svgBare = 0;
  const svgBareIdx = [];
  svgNodes.forEach((sv, svIdx) => {
    if (sv.closest('svg') !== sv) return; // nested <svg>, count the outer only
    if (sv.getAttribute('aria-hidden') === 'true') { svgHidden++; return; }
    const own = txt(sv.getAttribute('aria-label'))
      || !!sv.getAttribute('aria-labelledby')
      || txt((sv.querySelector(':scope > title') || {}).textContent);
    if (own) { svgNamed++; return; }
    // An icon inside an already-named control is fine: the control carries
    // the name. Only a bare, unnamed, non-hidden svg is a real gap.
    const host = sv.closest('a[aria-label], a[title], button[aria-label], button[title], [role="img"][aria-label]');
    if (host) { svgNamed++; return; }
    svgBare++;
    if (svgBareIdx.length < 50) svgBareIdx.push(svIdx);
  });

  // --- links ------------------------------------------------------------
  const host = location.hostname;
  const aNodes = Array.from(document.querySelectorAll('a[href]'));
  let internal = 0, external = 0, nofollow = 0, sponsored = 0, ugc = 0, noopener = 0, empty = 0;
  const domains = new Set();
  const links = [];
  aNodes.forEach((a, i) => {
    const href = abs(a.getAttribute('href'));
    if (!href || !/^https?:/i.test(href)) return;
    const rel = (a.getAttribute('rel') || '').toLowerCase().split(/\s+/).filter(Boolean);
    let h = null; try { h = new URL(href).hostname; } catch (e) { return; }
    const isInternal = (h === host);
    if (isInternal) internal++; else { external++; domains.add(h); }
    if (rel.includes('nofollow')) nofollow++;
    if (rel.includes('sponsored')) sponsored++;
    if (rel.includes('ugc')) ugc++;
    if (rel.includes('noopener')) noopener++;
    const anchor = txt(a.innerText || a.textContent);
    const named = !!anchor || accName(a);
    if (!named) empty++;
    if (i < CAP.links) links.push({ idx: i, href, anchor, rel, internal: isInternal, named });
  });

  // --- structured data --------------------------------------------------
  const jsonld = [];
  Array.from(document.querySelectorAll('script[type="application/ld+json"]')).forEach((s) => {
    const raw = s.textContent || '';
    try {
      jsonld.push({ ok: true, data: JSON.parse(raw) });
    } catch (e) {
      jsonld.push({ ok: false, error: String(e.message || e), preview: raw.slice(0, 200) });
    }
  });
  const microdata = Array.from(new Set(
    Array.from(document.querySelectorAll('[itemtype]'))
      .map((n) => txt(n.getAttribute('itemtype')))
      .filter(Boolean)
  ));

  // --- social tags ------------------------------------------------------
  const social = { og: {}, twitter: {} };
  Array.from(document.head ? document.head.querySelectorAll('meta[property],meta[name]') : []).forEach((m) => {
    const key = txt(m.getAttribute('property') || m.getAttribute('name')).toLowerCase();
    const val = txt(m.getAttribute('content'));
    if (!key || !val) return;
    if (key.startsWith('og:')) social.og[key.slice(3)] = val;
    else if (key.startsWith('twitter:')) social.twitter[key.slice(8)] = val;
  });

  // --- alternates -------------------------------------------------------
  const alternates = Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]'))
    .slice(0, CAP.alternates)
    .map((l) => ({ hreflang: txt(l.getAttribute('hreflang')), href: abs(l.getAttribute('href')) }));

  // --- text -------------------------------------------------------------
  const renderedText = txt(document.body ? document.body.innerText : '');
  const domText = textOf(document);

  return {
    schemaVersion: 1,
    collectedAt: Date.now(),
    page: {
      url: location.href,
      origin: location.origin,
      hostname: host,
      pathname: location.pathname,
      protocol: location.protocol,
      lang,
      charset: document.characterSet || null,
      viewport: metaBy('name', 'viewport'),
      htmlBytes: (document.documentElement.outerHTML || '').length,
    },
    meta: {
      title, titleLength: title.length,
      description, descriptionLength: description ? description.length : 0,
      canonical: canonicalEl ? abs(canonicalEl.getAttribute('href')) : null,
      canonicalIsSelf: canonicalEl ? abs(canonicalEl.getAttribute('href')) === location.href : null,
      robots: metaBy('name', 'robots'),
      googlebot: metaBy('name', 'googlebot'),
      author: metaBy('name', 'author'),
    },
    headings: { list: headings, counts: headingCounts, total: hNodes.length, truncated: hNodes.length > CAP.headings },
    images: {
      total: imgNodes.length, withAlt, emptyAlt, missingAlt, lazy,
      list: imgNodes.slice(0, CAP.images).map((im, idx) => ({
        idx: idx,
        src: abs(im.getAttribute('src') || im.currentSrc || ''),
        alt: im.hasAttribute('alt') ? im.getAttribute('alt') : null,
        width: im.naturalWidth || null, height: im.naturalHeight || null,
      })),
    },
    links: {
      total: internal + external, internal, external,
      nofollow, sponsored, ugc, noopener, emptyAnchor: empty,
      externalDomains: Array.from(domains).sort(),
      list: links,
    },
    structured: { jsonld, microdata },
    svg: { total: svgNodes.length, hidden: svgHidden, named: svgNamed, bare: svgBare, bareIdx: svgBareIdx },
    social,
    alternates,
    content: {
      words: countWords(renderedText, lang),
      domWords: countWords(domText, lang),
      chars: renderedText.length,
      segmenter: (typeof Intl !== 'undefined' && !!Intl.Segmenter),
    },
  };
  } catch (e) {
    return { schemaVersion: 1, fatal: String((e && e.message) || e) };
  }
})();
