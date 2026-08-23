// Every check the panel runs. One entry per rule.
// test(d, p) -> falsy for pass, or a string to show as the finding title.
//   d = collect.js result, p = probe.js result (may be null while probing)
// sev: 'broken' (page cannot rank or is malformed) | 'missing' (opportunity)
// needs: 'probe' if the rule cannot run until the probe lands.

var CHECKS = [

  { id: 'meta-noindex', w: 'fatal', sev: 'broken', group: 'Indexability',
    test: (d) => /noindex/i.test(d.meta.robots || '') && 'Page is set to noindex',
    why: 'A meta robots noindex tag keeps this page out of search results.' },

  { id: 'header-noindex', w: 'fatal', sev: 'broken', group: 'Indexability', needs: 'probe',
    test: (d, p) => p.raw && p.raw.ok && /noindex/i.test(p.raw.xRobotsTag || '') && 'X-Robots-Tag: noindex',
    why: 'Sent as a response header, so it does not appear in the page source.' },

  { id: 'robots-blocked', w: 'fatal', sev: 'broken', group: 'Indexability', needs: 'probe',
    test: (d, p) => {
      if (!p.robots || !p.robots.ok) return false;
      const g = p.robots.agents.find((a) => a.token === 'Googlebot');
      return g && !g.allowed && 'Googlebot is blocked from this URL';
    },
    why: 'robots.txt disallows this path, so the page will not be crawled.' },

  { id: 'canonical-missing', w: 7, sev: 'missing', group: 'Indexability',
    test: (d) => !d.meta.canonical && 'No canonical link',
    why: 'Without one, duplicate URLs of this page compete with each other.' },

  { id: 'canonical-other', w: 7, sev: 'missing', group: 'Indexability',
    test: (d) => d.meta.canonical && !d.meta.canonicalIsSelf && 'Canonical points elsewhere',
    evidence: (d) => [d.meta.canonical],
    why: 'This page is telling search engines to index a different URL.' },

  { id: 'title-missing', w: 10, sev: 'broken', group: 'Meta',
    test: (d) => !d.meta.titleLength && 'No title',
    why: 'The title is the strongest on-page signal and the search result headline.' },

  { id: 'title-length', w: 3, sev: 'missing', group: 'Meta',
    test: (d) => d.meta.titleLength && (d.meta.titleLength < 30 || d.meta.titleLength > 60)
      && (d.meta.titleLength < 30 ? 'Title is short' : 'Title is long'),
    why: 'Around 30 to 60 characters displays without truncation.' },

  { id: 'desc-missing', w: 7, sev: 'missing', group: 'Meta',
    test: (d) => !d.meta.descriptionLength && 'No meta description',
    why: 'Search engines will pull an arbitrary snippet from the page instead.' },

  { id: 'desc-length', w: 3, sev: 'missing', group: 'Meta',
    test: (d) => d.meta.descriptionLength && (d.meta.descriptionLength < 70 || d.meta.descriptionLength > 160)
      && (d.meta.descriptionLength < 70 ? 'Description is short' : 'Description is long'),
    why: 'Around 70 to 160 characters displays without truncation.' },

  { id: 'lang-missing', w: 3, sev: 'missing', group: 'Meta',
    test: (d) => !d.page.lang && 'No lang attribute',
    why: 'The html lang attribute tells crawlers and screen readers which language this is.' },

  { id: 'viewport-missing', w: 3, sev: 'missing', group: 'Meta',
    test: (d) => !d.page.viewport && 'No viewport tag',
    why: 'Without it the page will not render correctly on mobile.' },

  { id: 'charset', w: 1, sev: 'missing', group: 'Meta',
    test: (d) => d.page.charset && d.page.charset.toUpperCase() !== 'UTF-8' && ('Charset is ' + d.page.charset),
    why: 'UTF-8 avoids character corruption in non-Latin text.' },

  { id: 'h1-missing', w: 10, sev: 'broken', group: 'Structure',
    test: (d) => !d.headings.counts.h1 && 'No H1',
    why: 'The H1 states what the page is about.' },

  { id: 'h1-many', w: 3, sev: 'missing', group: 'Structure',
    test: (d) => d.headings.counts.h1 > 1 && (d.headings.counts.h1 + ' H1 headings'),
    why: 'Multiple H1s split the signal about the page topic.' },

  { id: 'h-skip', w: 1, sev: 'missing', group: 'Structure',
    test: (d) => {
      let prev = 0, skip = null;
      d.headings.list.forEach((h) => {
        if (prev && h.level > prev + 1 && !skip) skip = 'H' + prev + ' to H' + h.level;
        prev = h.level;
      });
      return skip && ('Heading level skipped, ' + skip);
    },
    why: 'Heading levels should step down one at a time.' },

  { id: 'h-empty', w: 1, sev: 'missing', group: 'Structure',
    test: (d) => {
      const n = d.headings.list.filter((h) => !h.text).length;
      return n && (n + ' empty heading' + (n > 1 ? 's' : ''));
    },
    evidence: (d) => d.headings.list.map((h, i) => (!h.text ? ('H' + h.level + ' at position ' + (i + 1)) : null)).filter(Boolean),
    targets: (d) => d.headings.list.filter((h) => !h.text).map((h) => ({ q: 'h1,h2,h3,h4,h5,h6', idx: h.idx })),
    why: 'A heading with no text carries no meaning.' },

  { id: 'og-title', w: 3, sev: 'missing', group: 'Social', rollup: 'social',
    test: (d) => !d.social.og.title && 'No og:title',
    why: 'Shared links fall back to the page title, which is often not what you want.' },

  { id: 'og-desc', w: 3, sev: 'missing', group: 'Social', rollup: 'social',
    test: (d) => !d.social.og.description && 'No og:description',
    why: 'Social platforms will show no summary under the link.' },

  { id: 'og-image', w: 3, sev: 'missing', group: 'Social', rollup: 'social',
    test: (d) => !d.social.og.image && 'No og:image',
    why: 'Shared links render as a bare text row with no image.' },

  { id: 'tw-card', w: 1, sev: 'missing', group: 'Social', rollup: 'social',
    test: (d) => !d.social.twitter.card && d.social.og.image && 'No twitter:card',
    why: 'You have an og:image but no card type, so X picks the layout itself.' },

  { id: 'og-image-small', w: 3, sev: 'missing', group: 'Social', needs: 'probe',
    test: (d, p) => {
      const i = p.ogImage;
      if (!i || !i.ok || !i.width) return false;
      if (i.width < 300 || i.height < 157) return 'og:image is too small for a large card';
      if (i.width < 600 || i.height < 315) return 'og:image will render as a thumbnail';
      return false;
    },
    evidence: (d, p) => [p.ogImage.width + ' x ' + p.ogImage.height + ' px, recommended 1200 x 630'],
    why: 'Below 600 x 315 platforms fall back to a small thumbnail instead of a full-width card.' },

  { id: 'og-image-ratio', w: 1, sev: 'missing', group: 'Social', needs: 'probe',
    test: (d, p) => {
      const i = p.ogImage;
      if (!i || !i.ok || !i.width || !i.height) return false;
      if (i.width < 600 || i.height < 315) return false;
      const r = i.width / i.height;
      return (r < 1.6 || r > 2.2) && 'og:image aspect ratio is unusual';
    },
    evidence: (d, p) => [p.ogImage.width + ' x ' + p.ogImage.height + ' is ' + (p.ogImage.width / p.ogImage.height).toFixed(2) + ':1, platforms crop to 1.91:1'],
    why: 'Anything far from 1.91:1 gets cropped, usually from the top and bottom.' },

  { id: 'og-image-broken', w: 10, sev: 'broken', group: 'Social', needs: 'probe',
    test: (d, p) => p.ogImage && !p.ogImage.ok && 'og:image does not load',
    evidence: (d, p) => [p.ogImage.src],
    why: 'The tag points at an image the browser could not fetch, so no card renders.' },

  { id: 'jsonld-none', w: 7, sev: 'missing', group: 'Structured data',
    test: (d) => !d.structured.jsonld.length && !d.structured.microdata.length && 'No structured data',
    why: 'Schema markup is what makes rich results and AI citations possible.' },

  { id: 'jsonld-broken', w: 10, sev: 'broken', group: 'Structured data',
    test: (d) => {
      const n = d.structured.jsonld.filter((j) => !j.ok).length;
      return n && (n + ' JSON-LD block' + (n > 1 ? 's' : '') + ' will not parse');
    },
    evidence: (d) => d.structured.jsonld.filter((j) => !j.ok).map((j) => j.error),
    why: 'Malformed JSON-LD is ignored entirely.' },

  { id: 'img-alt', w: 3, sev: 'missing', group: 'Images',
    test: (d) => d.images.missingAlt && (d.images.missingAlt + ' image' + (d.images.missingAlt > 1 ? 's' : '') + ' without alt'),
    evidence: (d) => d.images.list.filter((i) => i.alt === null).map((i) => i.src),
    targets: (d) => d.images.list.filter((i) => i.alt === null).map((i) => ({ q: 'img', idx: i.idx })),
    why: 'Alt text describes the image to crawlers and screen readers.' },

  { id: 'svg-bare', w: 1, sev: 'missing', group: 'Images',
    test: (d) => d.svg && d.svg.bare && (d.svg.bare + ' inline SVG' + (d.svg.bare > 1 ? 's are' : ' is') + ' unlabelled'),
    targets: (d) => (d.svg.bareIdx || []).map((i) => ({ q: 'svg', idx: i })),
    why: 'An svg needs aria-hidden="true" if decorative, or a title or aria-label if it carries meaning.' },

  { id: 'link-empty', w: 1, sev: 'missing', group: 'Links',
    test: (d) => d.links.emptyAnchor && (d.links.emptyAnchor + ' link' + (d.links.emptyAnchor > 1 ? 's' : '') + ' with no anchor text'),
    evidence: (d) => d.links.list.filter((l) => !l.named).map((l) => l.href),
    targets: (d) => d.links.list.filter((l) => !l.named).map((l) => ({ q: 'a[href]', idx: l.idx })),
    why: 'Anchor text tells crawlers what the destination is about.' },

  { id: 'hreflang-self', w: 1, sev: 'missing', group: 'International', rollup: 'hreflang',
    test: (d) => {
      if (!d.alternates.length) return false;
      const self = d.alternates.some((a) => a.href === d.page.url);
      return !self && 'hreflang does not reference this page';
    },
    why: 'Every hreflang set must include a self-referencing entry.' },

  { id: 'hreflang-xdefault', w: 1, sev: 'missing', group: 'International', rollup: 'hreflang',
    test: (d) => {
      if (!d.alternates.length) return false;
      const x = d.alternates.some((a) => (a.hreflang || '').toLowerCase() === 'x-default');
      return !x && 'No x-default hreflang';
    },
    why: 'x-default names the fallback for languages you do not target.' },

  { id: 'robots-missing', w: 3, sev: 'missing', group: 'Discovery', needs: 'probe', rollup: 'discovery',
    test: (d, p) => p.robots && p.robots.status === 404 && 'No robots.txt',
    why: 'Everything is allowed by default, and no sitemap can be declared.' },

  { id: 'sitemap-missing', w: 3, sev: 'missing', group: 'Discovery', needs: 'probe', rollup: 'discovery',
    test: (d, p) => p.robots && p.robots.ok && !p.robots.sitemaps.length && 'No sitemap declared',
    why: 'robots.txt has no Sitemap line, so crawlers discover pages by following links.' },

  { id: 'llms-missing', w: 0, sev: 'missing', group: 'Discovery', needs: 'probe', rollup: 'discovery',
    test: (d, p) => p.llms && p.llms.txt && !p.llms.txt.exists && 'No llms.txt',
    why: 'An emerging convention for guiding AI assistants. No major operator has committed to reading it yet.' }

];

