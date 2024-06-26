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

import path from 'path';
import { fileURLToPath } from 'url';

export const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const OUTPUT_DIR = path.join(ROOT_DIR, 'output');
export const sanitizeFilename = (url) => url.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
export const generateFileName = (siteUrl, title) => `${sanitizeFilename(title)}-${sanitizeFilename(siteUrl)}`;
