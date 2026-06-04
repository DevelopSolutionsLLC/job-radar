/**
 * Teamtailor native RSS feed — parsed by the shared RSS handler in scan.mjs.
 * @param {Object} e - Entry config from portals.yml
 * @param {string} e.slug - Teamtailor subdomain (e.g. "acme")
 * @param {string} e.name - Display name for the company
 */
export const teamtailor = {
  url: (e) => `https://${e.slug}.teamtailor.com/jobs.rss`,
  fetch: 'rss',
};