var ROLLUP_META = {
  social:    { title: 'No social share markup', why: 'Links to this page share as a bare text row with no image or summary.' },
  discovery: { title: 'Nothing guiding crawlers', why: 'No file tells crawlers what exists on this site or where to start.' },
  hreflang:  { title: 'hreflang is incomplete', why: 'The alternate set is missing entries that make it valid.' }
};

function runChecks(d, p) {
  const raw = [];
  CHECKS.forEach((c) => {
    if (c.needs === 'probe' && !p) return;
    let title;
    try { title = c.test(d, p || {}); } catch (e) { console.error('[sona] check failed:', c.id, e); return; }
    let ev = null;
    if (title && c.evidence) {
      try {
        const list = c.evidence(d, p || {}) || [];
        const seen = {};
        list.forEach((x) => { const k = String(x); seen[k] = (seen[k] || 0) + 1; });
        ev = Object.keys(seen).map((k) => (seen[k] > 1 ? k + '  (x' + seen[k] + ')' : k));
      } catch (e) { console.error('[sona] evidence failed:', c.id, e); }
    }
    let tg = null;
    if (title && c.targets) {
      try { tg = c.targets(d, p || {}); } catch (e) { console.error('[sona] targets failed:', c.id, e); }
    }
    if (title) raw.push({ id: c.id, sev: c.sev, group: c.group, rollup: c.rollup, title: title, why: c.why, evidence: ev && ev.length ? ev : null, targets: tg && tg.length ? tg : null });
  });

  // Two or more findings sharing a rollup collapse into one card. A lone
  // finding stays as itself, since a rollup title would overstate one gap.
  const counts = {};
  raw.forEach((f) => { if (f.rollup) counts[f.rollup] = (counts[f.rollup] || 0) + 1; });

  const out = [];
  const done = {};
  raw.forEach((f) => {
    if (!f.rollup || counts[f.rollup] < 2) { out.push(f); return; }
    if (done[f.rollup]) return;
    done[f.rollup] = true;
    const kids = raw.filter((x) => x.rollup === f.rollup);
    const meta = ROLLUP_META[f.rollup];
    out.push({
      id: 'rollup-' + f.rollup,
      sev: kids.some((k) => k.sev === 'broken') ? 'broken' : 'missing',
      group: f.group,
      title: meta.title,
      why: meta.why,
      items: kids.map((k) => k.title)
    });
  });
  return out;
}

