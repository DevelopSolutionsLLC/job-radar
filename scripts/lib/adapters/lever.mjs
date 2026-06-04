/**
 * Lever public job board REST API — no auth required.
 * @param {Object} e - Entry config from portals.yml
 * @param {string} e.board - Lever company slug (e.g. "acme")
 * @param {string} e.name  - Display name for the company
 * @returns {{ title, url, company, location }[]}
 */
export const lever = {
  url: (e) => `https://api.lever.co/v0/postings/${e.board}?mode=json`,
  parse: (json, e) => (Array.isArray(json) ? json : []).map(j => ({
    title: j.text,
    url: j.hostedUrl,
    company: e.name,
    location: j.categories?.location || j.workplaceType || null,
  })),
};
