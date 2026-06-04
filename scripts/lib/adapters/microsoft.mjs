/**
 * Microsoft careers search API — no auth required.
 * @param {Object} e       - Entry config from portals.yml
 * @param {string} e.name  - Display name for the company
 * @param {string} [e._query] - Keyword query string; defaults to empty (all jobs)
 * @returns {{ title, url, company, location }[]}
 */
export const microsoft = {
  url: (e) =>
    `https://apply.careers.microsoft.com/api/pcsx/search?domain=microsoft.com&query=${encodeURIComponent(e._query || '')}&location=&start=0`,
  parse: (json, e) => (Array.isArray(json) ? json : []).map(j => ({
    title: j.name,
    url: `https://apply.careers.microsoft.com/careers/job/${j.id}`,
    company: e.name,
    location:
      j.workLocationOption === 'remote' ? 'Remote'
      : j.workLocationOption === 'hybrid' ? (j.locations?.[0] ? `${j.locations[0]} (Hybrid)` : 'Hybrid')
      : (j.locations?.[0] || null),
  })),
};
