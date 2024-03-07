import fetch from 'node-fetch';
import { Buffer } from 'buffer';

const API_KEY = 'TODO';
const BASE_URL = 'https://spacecat.experiencecloud.live/api/v1';
const siteUrl = process.argv[2];
const byOrg = process.argv[3] === 'true';
const organizationId = process.argv[4];
const channelId = process.argv[5];

async function makeApiCall(method, url, data = null) {
    try {
        const response = await fetch(`${BASE_URL}${url}`, {
            method: method,
            headers: {
                'x-api-key': API_KEY,
                'Content-Type': 'application/json',
            },
            ...(data ? { body: JSON.stringify(data) } : {}),
        });
        if (!response.ok && response.status !== 404) throw new Error(`API call failed with HTTP status ${response.status}`);
        if (response.status === 404) return null
        return await response.json(); // Assume DELETE requests might not return a body
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}

async function getSiteByBaseUrl(siteUrl) {
    const base64Url = Buffer.from(siteUrl).toString('base64');
    try {
        return await makeApiCall('GET', `/sites/by-base-url/${base64Url}`);
    } catch (error) {
        console.error('Error fetching site:', error);
        return null; // Site does not exist or an error occurred
    }
}

async function manageOrganizationAndSite(siteUrl, newSiteConfig) {
    const siteData = await getSiteByBaseUrl(siteUrl);
    const organizationId = '3cd4f9e2-3f81-4909-ac9f-104008f3aa3c';
    if (siteData) {
        // Site exists, check and merge organization and site config
        const mergedSiteConfig = { ...siteData.config, ...newSiteConfig };
        const resp = await makeApiCall('PATCH', `/sites/${siteData.id}`, { config: mergedSiteConfig, organizationId });
        console.log(JSON.stringify(resp));
    } else {
        // Assume newSiteConfig does not have an organizationId, add it here
        await makeApiCall('POST', '/sites', { ...newSiteConfig, organizationId, baseURL: siteUrl });
    }
}

// Example usage
async function run() {
    const newSiteByOrgConfig =  {
        alerts: [
            {
                type: '404'
            }
        ]
    }
    const newSiteBySiteConfig =  {
        slack: {
            channel: channelId,
        },
        alerts: [
            {
                type: '404'
            }
        ]
    }
    try {
        if (byOrg) {
            await manageOrganizationAndSite(siteUrl, newSiteByOrgConfig);
        } else {
            await manageOrganizationAndSite(siteUrl, newSiteBySiteConfig);
        }
        console.log('Organization and site managed successfully');
    } catch (error) {
        console.error('Error managing organization or site:', error);
    }
}

run();
