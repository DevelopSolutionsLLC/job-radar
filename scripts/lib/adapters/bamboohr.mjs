/**
 * BambooHR public careers list endpoint — no auth required.
 * @param {Object} e - Entry config from portals.yml
 * @param {string} e.slug - BambooHR subdomain (e.g. "acme")
 * @param {string} e.name - Display name for the company
 * @returns {{ title, url, company, location }[]}
 */
export const bamboohr = {
  url: (e) => `https://${e.slug}.bamboohr.com/careers/list`,
  parse: (json, e) => (json.result || []).map(j => ({
    title: j.jobOpeningName,
    url: j.jobOpeningShareUrl || `https://${e.slug}.bamboohr.com/careers/${j.id}/detail`,
    company: e.name,
    location: j.location?.city
      ? `${j.location.city}, ${j.location.state || ''}`.trim().replace(/,$/, '')
      : null,
  })),
};
