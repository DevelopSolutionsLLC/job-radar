export { greenhouse }     from './greenhouse.mjs';
export { ashby }          from './ashby.mjs';
export { lever }          from './lever.mjs';
export { bamboohr }       from './bamboohr.mjs';
export { teamtailor }     from './teamtailor.mjs';
export { workday }        from './workday.mjs';
export { icims }          from './icims.mjs';
export { smartrecruiters } from './smartrecruiters.mjs';
export { microsoft }      from './microsoft.mjs';
export { rss }            from './rss.mjs';
export { localfeed }      from './localfeed.mjs';

import { greenhouse }     from './greenhouse.mjs';
import { ashby }          from './ashby.mjs';
import { lever }          from './lever.mjs';
import { bamboohr }       from './bamboohr.mjs';
import { teamtailor }     from './teamtailor.mjs';
import { workday }        from './workday.mjs';
import { icims }          from './icims.mjs';
import { smartrecruiters } from './smartrecruiters.mjs';
import { microsoft }      from './microsoft.mjs';
import { rss }            from './rss.mjs';
import { localfeed }      from './localfeed.mjs';

/** Registry map — keyed by portals.yml type strings. */
export const adapters = {
  greenhouse,
  ashby,
  lever,
  bamboohr,
  teamtailor,
  workday,
  icims,
  smartrecruiters,
  microsoft,
  rss,
  localfeed,
};
