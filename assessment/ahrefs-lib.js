/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

// get top 50 pages based on estimated traffic

const AHREFS_API_BASE_URL = 'https://api.ahrefs.com/v3';

const sendRequest = async (endpoint, queryParams = {}) => {
  const queryParamsKeys = Object.keys(queryParams);
  const queryString = queryParamsKeys.length > 0
    ? `?${queryParamsKeys
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(queryParams[key])}`)
      .join('&')}` : '';

  const fullAuditRef = `${AHREFS_API_BASE_URL}${endpoint}${queryString}`;
  const response = await fetch(fullAuditRef, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.AHREFS_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Ahrefs API request failed with status: ${response.status}`);
  }

  try {
    const result = await response.json();
    return {
      result,
      fullAuditRef,
    };
  } catch (e) {
    throw new Error(`Error parsing Ahrefs API response: ${e.message}`);
  }
};

export const getTopPages = async (target) => {
  const queryParams = {
    select: [
      'url',
      'sum_traffic',
    ].join(','),
    limit: 50,
    order_by: 'sum_traffic_merged',
    target,
    date: new Date().toISOString().split('T')[0],
    date_compared: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    output: 'json',
  };
  return sendRequest('/site-explorer/top-pages', queryParams);
};
