import { makeApiCall } from './lib.js'; 
import dotenv from 'dotenv';

dotenv.config();

const SITES = [];
const ORG_ID = '';

(async function() {
  await Promise.all(SITES.map(async (siteId) => await makeApiCall('patch', `/sites/${siteId}`, { organizationId: ORG_ID })));
})();
