import assert from "node:assert/strict";
import test from "node:test";

import { VISUALIZATION_METHODS } from "./registry.ts";
import {
  getMethodRatings,
  METHOD_RATINGS,
  overallVersatility,
  RATING_CRITERIA,
} from "./methodRatings.ts";

test("every available method has one reviewed score for every documented criterion", () => {
  const available = VISUALIZATION_METHODS.filter((method) => method.availability === "available");
  for (const method of available) {
    const ratings = getMethodRatings(method.id);
    assert.ok(ratings, `${method.id} should have reviewed ratings`);
    assert.deepEqual(Object.keys(ratings).sort(), RATING_CRITERIA.map((item) => item.id).sort());
    assert.ok(Object.values(ratings).every(({ score, note }) => score >= 0 && score <= 5 && note));
  }
});

test("in-development methods do not present estimated ratings as reviewed facts", () => {
  const unfinished = VISUALIZATION_METHODS.filter(
    (method) => method.availability === "in-development",
  );
  assert.ok(unfinished.every((method) => getMethodRatings(method.id) === null));
});

test("Overall Versatility is the equal-weight mean of all seventeen criteria", () => {
  const ratings = METHOD_RATINGS.geneaquilt;
  const directMean =
    Object.values(ratings).reduce((sum, item) => sum + item.score, 0) / RATING_CRITERIA.length;
  assert.equal(overallVersatility(ratings), directMean);
});
