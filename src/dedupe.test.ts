import { expect, test } from "bun:test";
import { shouldProcessMessage } from "./dedupe";

test("shouldProcessMessage rejects duplicate ids inside the ttl window", () => {
  const now = 1000;

  expect(shouldProcessMessage("om_1", now)).toBe(true);
  expect(shouldProcessMessage("om_1", now + 1)).toBe(false);
});

test("shouldProcessMessage allows the same id after ttl expires", () => {
  const now = 1000;

  expect(shouldProcessMessage("om_2", now, 10)).toBe(true);
  expect(shouldProcessMessage("om_2", now + 11, 10)).toBe(true);
});
