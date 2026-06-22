import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  isDutyExempt,
  dutyKey,
  computeFairnessSpread,
  averageFromArray,
  listDutyAssignments,
  cleanupAssignmentCell,
  isAbsentOnDay,
  isVacationOnDay,
  isNextDayVacation,
  hasCTLeadershipConflict,
  countWeekendDuties,
  getWeekendDutyKWs,
  wouldCreateDFDF,
  getWeekendStateForKW,
  projectedWeekendDutyCount,
  wouldCreateConsecutiveWeekendDuty,
  computeGridConflicts
} from "../js/autoplan.js";

import {
  daysInMonth,
  weekday,
  isoWeekNumber,
  isWorkday,
  getSaxonyHolidaysCached,
  monthKey
} from "../js/constants.js";

import { DATA } from "../js/state.js";

// Fixed reference month used throughout: June 2026 (0-indexed month 5).
// Chosen because it has no Saxony public holidays, so every weekday in it
// is a guaranteed workday and the weekend/weekday math below is unambiguous.
const Y = 2026;
const M = 5;

function findWeekendDay(targetWeekday) {
  const dim = daysInMonth(Y, M);
  for (let d = 1; d <= dim; d++) {
    if (weekday(Y, M, d) === targetWeekday) return d;
  }
  throw new Error(`No day with weekday ${targetWeekday} found in test month`);
}

function findWorkdayWithWorkdayTomorrow() {
  const dim = daysInMonth(Y, M);
  const hols = getSaxonyHolidaysCached(Y);
  for (let d = 1; d < dim; d++) {
    if (isWorkday(Y, M, d, hols) && isWorkday(Y, M, d + 1, hols)) return d;
  }
  throw new Error("No suitable day pair found");
}

function findWorkdayWithWeekendTomorrow() {
  const dim = daysInMonth(Y, M);
  const hols = getSaxonyHolidaysCached(Y);
  for (let d = 1; d < dim; d++) {
    if (isWorkday(Y, M, d, hols) && !isWorkday(Y, M, d + 1, hols)) return d;
  }
  throw new Error("No suitable day pair found");
}

describe("isDutyExempt", () => {
  test("returns true for an employee on the exemption list", () => {
    assert.equal(isDutyExempt("Prof. Schäfer"), true);
  });

  test("returns false for an employee not on the exemption list", () => {
    assert.equal(isDutyExempt("Dr. Test"), false);
  });
});

describe("dutyKey", () => {
  test("builds a stable composite key from employee and day", () => {
    assert.equal(dutyKey("Dr. Test", 5), "Dr. Test@@5");
  });
});

describe("computeFairnessSpread", () => {
  test("returns 0 for an empty array", () => {
    assert.equal(computeFairnessSpread([]), 0);
  });

  test("returns 0 when all values are equal", () => {
    assert.equal(computeFairnessSpread([3, 3, 3]), 0);
  });

  test("returns the max-min spread", () => {
    assert.equal(computeFairnessSpread([1, 5, 3]), 4);
  });
});

describe("averageFromArray", () => {
  test("returns 0 for an empty array", () => {
    assert.equal(averageFromArray([]), 0);
  });

  test("computes the arithmetic mean", () => {
    assert.equal(averageFromArray([2, 4, 6]), 4);
  });
});

describe("listDutyAssignments", () => {
  test("collects one holder per day for the requested duty code", () => {
    const assignments = {
      "Dr. A": { 1: { duty: "D" }, 2: { duty: "HG" } },
      "Dr. B": { 2: { duty: "D" } }
    };
    const result = listDutyAssignments(["Dr. A", "Dr. B"], 2, assignments, "D");
    assert.deepEqual(result, [
      { day: 1, emp: "Dr. A" },
      { day: 2, emp: "Dr. B" }
    ]);
  });

  test("stops at the first holder found per day, ignoring double-bookings", () => {
    const assignments = {
      "Dr. A": { 1: { duty: "D" } },
      "Dr. B": { 1: { duty: "D" } }
    };
    const result = listDutyAssignments(["Dr. A", "Dr. B"], 1, assignments, "D");
    assert.deepEqual(result, [{ day: 1, emp: "Dr. A" }]);
  });

  test("returns an empty list when nobody holds the requested duty", () => {
    const assignments = { "Dr. A": { 1: { duty: "HG" } } };
    const result = listDutyAssignments(["Dr. A"], 1, assignments, "D");
    assert.deepEqual(result, []);
  });
});

