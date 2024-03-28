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
import sinon from 'sinon';

import RequestRunner from '../assessment/libs/request-runner.js';

const { expect } = chai;

describe('RequestRunner', () => {
  describe('run', () => {
    it('should handle successful requests', async () => {
      const runner = new RequestRunner();
      const mockRequest = sinon.stub().resolves({ status: 200, ok: true });
      const responses = await runner.run([mockRequest]);

      expect(responses).to.have.lengthOf(1);
      expect(responses[0]).to.deep.equal({ status: 200, ok: true });
      expect(mockRequest.calledOnce).to.be.true;
    });

    it('should handle failed requests', async () => {
      const runner = new RequestRunner();
      const mockRequest = sinon.stub().resolves({ status: 400, ok: false });
      const responses = await runner.run([mockRequest]);

      expect(responses).to.have.lengthOf(1);
      expect(responses[0]).to.deep.equal({ status: 400, ok: false });
      expect(mockRequest.calledOnce).to.be.true;
    });

    it('should retry on 429 status', async () => {
      const runner = new RequestRunner();
      const mockRequest = sinon.stub();
      mockRequest.onCall(0).resolves({ status: 429, ok: false });
      mockRequest.onCall(1).resolves({ status: 200, ok: true });
      const responses = await runner.run([mockRequest]);

      expect(responses).to.have.lengthOf(1);
      expect(responses[0]).to.deep.equal({ status: 200, ok: true });
      expect(mockRequest.calledTwice).to.be.true;
    });
  });
});
