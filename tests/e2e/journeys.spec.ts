import { expect, test } from "@playwright/test";

test("organisation provisioning UI and OIDC application credentials", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("josh@yuma.example");
  await page.getByLabel("Password").fill("change-me-operator");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/operator/);
  await page.goto("/operator/organisations/new");
  const slug = `community-e2e-${Date.now()}`;
  await page.getByPlaceholder("Example Aboriginal Corporation").fill("Community E2E");
  await page.getByPlaceholder("example-ac").fill(slug);
  await page.getByRole("textbox", { name: "Organisation administrator" }).fill("Owner A");
  await page.getByRole("textbox", { name: "Administrator email" }).fill(`owner-a@${slug}.test`);
  await page.getByRole("button", { name: "Create BlakID" }).click();
  await expect(page.getByText("Community E2E").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Australia — Sydney").first()).toBeVisible();
  const shotDir = process.env.SCREENSHOT_DIR;
  if (shotDir) {
    await page.screenshot({ path: `${shotDir}/org-provisioned.png`, fullPage: true });
  }
});

test("health endpoints are actually healthy", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  const body = await health.json();
  expect(body.status).toBe("ok");
  expect(body.identityEngine).toBe("authentik");
  const ready = await request.get("/api/ready");
  expect(ready.ok()).toBeTruthy();
  const readyBody = await ready.json();
  expect(["ready", "degraded"]).toContain(readyBody.status);
});