describe("cleanupAssignmentCell", () => {
  test("removes falsy fields and deletes the day entry once empty", () => {
    const assignments = { "Dr. A": { 1: { assignment: "", duty: null } } };
    cleanupAssignmentCell(assignments, "Dr. A", 1);
    assert.equal(assignments["Dr. A"][1], undefined);
  });

  test("keeps the day entry when a truthy field remains", () => {
    const assignments = { "Dr. A": { 1: { assignment: "MR", duty: "" } } };
    cleanupAssignmentCell(assignments, "Dr. A", 1);
    assert.deepEqual(assignments["Dr. A"][1], { assignment: "MR" });
  });

  test("is a no-op when there is no cell for the given day", () => {
    const assignments = { "Dr. A": {} };
    assert.doesNotThrow(() => cleanupAssignmentCell(assignments, "Dr. A", 1));
  });
});

describe("isAbsentOnDay / isVacationOnDay", () => {
  test("a vacation code counts as both absent and on vacation", () => {
    const assignments = { "Dr. A": { 1: { assignment: "U" } } };
    assert.equal(isAbsentOnDay(Y, M, "Dr. A", 1, assignments), true);
    assert.equal(isVacationOnDay(Y, M, "Dr. A", 1, assignments), true);
  });

  test("a sick code is absent but not vacation", () => {
    const assignments = { "Dr. A": { 1: { assignment: "K" } } };
    assert.equal(isAbsentOnDay(Y, M, "Dr. A", 1, assignments), true);
    assert.equal(isVacationOnDay(Y, M, "Dr. A", 1, assignments), false);
  });

  test("a regular workplace code is neither", () => {
    const assignments = { "Dr. A": { 1: { assignment: "MR" } } };
    assert.equal(isAbsentOnDay(Y, M, "Dr. A", 1, assignments), false);
    assert.equal(isVacationOnDay(Y, M, "Dr. A", 1, assignments), false);
  });

  test("a missing cell is neither", () => {
    const assignments = { "Dr. A": {} };
    assert.equal(isAbsentOnDay(Y, M, "Dr. A", 1, assignments), false);
    assert.equal(isVacationOnDay(Y, M, "Dr. A", 1, assignments), false);
  });
});

describe("isNextDayVacation", () => {
  test("detects vacation on the following calendar day within the same month", () => {
    const assignments = { "Dr. A": { 1: { assignment: "MR" }, 2: { assignment: "U" } } };
    assert.equal(isNextDayVacation(Y, M, "Dr. A", 1, assignments), true);
  });

  test("returns false when the following day is a normal workplace assignment", () => {
    const assignments = { "Dr. A": { 1: { assignment: "MR" }, 2: { assignment: "CT" } } };
    assert.equal(isNextDayVacation(Y, M, "Dr. A", 1, assignments), false);
  });
});

describe("hasCTLeadershipConflict", () => {
  test("never applies to employees outside the Becker/Martin leadership pair", () => {
    const d = findWorkdayWithWorkdayTomorrow();
    const assignments = { "Dr. A": {}, "Dr. Martin": { [d + 1]: { assignment: "U" } } };
    assert.equal(hasCTLeadershipConflict(Y, M, "Dr. A", d, assignments), false);
  });

  test("flags a conflict when the partner is absent the next workday", () => {
    const d = findWorkdayWithWorkdayTomorrow();
    const assignments = { "Dr. Becker": {}, "Dr. Martin": { [d + 1]: { assignment: "U" } } };
    assert.equal(hasCTLeadershipConflict(Y, M, "Dr. Becker", d, assignments), true);
  });

  test("no conflict when the partner is present the next workday", () => {
    const d = findWorkdayWithWorkdayTomorrow();
    const assignments = { "Dr. Becker": {}, "Dr. Martin": { [d + 1]: { assignment: "MR" } } };
    assert.equal(hasCTLeadershipConflict(Y, M, "Dr. Becker", d, assignments), false);
  });

  test("no conflict when the next day is not a workday at all", () => {
    const d = findWorkdayWithWeekendTomorrow();
    const assignments = { "Dr. Becker": {}, "Dr. Martin": { [d + 1]: { assignment: "U" } } };
    assert.equal(hasCTLeadershipConflict(Y, M, "Dr. Becker", d, assignments), false);
  });
});

