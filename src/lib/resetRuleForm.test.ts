import assert from "node:assert/strict";
import { test } from "node:test";
import { resetRuleFormState } from "./resetRuleForm";

test("resetRuleFormState displays legacy fixed dates as the saved month and day", () => {
  assert.deepEqual(
    resetRuleFormState({ type: "fixed_date", fixedDate: "2026-06-25T00:00:00+08:00", timezone: "Asia/Shanghai" }),
    {
      type: "monthly_day",
      dayOfMonth: 25,
      month: 6,
    },
  );
});
