import {canonical} from "./assessment/canonical.js";
import {sitemap} from "./assessment/sitemap.js";

(async () => {
  await sitemap;
  await canonical;
})();