describe("computeGridConflicts", () => {
  test("does not flag a CT-Leitungskonflikt on a day without a D-duty, even if the partner is absent tomorrow", () => {
    const d = findWorkdayWithWorkdayTomorrow();
    DATA[monthKey(Y, M)] = {
      employees: ["Dr. Becker", "Dr. Martin"],
      assignments: {
        "Dr. Becker": { [d]: { assignment: "MR" } },
        "Dr. Martin": { [d + 1]: { assignment: "U" } }
      },
      rbn: {}
    };
    const conflicts = computeGridConflicts(Y, M);
    assert.equal(conflicts.has(dutyKey("Dr. Becker", d)), false);
  });

  test("flags a CT-Leitungskonflikt when the employee actually holds a D-duty and the partner is absent tomorrow", () => {
    const d = findWorkdayWithWorkdayTomorrow();
    DATA[monthKey(Y, M)] = {
      employees: ["Dr. Becker", "Dr. Martin"],
      assignments: {
        "Dr. Becker": { [d]: { duty: "D", assignment: "F" } },
        "Dr. Martin": { [d + 1]: { assignment: "U" } }
      },
      rbn: {}
    };
    const conflicts = computeGridConflicts(Y, M);
    assert.ok(conflicts.get(dutyKey("Dr. Becker", d))?.some((r) => r.includes("CT-Leitungskonflikt")));
  });
});

describe("countWeekendDuties / getWeekendDutyKWs", () => {
  test("a Bereitschaftsdienst (D) on a weekend day counts as a full weekend duty", () => {
    const fri = findWeekendDay(5);
    const assignments = { "Dr. A": { [fri]: { duty: "D" } } };
    assert.equal(countWeekendDuties(Y, M, "Dr. A", assignments), 1);
    assert.equal(getWeekendDutyKWs(Y, M, "Dr. A", assignments).size, 1);
  });

  test("a Hintergrunddienst (HG) on a weekend day counts as half a weekend duty", () => {
    const sat = findWeekendDay(6);
    const assignments = { "Dr. A": { [sat]: { duty: "HG" } } };
    assert.equal(countWeekendDuties(Y, M, "Dr. A", assignments), 0.5);
  });

  test("D takes precedence over HG within the same ISO week", () => {
    const fri = findWeekendDay(5);
    const sun = findWeekendDay(0);
    const assignments = { "Dr. A": { [fri]: { duty: "D" }, [sun]: { duty: "HG" } } };
    // Friday and Sunday fall in the same ISO week in this calendar, so the
    // D already covers it and the HG must not add an extra 0.5.
    if (isoWeekNumber(Y, M, fri) === isoWeekNumber(Y, M, sun)) {
      assert.equal(countWeekendDuties(Y, M, "Dr. A", assignments), 1);
    }
  });

  test("weekday duties are not counted as weekend duties", () => {
    const dim = daysInMonth(Y, M);
    let weekday1to5 = null;
    for (let d = 1; d <= dim; d++) {
      const wd = weekday(Y, M, d);
      if (wd >= 1 && wd <= 4) { weekday1to5 = d; break; }
    }
    const assignments = { "Dr. A": { [weekday1to5]: { duty: "D" } } };
    assert.equal(countWeekendDuties(Y, M, "Dr. A", assignments), 0);
    assert.equal(getWeekendDutyKWs(Y, M, "Dr. A", assignments).size, 0);
  });
});

