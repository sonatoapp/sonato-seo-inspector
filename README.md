# SEO Inspector by sona.to

A browser extension that checks the page you are on for SEO problems, AI
crawler access, share previews and structured data.

No account. No tracking. Nothing leaves the browser.

## What it checks

**Findings** run 33 rules over the page and report only what is wrong or
missing, split into two levels: broken (the page cannot rank or the markup
is malformed) and missing (an opportunity). Related gaps collapse into one
card, and rules that can name the offending element show it.

**AI crawler access** parses robots.txt and reports 18 crawler tokens
grouped by what they do. Retrieval bots build the indexes AI answers cite
from, so blocking one removes you from those answers. Training bots send no
visitors and produce no citations, so blocking them costs nothing. Most
tools report a flat allow/deny list, which hides that difference.

**Crawler view** refetches the page's own HTML and compares it against the
rendered DOM, so you can see how much of the page needs JavaScript to
appear. It also surfaces the X-Robots-Tag response header, which is
invisible in the page source.

**Changed since** snapshots the page locally on each visit and shows what
moved since last time: title, description, H1, canonical, word count,
structured data, og:image.

**Share preview** renders the card as X, Facebook and LinkedIn build it,
and checks the og:image actually loads at a size those platforms will use.

Plus structured data with the JSON-LD viewer, content, links, images with
inline SVG counted separately, hreflang, and the heading tree. The whole
report copies out as markdown.

## Permissions

    activeTab   read the current page, only when you click the icon
    scripting   run the collector in that page
    storage     keep snapshots locally for the change history

No host permissions. No content scripts. The extension reads a page only
when you open the panel on it.

## Build

    ./build.sh

Emits `dist/sonato-seo-inspector-chrome.zip` (Chrome and Edge) and
`dist/sonato-seo-inspector-firefox.zip`. The Firefox manifest is the same
file with `firefox.overlay.json` merged in, so permissions cannot drift
between the two.

Plain MV3. No build step, no dependencies, no minification: the shipped
source is the source.

## Layout

    src/manifest.json      Chrome and Edge
    firefox.overlay.json   merged in at build time for Firefox
    src/lib/collect.js     reads the DOM, synchronous, no network
    src/lib/probe.js       robots.txt, llms.txt, raw HTML, og:image size
    src/popup/checks.js    the rule table
    src/popup/agents.js    crawler display metadata
    src/popup/history.js   local snapshots
    src/popup/popup.js     render

Adding a check is one entry in `CHECKS`. Adding a crawler means adding the
token to both `probe.js` and `agents.js`; the popup asserts the two sets
match and logs loudly if they drift.
