// SPDX-License-Identifier: GPL-3.0-only
import * as slh from '@noble/post-quantum/slh-dsa.js';
import * as ml from '@noble/post-quantum/ml-dsa.js';
const all = { ...slh, ...ml };
window.__NOBLE_PQ__ = all;
export default all;
