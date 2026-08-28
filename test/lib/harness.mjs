// Tiny async test harness shared by the test files in this directory.
export function suite() {
  const list = [];
  const test = (name, fn) => list.push({ name, fn });
  async function run(title) {
    let pass = 0, fail = 0;
    console.log(`\n== ${title} ==`);
    for (const t of list) {
      try {
        await t.fn();
        console.log(`  ok  ${t.name}`);
        pass++;
      } catch (e) {
        console.log(`  FAIL ${t.name}`);
        console.log(`       ${(e && e.stack ? e.stack.split("\n").slice(0, 4).join("\n       ") : e)}`);
        fail++;
      }
    }
    console.log(`  [${title}] ${pass} passed, ${fail} failed`);
    return fail === 0;
  }
  return { test, run };
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

export function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || "assertEq"} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertIncludes(haystack, needle, msg) {
  if (typeof haystack !== "string" || !haystack.includes(needle)) {
    throw new Error(`${msg || "assertIncludes"} — ${JSON.stringify(needle)} not found in output`);
  }
}