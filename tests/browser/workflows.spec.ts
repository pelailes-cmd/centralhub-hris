import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

async function auditAccessibility(page: Page) {
  // Measure the settled page, not a transient frame of its entry fade.
  await page.evaluate(async () => {
    await document.fonts.ready;
    const animations = document
      .getAnimations()
      .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime));
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
  });
  return new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
}

test("overview has functional navigation and accessible content", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Good (morning|afternoon|evening), Maya/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Clock in", exact: true })).toBeVisible();
  const audit = await auditAccessibility(page);
  expect(audit.violations).toEqual([]);
  mkdirSync("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/overview-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Search workspace" }).click();
  await page.getByRole("textbox", { name: "Search people and pages" }).fill("Priya");
  await page.getByRole("link", { name: /Priya Shah/ }).click();
  await expect(page.getByRole("heading", { name: "Priya Shah", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
test("employee search, department filters, pagination, creation, and persistence", async ({
  page,
}) => {
  await page.goto("/employees");
  await expect(page.getByRole("heading", { name: "Good people. One place." })).toBeVisible();
  await page.getByRole("textbox", { name: "Search employees" }).fill("Priya");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Priya Shah");
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Filter by department" })
    .selectOption({ label: "Engineering" });
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Showing 9–16 of 22 people")).toBeVisible();
  await page.getByRole("button", { name: "Add employee", exact: true }).click();
  await page.getByLabel("Full name", { exact: false }).fill("Taylor Preview");
  await page.getByLabel("Employee number", { exact: false }).fill("CH-0099");
  await page.getByLabel("Work email", { exact: false }).fill("taylor.preview@example.test");
  await page.getByLabel("Job title", { exact: false }).fill("People Coordinator");
  await page.getByRole("button", { name: "Add employee", exact: true }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Search employees" }).fill("Taylor Preview");
  await expect(page.locator("tbody")).toContainText("Taylor Preview");
  await page.reload();
  await page.getByRole("textbox", { name: "Search employees" }).fill("Taylor Preview");
  await page
    .getByRole("link", { name: /Taylor Preview/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Taylor Preview", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Taylor Preview", exact: true })).toBeVisible();
});
test("clocking in/out and task completion persist in the preview", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Clock in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Clock out", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Clock out", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clock out", exact: true }).click();
  await expect(page.getByRole("button", { name: "All done for today" })).toBeDisabled();
  const task = page.getByRole("button", { name: "Complete: Prepare for your growth conversation" });
  await task.click();
  await expect(
    page.getByRole("button", { name: "Reopen: Prepare for your growth conversation" }),
  ).toHaveAttribute("aria-pressed", "true");
});
test("leave approval works and own requests have no approval action", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Review", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toContainText("Review time off");
  await page.getByRole("button", { name: "Confirm decision" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Request approved.", { exact: true })).toBeVisible();
  await page.goto("/leave");
  await page.getByRole("button", { name: "View", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toContainText("Assigned approver:");
  await expect(page.getByRole("button", { name: "Confirm decision" })).toHaveCount(0);
});
test("leave requests reserve a balance and can be cancelled", async ({ page }) => {
  await page.goto("/leave");
  await page.getByRole("button", { name: "Request time off", exact: true }).first().click();
  const date = new Date();
  date.setDate(date.getDate() + 40);
  while ([0, 6].includes(date.getDay())) date.setDate(date.getDate() + 1);
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  await page.getByLabel("First day", { exact: false }).fill(iso);
  await page.getByLabel("Last day", { exact: false }).fill(iso);
  await page.getByLabel("Reason", { exact: true }).fill("A planned day with my family.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Request time off", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Leave requested. Your assigned approver has been notified."),
  ).toBeVisible();
  await page
    .locator("tbody tr")
    .first()
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel request", exact: true }).click();
  await expect(page.locator("tbody tr").first()).toContainText("Cancelled");
});
test("payslip downloads and document acknowledgements work", async ({ page }) => {
  await page.goto("/payroll");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: /Download .* payslip/ })
    .first()
    .click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/payslip-.*\.csv/);
  await page.goto("/documents");
  await page.getByRole("button", { name: "Acknowledge", exact: true }).first().click();
  await page.getByRole("checkbox", { name: "I have read and understood this document." }).check();
  await page.getByRole("button", { name: "Record acknowledgement" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Acknowledgement recorded. Thank you.")).toBeVisible();
});
test("personal details save and login provides password visibility and reset access", async ({
  page,
}) => {
  await page.goto("/settings");
  await page.getByLabel("Emergency contact name", { exact: false }).fill("Casey Preview");
  await page.getByLabel("Emergency contact phone", { exact: false }).fill("+63 917 555 0199");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("Emergency contact name", { exact: false })).toHaveValue(
    "Casey Preview",
  );
  await page.goto("/login");
  await page.getByLabel("Password", { exact: true }).fill("a fictional password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page.getByRole("heading", { name: "A fresh start." })).toBeVisible();
});
test("mobile navigation traps focus, closes with Escape, and avoids page overflow", async ({
  page,
}) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(
    true,
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  for (const route of [
    "/",
    "/employees",
    "/attendance",
    "/leave",
    "/payroll",
    "/documents",
    "/performance",
    "/recruitment",
    "/announcements",
    "/administration",
    "/approvals",
    "/settings",
    "/login",
  ]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect
      .soft(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        `Overflow on ${route}`,
      )
      .toBe(true);
    const audit = await auditAccessibility(page);
    expect
      .soft(
        audit.violations.map((violation) => ({
          id: violation.id,
          elements: violation.nodes.map((node) => ({
            html: node.html,
            summary: node.failureSummary,
          })),
        })),
        `Accessibility on ${route}`,
      )
      .toEqual([]);
  }
  await page.goto("/");
  mkdirSync("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/overview-mobile.png", fullPage: true });
  for (const width of [360, 768]) {
    await page.setViewportSize({ width, height: 1024 });
    for (const route of ["/", "/employees", "/attendance"]) {
      await page.goto(route);
      // Next.js can retain hidden route markup; require one accessible page heading.
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect
        .soft(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
          `Overflow at ${width}px on ${route}`,
        )
        .toBe(true);
    }
  }
  await page.goto("/login");
  const audit = await auditAccessibility(page);
  expect(audit.violations).toEqual([]);
});
test("API routes reject missing origins and never serve preview records", async ({ request }) => {
  const mutation = await request.post("/api/actions", {
    data: { action: "employee", payload: {} },
  });
  expect(mutation.status()).toBe(403);
  const file = await request.get("/api/downloads/payslip/00000000-0000-4000-8000-000000001001");
  expect(file.status()).toBe(503);
});
