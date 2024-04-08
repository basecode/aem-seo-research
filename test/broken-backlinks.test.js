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

/* eslint-env mocha */

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import nock from 'nock';
import SpaceCatSdk from 'spacecat-sdk/src/sdk.js';
import fs from 'fs';
import path from 'path';
import { createAssessment } from '../assessment/assessment-lib.js';
import { brokenBacklinksAudit } from '../assessment/broken-backlinks.js';
import AhrefsAPIClient from '../assessment/libs/ahrefs-client.js';
import HttpClient from '../assessment/libs/fetch-client.js';
import { OUTPUT_DIR, ROOT_DIR } from '../assessment/file-lib.js';

chai.use(sinonChai);
chai.use(chaiAsPromised);
const { expect } = chai;

describe('brokenBacklinksAudit', () => {
  const options = { topPages: 1, topBacklinks: 1 };
  const site = {
    baseURL: 'https://space.dog',
    gitHubURL: 'https://github.com/hlxsites/spacedog',
  };
  const sandbox = sinon.createSandbox();
  const spaceCatSdkGetSiteStub = sandbox.stub(SpaceCatSdk.prototype, 'getSite');
  const getBacklinksStub = sandbox.stub(AhrefsAPIClient.prototype, 'getBacklinks');
  const getTopPagesStub = sandbox.stub(AhrefsAPIClient.prototype, 'getTopPages');

  beforeEach(() => {
    spaceCatSdkGetSiteStub.resolves(site);
    nock('https://main--spacedog--hlxsites.hlx.live')
      .get('/')
      .reply(200);
    const cacheDir = path.join(ROOT_DIR, '.http_cache');
    if (fs.existsSync(cacheDir)) {
      fs.rmdirSync(cacheDir, { recursive: true });
    }
  });

  afterEach(() => {
    nock.cleanAll();
    sinon.restore();
  });

  it('should handle no backlinks found', async () => {
    const assessment = await createAssessment('https://space.dog', 'Broken Backlinks');

    getBacklinksStub.resolves({ result: { backlinks: [] } });

    await brokenBacklinksAudit(assessment, site.baseURL, options);
    expect(assessment.getRows()).to.be.empty;
  });

  it('should handle no top pages found', async () => {
    const assessment = await createAssessment('https://space.dog', 'Broken Backlinks');

    getBacklinksStub.resolves({ result: { backlinks: [{ url_to: 'https://www.space.dog/how-to-chase-a-cat' }] } });
    getTopPagesStub.resolves({ result: { pages: [] } });

    nock('https://main--spacedog--hlxsites.hlx.live')
      .get('/how-to-chase-a-cat')
      .reply(200);

    options.onlyBacklinksInTopPages = true;

    await brokenBacklinksAudit(assessment, site.baseURL, options);
    expect(assessment.getRows()).to.be.empty;
  });

  it('should handle valid backlinks', async () => {
    const assessment = await createAssessment('https://space.dog', 'Broken Backlinks');

    getBacklinksStub.resolves({ result: { backlinks: [{ url_to: 'https://www.space.dog/how-to-chase-a-cat' }] } });
    getTopPagesStub.resolves({ result: { pages: [{ url: 'https://www.space.dog/how-to-chase-a-cat' }] } });

    nock('https://main--spacedog--hlxsites.hlx.live')
      .get('/how-to-chase-a-cat')
      .reply(200);

    await brokenBacklinksAudit(assessment, site.baseURL, options);
    expect(assessment.getRows()).to.be.empty;
  });

  it('should handle broken backlinks', async () => {
    const assessment = await createAssessment('https://space.dog', 'Broken Backlinks');

    const backlink = {
      url_to: 'https://www.space.dog/how-to-float-around-your-tail',
      url_from: 'https://www.tutorials.dog/space-dogs-101',
      title: 'What every space dog should know',
    };
    getBacklinksStub.resolves({
      result: {
        backlinks: [backlink],
      },
    });
    getTopPagesStub.resolves({ result: { pages: [{ url: 'https://www.space.dog/how-to-float-around-your-tail' }] } });

    nock('https://main--spacedog--hlxsites.hlx.live')
      .get('/how-to-float-around-your-tail')
      .reply(404);

    await brokenBacklinksAudit(assessment, site.baseURL, options);
    expect(assessment.getRows()).to.have.lengthOf(1);
    expect(assessment.getRows()[0]).to.deep.equal({
      original_url: backlink.url_to,
      url: 'https://main--spacedog--hlxsites.hlx.live/how-to-float-around-your-tail',
      source: 'ahrefs',
      title: backlink.title,
      url_from: backlink.url_from,
    });
  });
});