describe("wouldCreateDFDF", () => {
  test("detects a D . F . D pattern looking backwards", () => {
    const assignments = { "Dr. A": { 1: { duty: "D" }, 2: { assignment: "F" } } };
    assert.equal(wouldCreateDFDF("Dr. A", 3, assignments), true);
  });

  test("detects a D . F . D pattern looking forwards", () => {
    const assignments = { "Dr. A": { 3: { duty: "D" } } };
    assert.equal(wouldCreateDFDF("Dr. A", 1, assignments), true);
  });

  test("returns false when neither side has a duty two days away", () => {
    const assignments = { "Dr. A": {} };
    assert.equal(wouldCreateDFDF("Dr. A", 5, assignments), false);
  });
});

describe("getWeekendStateForKW / projectedWeekendDutyCount", () => {
  test("getWeekendStateForKW reports hasD/hasHG for the given ISO week", () => {
    const sat = findWeekendDay(6);
    const kw = isoWeekNumber(Y, M, sat);
    const assignments = { "Dr. A": { [sat]: { duty: "HG" } } };
    assert.deepEqual(getWeekendStateForKW(Y, M, "Dr. A", assignments, kw), { hasD: false, hasHG: true });
  });

  test("projecting a D onto a weekend day with no existing duty adds a full duty", () => {
    const sat = findWeekendDay(6);
    const assignments = { "Dr. A": {} };
    assert.equal(projectedWeekendDutyCount(Y, M, "Dr. A", assignments, "D", sat), 1);
  });

  test("projecting onto a weekday leaves the count unchanged", () => {
    const dim = daysInMonth(Y, M);
    let weekdayDay = null;
    for (let d = 1; d <= dim; d++) {
      const wd = weekday(Y, M, d);
      if (wd >= 1 && wd <= 4) { weekdayDay = d; break; }
    }
    const assignments = { "Dr. A": {} };
    assert.equal(projectedWeekendDutyCount(Y, M, "Dr. A", assignments, "D", weekdayDay), 0);
  });

  test("projecting an HG onto a week that already has a D adds nothing", () => {
    const fri = findWeekendDay(5);
    const sat = findWeekendDay(6);
    const assignments = { "Dr. A": { [fri]: { duty: "D" } } };
    if (isoWeekNumber(Y, M, fri) === isoWeekNumber(Y, M, sat)) {
      assert.equal(projectedWeekendDutyCount(Y, M, "Dr. A", assignments, "HG", sat), 1);
    }
  });
});

describe("wouldCreateConsecutiveWeekendDuty", () => {
  test("flags back-to-back ISO weeks with weekend duty", () => {
    const sat1 = findWeekendDay(6);
    const dim = daysInMonth(Y, M);
    const kw1 = isoWeekNumber(Y, M, sat1);

    let nextWeekendDay = null;
    for (let d = sat1 + 1; d <= dim; d++) {
      const wd = weekday(Y, M, d);
      if ((wd === 5 || wd === 6 || wd === 0) && isoWeekNumber(Y, M, d) === kw1 + 1) {
        nextWeekendDay = d;
        break;
      }
    }
    assert.ok(nextWeekendDay, "expected to find a weekend day in the following ISO week");

    const assignments = { "Dr. A": { [sat1]: { duty: "D" } } };
    assert.equal(wouldCreateConsecutiveWeekendDuty(Y, M, "Dr. A", assignments, nextWeekendDay), true);
  });

  test("does not flag an isolated weekend duty", () => {
    const sat = findWeekendDay(6);
    const assignments = { "Dr. A": {} };
    assert.equal(wouldCreateConsecutiveWeekendDuty(Y, M, "Dr. A", assignments, sat), false);
  });

  test("ignores weekday candidate days entirely", () => {
    const dim = daysInMonth(Y, M);
    let weekdayDay = null;
    for (let d = 1; d <= dim; d++) {
      const wd = weekday(Y, M, d);
      if (wd >= 1 && wd <= 4) { weekdayDay = d; break; }
    }
    const assignments = { "Dr. A": {} };
    assert.equal(wouldCreateConsecutiveWeekendDuty(Y, M, "Dr. A", assignments, weekdayDay), false);
  });
});

