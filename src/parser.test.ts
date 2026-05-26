import { expect, test } from "bun:test";
import { parseMessage } from "./parser";

test("parseMessage treats full-width slash commands as slash commands", () => {
  expect(parseMessage("／整理").category).toBe("organize");
  expect(parseMessage("／整理 2026-05-26")).toMatchObject({
    category: "organize",
    content: "2026-05-26",
  });
});
