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
import PageVisitor from '../assessment/libs/page-visitor.js';
import PageCache from '../assessment/libs/page-cache.js';
import RequestRunner from '../assessment/libs/request-runner.js';

chai.use(sinonChai);
chai.use(chaiAsPromised);

describe('PageVisitor', () => {
  const sandbox = sinon.createSandbox();
  const pageDetails = {
    status: 200,
    body: 'Test Page',
    headers: { 'Content-Type': 'text/html' },
  };
  const pageUrls = ['http://foo.com/bar', 'http://foo.com/baz'];
  let pageVisitor;
  let runner;
  let cache;

  beforeEach(() => {
    runner = new RequestRunner(0, 2);
    cache = new PageCache('test-page-cache');
    pageVisitor = new PageVisitor(runner, cache);
  });

  afterEach(() => {
    nock.cleanAll();
    sinon.restore();
  });

  describe('visit', () => {
    it('should fetch page details and store them in the cache', async () => {
      pageUrls.forEach((url) => {
        nock(url).get('/').reply(pageDetails.status, pageDetails.body, pageDetails.headers);
      });

      const expectedPageResponse0 = { url: pageUrls[0], ...pageDetails };
      const expectedPageResponse1 = { url: pageUrls[1], ...pageDetails };
      const runnerRunStub = sandbox.stub(runner, 'run').resolves([expectedPageResponse0, expectedPageResponse1]);
      const cachePutStub = sandbox.stub(cache, 'put').returns();

      const result = await pageVisitor.visit(pageUrls);

      expect(runnerRunStub).to.have.been.calledOnce;
      expect(cachePutStub).to.have.been.calledTwice;
      expect(cachePutStub).to.have.been.calledWith(pageUrls[0], expectedPageResponse0);
      expect(cachePutStub).to.have.been.calledWith(pageUrls[1], expectedPageResponse1);
      expect(result).to.be.an('array').to.deep.include.members([expectedPageResponse0, expectedPageResponse1]);
    });

    it('should fetch page details and store only those were fetch does not fail in the cache', async () => {
      const error = new Error('Fetch failed');

      pageUrls.forEach((url) => {
        nock(url).get('/').replyWithError(error);
      });

      nock('http://foo.com/bar').get('/').replyWithError(error);
      nock('http://foo.com/baz').get('/').reply(pageDetails.status, pageDetails.body, pageDetails.headers);

      const expectedPageResponse = { url: pageUrls[1], ...pageDetails };
      const runnerRunStub = sandbox.stub(runner, 'run').resolves([expectedPageResponse]);
      const cachePutStub = sandbox.stub(cache, 'put').returns();

      const result = await pageVisitor.visit(pageUrls);

      expect(runnerRunStub).to.have.been.calledOnce;
      expect(cachePutStub).to.have.been.calledOnce;
      expect(cachePutStub).to.have.been.calledWith(
        pageUrls[1],
        expectedPageResponse,
      );
      expect(result).to.be.an('array').that.includes(expectedPageResponse);
    });
  });
});
