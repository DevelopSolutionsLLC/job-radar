/**
 * Greenhouse public job board REST API — no auth required.
 * @param {Object} e - Entry config from portals.yml
 * @param {string} e.board - Greenhouse board token (e.g. "acme")
 * @param {string} e.name  - Display name for the company
 * @returns {{ title, url, company, location }[]}
 */
export const greenhouse = {
  url: (e) => `https://boards-api.greenhouse.io/v1/boards/${e.board}/jobs`,
  parse: (json, e) => (json.jobs || []).map(j => ({
    title: j.title,
    url: j.absolute_url,
    company: e.name,
    location: j.location?.name || null,
  })),
};
