/**
 * Workday JSON POST API — no auth required.
 * Paginates in batches of 20 (configurable) up to maxResults.
 * @param {Object} e             - Entry config from portals.yml
 * @param {string} e.slug        - Workday tenant slug (e.g. "acme")
 * @param {string} e.name        - Display name for the company
 * @param {string} [e.shard]     - Workday shard host prefix; defaults to "wd5"
 * @param {string} [e.site]      - Career site name; defaults to "External"
 * @param {string} [e.searchText] - Optional keyword filter sent in the POST body
 * @returns {{ title, url, company, location }[]}
 */
export const workday = {
  url: (e) => `https://${e.slug}.${e.shard || 'wd5'}.myworkdayjobs.com/wday/cxs/${e.slug}/${e.site || 'External'}/jobs`,
  method: 'POST',
  paginate: true,
  pageSize: 20,
  maxResults: 100,
  headers: { 'Content-Type': 'application/json' },
  body: (offset, pageSize, entry) =>
    JSON.stringify({ appliedFacets: {}, limit: pageSize, offset, searchText: entry.searchText || '' }),
  parse: (json, e) => (json.jobPostings || []).map(j => ({
    title: j.title,
    url: `https://${e.slug}.${e.shard || 'wd5'}.myworkdayjobs.com${j.externalPath}`,
    company: e.name,
    location: j.locationsText || null,
  })),
  total: (json) => json.total ?? 0,
};
