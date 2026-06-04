/**
 * SmartRecruiters public postings API — no auth required.
 * @param {Object} e - Entry config from portals.yml
 * @param {string} e.slug - SmartRecruiters company identifier (e.g. "Acme")
 * @param {string} e.name - Display name for the company
 * @returns {{ title, url, company, location }[]}
 */
export const smartrecruiters = {
  url: (e) => `https://api.smartrecruiters.com/v1/companies/${e.slug}/postings?limit=100`,
  parse: (json, e) => (json.content ?? []).map(p => ({
    title: p.name,
    url: `https://jobs.smartrecruiters.com/${e.slug}/${p.id}`,
    company: e.name,
    location: p.location?.city
      ? `${p.location.city}${p.location.country ? ', ' + p.location.country : ''}`
      : (p.location?.remote ? 'Remote' : null),
  })),
};
