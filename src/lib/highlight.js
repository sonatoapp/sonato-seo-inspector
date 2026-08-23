// Injected on hover from the popup, with the target passed via a global the
// popup sets first. Draws an overlay box rather than styling the element, so
// nothing on the page is mutated and there is nothing to restore.
(() => {
  try {
    const ID = '__sona_hl';
    const t = window.__sonaTarget;

    const clear = () => {
      const old = document.getElementById(ID);
      if (old && old.parentNode) old.parentNode.removeChild(old);
    };

    if (!t || !t.q) { clear(); return { ok: true, cleared: true }; }

    // The overlay lives outside the queried sets, but exclude it anyway so a
    // future query change cannot make the highlighter target itself.
    const nodes = Array.prototype.filter.call(
      document.querySelectorAll(t.q),
      (n) => n.id !== ID
    );
    const el = nodes[t.idx];
    if (!el) { clear(); return { ok: false, reason: 'element not found' }; }

    clear();

    // A link with no text often has no box of its own. Walking UP finds a
    // box but usually the wrong one: a full-width wrapper marks the whole
    // page edge and locates nothing. Walk DOWN first, since a text-less link
    // nearly always wraps an img or svg that does render.
    let r = el.getBoundingClientRect();
    let approx = false;

    if (!r.width || !r.height) {
      const kids = el.querySelectorAll('img,svg,picture,video,canvas,span,i');
      for (let i = 0; i < kids.length; i++) {
        const kr = kids[i].getBoundingClientRect();
        if (kr.width && kr.height) { r = kr; approx = true; break; }
      }
    }

    // Only then walk up, and stop before marking something so large it
    // points at nothing useful.
    if (!r.width || !r.height) {
      let hop = el;
      while ((!r.width || !r.height) && hop.parentElement && hop !== document.body) {
        hop = hop.parentElement;
        const pr = hop.getBoundingClientRect();
        if (pr.width > window.innerWidth * 0.9 && pr.height > window.innerHeight * 0.5) break;
        r = pr;
        approx = true;
      }
    }

    if (!r.width && !r.height) return { ok: false, reason: 'not rendered' };

    const box = document.createElement('div');
    box.id = ID;
    box.style.cssText = [
      'position:absolute',
      'z-index:2147483647',
      'pointer-events:none',
      approx ? 'border:2px dashed #7c6af7' : 'border:2px solid #7c6af7',
      'border-radius:3px',
      'box-shadow:0 0 0 9999px rgba(13,14,28,0.45)',
      'transition:top 120ms,left 120ms,width 120ms,height 120ms',
      'top:' + (r.top + window.scrollY - 2) + 'px',
      'left:' + (r.left + window.scrollX - 2) + 'px',
      'width:' + r.width + 'px',
      'height:' + r.height + 'px'
    ].join(';');
    document.body.appendChild(box);

    // Centre rather than top: the popup covers the upper right, and a
    // top-aligned scroll can put the element under a sticky header.
    const view = window.innerHeight;
    if (r.top < 80 || r.bottom > view - 40) {
      window.scrollTo({
        top: r.top + window.scrollY - (view / 2) + (r.height / 2),
        behavior: 'smooth'
      });
    }
    return { ok: true, approx: approx };
  } catch (e) {
    return { fatal: String((e && e.message) || e) };
  }
})();
