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

import chai, { expect } from 'chai';
import sinon from 'sinon';
import nock from 'nock';
import sinonChai from 'sinon-chai';
import chaiAsPromised from 'chai-as-promised';
import PageProvider from '../assessment/libs/page-provider.js';

chai.use(sinonChai);
chai.use(chaiAsPromised);

describe('PageProvider', () => {
  let sandbox;
  let ahrefsClientStub;
  let site;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    ahrefsClientStub = {
      getTopPages: sandbox.stub(),
    };
    site = {
      getBaseURL: sandbox.stub(),
      getGitHubURL: sandbox.stub(),
    };
    site.getBaseURL.returns('https://space.dog');
    nock('https://space.dog')
      .get('/')
      .reply(301, undefined, { Location: 'https://www.space.dog/' });
    nock('https://www.space.dog')
      .get('/')
      .reply(200, 'Success');
  });

  afterEach(() => {
    sandbox.restore();
    nock.cleanAll();
  });

  describe('getPagesOfInterest', () => {
    it('should return empty array if no ahrefs client is provided', async () => {
      const pageProvider = new PageProvider({});
      const result = await pageProvider.getPagesOfInterest(site);
      expect(result).to.be.an('array').that.is.empty;
    });

    it('should return pages of interest from ahrefs with prod and dev url from gitHubURL if set', async () => {
      ahrefsClientStub.getTopPages.resolves({ result: { pages: [{ url: 'https://www.space.dog/how-to-chase-a-cat' }] } });
      site.getGitHubURL.returns('https://github.com/hlxsites/spacedog');

      const pageProvider = new PageProvider({ ahrefsClient: ahrefsClientStub });
      const result = await pageProvider.getPagesOfInterest(site);

      expect(result).to.be.an('array').that.is.not.empty;
      expect(result[0]).to.have.property('prodUrl', 'https://www.space.dog/how-to-chase-a-cat');
      expect(result[0]).to.have.property('devUrl', 'https://main--spacedog--hlxsites.hlx.live/how-to-chase-a-cat');
    });

    it('should return pages of interest from ahrefs with prod and dev url the same if gitHubURL is not set', async () => {
      ahrefsClientStub.getTopPages.resolves({ result: { pages: [{ url: 'https://www.space.dog/how-to-chase-a-cat' }] } });
      site.getGitHubURL.returns(undefined);

      const pageProvider = new PageProvider({ ahrefsClient: ahrefsClientStub });
      const result = await pageProvider.getPagesOfInterest(site);

      expect(result).to.be.an('array').that.is.not.empty;
      expect(result[0]).to.have.property('prodUrl', 'https://www.space.dog/how-to-chase-a-cat');
      expect(result[0]).to.have.property('devUrl', 'https://www.space.dog/how-to-chase-a-cat');
    });

    it('should return pages of interest from specified sitemap with prod and dev url', async () => {
      // const sitemapSrc = '';

      // const pageProvider = new PageProvider({ sitemapSrc });
      // const result = await pageProvider.getPagesOfInterest(site);

      // expect(result).to.be.an('array').that.is.not.empty;
      // expect(result[0]).to.have.property('prodUrl', 'https://www.space.dog/how-to-chase-a-cat');
      // expect(result[0]).to.have.property('devUrl', 'https://www.space.dog/blog/how-to-chase-a-cat');
    });

    it('should return pages of interest with prod and dev url, when site.baseURL https://space.dog/en/blog.html and sitemap at root https://space.dog', async () => {
      // const pageProvider = new PageProvider({});
      // const result = await pageProvider.getPagesOfInterest(site);

      // expect(result).to.be.an('array').that.is.not.empty;
      // expect(result[0]).to.have.property('prodUrl', 'https://www.space.dog/en/blog.html');
      // expect(result[0]).to.have.property('devUrl', 'https://www.space.dog/en/blog.html');
    });

    it('should return pages of interest with prod and dev url, when https://www.space.dog becomes https://www.space.dog/us/en', async () => {
      // const pageProvider = new PageProvider({});
      // const result = await pageProvider.getPagesOfInterest(site);

      // expect(result).to.be.an('array').that.is.not.empty;
      // expect(result[0]).to.have.property('prodUrl', 'https://www.space.dog/how-to-chase-a-cat');
      // expect(result[0]).to.have.property('devUrl', 'https://www.space.dog/us/en/how-to-chase-a-cat');
    });
  });
});
