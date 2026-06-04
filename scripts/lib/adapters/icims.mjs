/**
 * iCIMS adapter — two patterns:
 *   careers_host  Phenom/iCIMS careers.X.com API, paginated GET
 *   slug-only     legacy {slug}.icims.com job search, single request
 * @param {Object} e               - Entry config from portals.yml
 * @param {string} e.name          - Display name for the company
 * @param {string} [e.careers_host] - Phenom host (e.g. "careers.acme.com"); triggers paginated GET
 * @param {string} [e.slug]        - iCIMS tenant slug; used for legacy URL and Phenom job links
 * @param {string} [e.categories]  - Optional Phenom category filter appended to the API query
 * @returns {{ title, url, company, location }[]}
 */
export const icims = {
  url: (e, page = 1) => {
    if (e.careers_host) {
      const params = new URLSearchParams({
        page,
        sortBy: 'relevance',
        descending: 'false',
        internal: 'false',
      });
      if (e.categories) params.set('categories', e.categories);
      return `https://${e.careers_host}/api/jobs?${params}`;
    }
    return `https://${e.slug}.icims.com/jobs/search?pr=0&hd=0&format=json&maxCount=200`;
  },
  paginate_get: (e) => !!e.careers_host,
  parse: (json, e) => {
    // Phenom pattern: { jobs: [{ data: { title, city, state, req_id, employment_type } }] }
    if (Array.isArray(json.jobs) && json.jobs[0]?.data) {
      return json.jobs
        .filter(j => j.data?.employment_type !== 'PART_TIME')
        .map(j => {
          const d = j.data;
          const loc = [d.city, d.state].filter(Boolean).join(', ') || null;
          const jobUrl = e.slug
            ? `https://jobs-${e.slug}.icims.com/jobs/${d.req_id}/job`
            : `https://${e.careers_host}/job/${d.req_id}/job`;
          return { title: d.title || '', url: jobUrl, company: e.name, location: loc };
        });
    }
    // Standard iCIMS pattern: { searchResults: [...] } or { jobs: [...] }
    const jobs = json.searchResults || json.jobs || [];
    return jobs.map(j => ({
      title: j.title || j.postingTitle || '',
      url: j.canonicalURL || `https://${e.slug}.icims.com/jobs/${j.id}/job`,
      company: e.name,
      location: j.location?.text || null,
    }));
  },
};
