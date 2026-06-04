/**
 * Ashby public job board REST API — no auth required.
 * @param {Object} e - Entry config from portals.yml
 * @param {string} e.board - Ashby board slug (e.g. "acme")
 * @param {string} e.name  - Display name for the company
 * @returns {{ title, url, company, location }[]}
 */
export const ashby = {
  url: (e) => `https://api.ashbyhq.com/posting-api/job-board/${e.board}`,
  parse: (json, e) => (json.jobs || []).map(j => ({
    title: j.title,
    url: `https://jobs.ashbyhq.com/${e.board}/${j.id}`,
    company: e.name,
    location: j.location || j.locationName || null,
  })),
};
