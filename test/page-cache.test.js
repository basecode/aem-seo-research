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

import { expect } from 'chai';
import sinon from 'sinon';
import fs from 'fs';
import PageCache from '../assessment/libs/page-cache.js';

describe('PageCache', () => {
  let sandbox;
  let pageCache;
  const outputDir = 'test-page-cache';
  const pageUrl = 'http://foo.com/bar';
  const pageDetails = { body: 'Test Page', status: 200 };

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    pageCache = new PageCache(outputDir);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('put', () => {
    it('should write page details to a file', () => {
      const writeFileSyncStub = sandbox.stub(fs, 'writeFileSync');
      pageCache.put(pageUrl, pageDetails);
      expect(writeFileSyncStub.calledOnce).to.be.true;
    });

    it('should warn when no page details are provided', () => {
      const consoleWarnStub = sandbox.stub(console, 'warn');
      pageCache.put(pageUrl, null);
      expect(consoleWarnStub.calledOnce).to.be.true;
    });
  });

  describe('get', () => {
    it('should return null if no cache file exists', () => {
      const readdirSyncStub = sandbox.stub(fs, 'readdirSync').returns([]);
      const result = pageCache.get(pageUrl);
      expect(result).to.be.null;
      expect(readdirSyncStub.calledOnce).to.be.true;
    });

    it('should return cached content if cache file exists', () => {
      const readdirSyncStub = sandbox.stub(fs, 'readdirSync').returns(['page_cache-http___foo_com_bar.json']);
      const readFileSyncStub = sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(pageDetails));
      const result = pageCache.get(pageUrl);
      expect(result).to.deep.equal(pageDetails);
      expect(readdirSyncStub.calledOnce).to.be.true;
      expect(readFileSyncStub.calledOnce).to.be.true;
    });
  });
});
