// Every check the panel runs. One entry per rule.
// test(d, p) -> falsy for pass, or a string to show as the finding title.
//   d = collect.js result, p = probe.js result (may be null while probing)
// sev: 'broken' (page cannot rank or is malformed) | 'missing' (opportunity)
// needs: 'probe' if the rule cannot run until the probe lands.

var CHECKS = [

  { id: 'meta-noindex', sev: 'broken', group: 'Indexability',
    test: (d) => /noindex/i.test(d.meta.robots || '') && 'Page is set to noindex',
    why: 'A meta robots noindex tag keeps this page out of search results.' },

  { id: 'header-noindex', sev: 'broken', group: 'Indexability', needs: 'probe',
    test: (d, p) => p.raw && p.raw.ok && /noindex/i.test(p.raw.xRobotsTag || '') && 'X-Robots-Tag: noindex',
    why: 'Sent as a response header, so it does not appear in the page source.' },

  { id: 'robots-blocked', sev: 'broken', group: 'Indexability', needs: 'probe',
    test: (d, p) => {
      if (!p.robots || !p.robots.ok) return false;
      const g = p.robots.agents.find((a) => a.token === 'Googlebot');
      return g && !g.allowed && 'Googlebot is blocked from this URL';
    },
    why: 'robots.txt disallows this path, so the page will not be crawled.' },

  { id: 'canonical-missing', sev: 'missing', group: 'Indexability',
    test: (d) => !d.meta.canonical && 'No canonical link',
    why: 'Without one, duplicate URLs of this page compete with each other.' },

  { id: 'canonical-other', sev: 'missing', group: 'Indexability',
    test: (d) => d.meta.canonical && !d.meta.canonicalIsSelf && 'Canonical points elsewhere',
    evidence: (d) => [d.meta.canonical],
    why: 'This page is telling search engines to index a different URL.' },

  { id: 'title-missing', sev: 'broken', group: 'Meta',
    test: (d) => !d.meta.titleLength && 'No title',
    why: 'The title is the strongest on-page signal and the search result headline.' },

  { id: 'title-length', sev: 'missing', group: 'Meta',
    test: (d) => d.meta.titleLength && (d.meta.titleLength < 30 || d.meta.titleLength > 60)
      && (d.meta.titleLength < 30 ? 'Title is short' : 'Title is long'),
    why: 'Around 30 to 60 characters displays without truncation.' },

  { id: 'desc-missing', sev: 'missing', group: 'Meta',
    test: (d) => !d.meta.descriptionLength && 'No meta description',
    why: 'Search engines will pull an arbitrary snippet from the page instead.' },

  { id: 'desc-length', sev: 'missing', group: 'Meta',
    test: (d) => d.meta.descriptionLength && (d.meta.descriptionLength < 70 || d.meta.descriptionLength > 160)
      && (d.meta.descriptionLength < 70 ? 'Description is short' : 'Description is long'),
    why: 'Around 70 to 160 characters displays without truncation.' },

  { id: 'lang-missing', sev: 'missing', group: 'Meta',
    test: (d) => !d.page.lang && 'No lang attribute',
    why: 'The html lang attribute tells crawlers and screen readers which language this is.' },

  { id: 'viewport-missing', sev: 'missing', group: 'Meta',
    test: (d) => !d.page.viewport && 'No viewport tag',
    why: 'Without it the page will not render correctly on mobile.' },

  { id: 'charset', sev: 'missing', group: 'Meta',
    test: (d) => d.page.charset && d.page.charset.toUpperCase() !== 'UTF-8' && ('Charset is ' + d.page.charset),
    why: 'UTF-8 avoids character corruption in non-Latin text.' },

  { id: 'h1-missing', sev: 'broken', group: 'Structure',
    test: (d) => !d.headings.counts.h1 && 'No H1',
    why: 'The H1 states what the page is about.' },

  { id: 'h1-many', sev: 'missing', group: 'Structure',
    test: (d) => d.headings.counts.h1 > 1 && (d.headings.counts.h1 + ' H1 headings'),
    why: 'Multiple H1s split the signal about the page topic.' },

  { id: 'h-skip', sev: 'missing', group: 'Structure',
    test: (d) => {
      let prev = 0, skip = null;
      d.headings.list.forEach((h) => {
        if (prev && h.level > prev + 1 && !skip) skip = 'H' + prev + ' to H' + h.level;
        prev = h.level;
      });
      return skip && ('Heading level skipped, ' + skip);
    },
    why: 'Heading levels should step down one at a time.' },

  { id: 'h-empty', sev: 'missing', group: 'Structure',
    test: (d) => {
      const n = d.headings.list.filter((h) => !h.text).length;
      return n && (n + ' empty heading' + (n > 1 ? 's' : ''));
    },
    evidence: (d) => d.headings.list.map((h, i) => (!h.text ? ('H' + h.level + ' at position ' + (i + 1)) : null)).filter(Boolean),
    why: 'A heading with no text carries no meaning.' },

  { id: 'og-title', sev: 'missing', group: 'Social', rollup: 'social',
    test: (d) => !d.social.og.title && 'No og:title',
    why: 'Shared links fall back to the page title, which is often not what you want.' },

  { id: 'og-desc', sev: 'missing', group: 'Social', rollup: 'social',
    test: (d) => !d.social.og.description && 'No og:description',
    why: 'Social platforms will show no summary under the link.' },

  { id: 'og-image', sev: 'missing', group: 'Social', rollup: 'social',
    test: (d) => !d.social.og.image && 'No og:image',
    why: 'Shared links render as a bare text row with no image.' },

  { id: 'tw-card', sev: 'missing', group: 'Social', rollup: 'social',
    test: (d) => !d.social.twitter.card && d.social.og.image && 'No twitter:card',
    why: 'You have an og:image but no card type, so X picks the layout itself.' },

  { id: 'og-image-small', sev: 'missing', group: 'Social', needs: 'probe',
    test: (d, p) => {
      const i = p.ogImage;
      if (!i || !i.ok || !i.width) return false;
      if (i.width < 300 || i.height < 157) return 'og:image is too small for a large card';
      if (i.width < 600 || i.height < 315) return 'og:image will render as a thumbnail';
      return false;
    },
    evidence: (d, p) => [p.ogImage.width + ' x ' + p.ogImage.height + ' px, recommended 1200 x 630'],
    why: 'Below 600 x 315 platforms fall back to a small thumbnail instead of a full-width card.' },

  { id: 'og-image-ratio', sev: 'missing', group: 'Social', needs: 'probe',
    test: (d, p) => {
      const i = p.ogImage;
      if (!i || !i.ok || !i.width || !i.height) return false;
      if (i.width < 600 || i.height < 315) return false;
      const r = i.width / i.height;
      return (r < 1.6 || r > 2.2) && 'og:image aspect ratio is unusual';
    },
    evidence: (d, p) => [p.ogImage.width + ' x ' + p.ogImage.height + ' is ' + (p.ogImage.width / p.ogImage.height).toFixed(2) + ':1, platforms crop to 1.91:1'],
    why: 'Anything far from 1.91:1 gets cropped, usually from the top and bottom.' },

  { id: 'og-image-broken', sev: 'broken', group: 'Social', needs: 'probe',
    test: (d, p) => p.ogImage && !p.ogImage.ok && 'og:image does not load',
    evidence: (d, p) => [p.ogImage.src],
    why: 'The tag points at an image the browser could not fetch, so no card renders.' },

  { id: 'jsonld-none', sev: 'missing', group: 'Structured data',
    test: (d) => !d.structured.jsonld.length && !d.structured.microdata.length && 'No structured data',
    why: 'Schema markup is what makes rich results and AI citations possible.' },

  { id: 'jsonld-broken', sev: 'broken', group: 'Structured data',
    test: (d) => {
      const n = d.structured.jsonld.filter((j) => !j.ok).length;
      return n && (n + ' JSON-LD block' + (n > 1 ? 's' : '') + ' will not parse');
    },
    evidence: (d) => d.structured.jsonld.filter((j) => !j.ok).map((j) => j.error),
    why: 'Malformed JSON-LD is ignored entirely.' },

  { id: 'img-alt', sev: 'missing', group: 'Images',
    test: (d) => d.images.missingAlt && (d.images.missingAlt + ' image' + (d.images.missingAlt > 1 ? 's' : '') + ' without alt'),
    evidence: (d) => d.images.list.filter((i) => i.alt === null).map((i) => i.src),
    why: 'Alt text describes the image to crawlers and screen readers.' },

  { id: 'svg-bare', sev: 'missing', group: 'Images',
    test: (d) => d.svg && d.svg.bare && (d.svg.bare + ' inline SVG' + (d.svg.bare > 1 ? 's are' : ' is') + ' unlabelled'),
    why: 'An svg needs aria-hidden="true" if decorative, or a title or aria-label if it carries meaning.' },

  { id: 'link-empty', sev: 'missing', group: 'Links',
    test: (d) => d.links.emptyAnchor && (d.links.emptyAnchor + ' link' + (d.links.emptyAnchor > 1 ? 's' : '') + ' with no anchor text'),
    evidence: (d) => d.links.list.filter((l) => !l.named).map((l) => l.href),
    why: 'Anchor text tells crawlers what the destination is about.' },

  { id: 'hreflang-self', sev: 'missing', group: 'International', rollup: 'hreflang',
    test: (d) => {
      if (!d.alternates.length) return false;
      const self = d.alternates.some((a) => a.href === d.page.url);
      return !self && 'hreflang does not reference this page';
    },
    why: 'Every hreflang set must include a self-referencing entry.' },

  { id: 'hreflang-xdefault', sev: 'missing', group: 'International', rollup: 'hreflang',
    test: (d) => {
      if (!d.alternates.length) return false;
      const x = d.alternates.some((a) => (a.hreflang || '').toLowerCase() === 'x-default');
      return !x && 'No x-default hreflang';
    },
    why: 'x-default names the fallback for languages you do not target.' },

  { id: 'robots-missing', sev: 'missing', group: 'Discovery', needs: 'probe', rollup: 'discovery',
    test: (d, p) => p.robots && p.robots.status === 404 && 'No robots.txt',
    why: 'Everything is allowed by default, and no sitemap can be declared.' },

  { id: 'sitemap-missing', sev: 'missing', group: 'Discovery', needs: 'probe', rollup: 'discovery',
    test: (d, p) => p.robots && p.robots.ok && !p.robots.sitemaps.length && 'No sitemap declared',
    why: 'robots.txt has no Sitemap line, so crawlers discover pages by following links.' },

  { id: 'llms-missing', sev: 'missing', group: 'Discovery', needs: 'probe', rollup: 'discovery',
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
    if (title) raw.push({ id: c.id, sev: c.sev, group: c.group, rollup: c.rollup, title: title, why: c.why, evidence: ev && ev.length ? ev : null });
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
