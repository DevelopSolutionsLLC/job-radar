/**
 * Generic RSS adapter — URL from portals.yml; XML parsed by the shared parseRssItems() in scan.mjs.
 * @param {Object} e     - Entry config from portals.yml
 * @param {string} e.url - Full RSS feed URL
 * @param {string} e.name - Display name for the feed
 */
export const rss = {
  fetch: 'rss',
};
