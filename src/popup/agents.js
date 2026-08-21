// Display metadata for the popup. Tokens MUST match lib/probe.js.
// popup.js asserts the two sets are identical and logs loudly if they drift.
var AGENT_META = {
  'Googlebot':          { label: 'Googlebot',          operator: 'Google' },
  'Bingbot':            { label: 'Bingbot',            operator: 'Microsoft' },
  'GPTBot':             { label: 'GPTBot',             operator: 'OpenAI' },
  'OAI-SearchBot':      { label: 'OAI-SearchBot',      operator: 'OpenAI' },
  'ChatGPT-User':       { label: 'ChatGPT-User',       operator: 'OpenAI' },
  'ClaudeBot':          { label: 'ClaudeBot',          operator: 'Anthropic' },
  'Claude-SearchBot':   { label: 'Claude-SearchBot',   operator: 'Anthropic' },
  'Claude-User':        { label: 'Claude-User',        operator: 'Anthropic' },
  'PerplexityBot':      { label: 'PerplexityBot',      operator: 'Perplexity' },
  'Perplexity-User':    { label: 'Perplexity-User',    operator: 'Perplexity' },
  'Google-Extended':    { label: 'Google-Extended',    operator: 'Google' },
  'Applebot-Extended':  { label: 'Applebot-Extended',  operator: 'Apple' },
  'Applebot':           { label: 'Applebot',           operator: 'Apple' },
  'DuckAssistBot':      { label: 'DuckAssistBot',      operator: 'DuckDuckGo' },
  'CCBot':              { label: 'CCBot',              operator: 'Common Crawl' },
  'Bytespider':         { label: 'Bytespider',         operator: 'ByteDance' },
  'Meta-ExternalAgent': { label: 'Meta-ExternalAgent', operator: 'Meta' },
  'Amazonbot':          { label: 'Amazonbot',          operator: 'Amazon' }
};

var JOB_META = {
  retrieval: {
    title: 'Retrieval',
    sub: 'Can cite you',
    icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    blocked: 'Blocked here means you cannot appear in those AI answers.'
  },
  user: {
    title: 'User-triggered',
    sub: 'Fetch on demand',
    icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    blocked: 'Blocked here means assistants cannot read your page when asked about it.'
  },
  search: {
    title: 'Search engines',
    sub: 'Classic indexing',
    icon: 'M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0 M21 21l-4.3-4.3',
    blocked: 'Blocked here removes you from ordinary search results.'
  },
  training: {
    icon: 'M21 5c0 1.7-4 3-9 3S3 6.7 3 5s4-3 9-3 9 1.3 9 3z M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5 M3 12c0 1.7 4 3 9 3s9-1.3 9-3',
    title: 'Training',
    sub: 'No citation value',
    blocked: 'Blocking these costs no citations.'
  }
};

var JOB_ORDER = ['retrieval', 'user', 'search', 'training'];