// Score. Deliberately not an "SEO score": Google does not use lab scores as a
// ranking signal, and one page fed to four tools produces four different
// numbers. This measures how complete the page's markup is, and its real use
// is as a regression signal for the same page over time.
//
// Weights follow the axe user-impact shape (10/7/3/1) rather than Lighthouse's
// flat per-audit weighting, because a noindex and a long title are not
// equivalent failures.
//
// Rollups cost their heaviest member once, not the sum of what they swallow:
// "no social share markup" is one problem, not three.
var ROLLUP_WEIGHT = { social: 7, discovery: 3, hreflang: 1 };

var FATAL_LABEL = {
  'meta-noindex':   ['Not indexable', 'A meta robots noindex tag keeps this page out of search results entirely.'],
  'header-noindex': ['Not indexable', 'An X-Robots-Tag response header keeps this page out of search results. It does not appear in the page source.'],
  'robots-blocked': ['Not crawlable', 'robots.txt disallows Googlebot on this URL, so the page is never fetched.']
};

function scorePage(found, probed) {
  // A fatal condition replaces the number rather than producing a low one.
  // A correctly noindexed thank-you page is not a bad page, and 0 would
  // invite someone to "fix" something that is working as intended.
  for (var i = 0; i < found.length; i++) {
    var f = found[i];
    if (FATAL_LABEL[f.id]) {
      return { fatal: true, label: FATAL_LABEL[f.id][0], why: FATAL_LABEL[f.id][1] };
    }
  }

  var byId = {};
  CHECKS.forEach(function (c) { byId[c.id] = c; });

  var lost = 0;
  var items = [];

  found.forEach(function (f) {
    var w;
    if (f.id.indexOf('rollup-') === 0) {
      w = ROLLUP_WEIGHT[f.id.slice(7)] || 3;
    } else {
      var c = byId[f.id];
      w = c ? c.w : 0;
    }
    if (typeof w !== 'number' || w <= 0) return;   // unscored on purpose
    lost += w;
    items.push({ title: f.title, cost: w });
  });

  items.sort(function (a, b) { return b.cost - a.cost; });

  return {
    fatal: false,
    score: Math.max(0, 100 - lost),
    lost: lost,
    items: items,
    // Four rules cannot run until the probe lands. Claiming a complete audit
    // before then would be wrong, so the panel says what was skipped.
    skipped: probed ? 0 : 4
  };
}
