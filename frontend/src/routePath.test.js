import test from "node:test";
import assert from "node:assert/strict";
import { routePath } from "./routePath.js";
test("static-host slash redirects still resolve public and private app routes", () => {
  for (const path of [
    "/pricing",
    "/methodology",
    "/sign-in",
    "/people/hon-nancy-pelosi",
  ]) {
    assert.equal(routePath(path + "/"), path);
    assert.equal(routePath(path), path);
  }
  assert.equal(routePath("/"), "/");
  assert.equal(routePath("/people/a%2Fb/"), "/people/a%2Fb");
});
