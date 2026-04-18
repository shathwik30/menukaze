# Menukaze Pre-Launch Checklist (Phase 5)

Run through every item before cutting the first production deployment. Tick each box when verified.

---

## 1. Security

- [ ] **CSP headers** — open any page in the browser, inspect the `Content-Security-Policy` response header. Verify it contains `nonce-` in `script-src` and `strict-dynamic`.
- [ ] **HSTS** — response headers include `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
- [ ] **X-Frame-Options** — response headers include `X-Frame-Options: DENY`.
- [ ] **X-Content-Type-Options** — response headers include `X-Content-Type-Options: nosniff`.
- [ ] **No secrets in source** — `git log --all -p | grep -E "(SECRET|KEY|PASSWORD|TOKEN)" | grep -v ".example"` returns nothing sensitive.
- [ ] **gitleaks clean** — `gitleaks detect --source . --no-git` exits 0. Install: `brew install gitleaks`.
- [ ] **Webhook HMAC rejection** — craft a request to `/api/webhooks/razorpay/{restaurantId}` with a bad `X-Razorpay-Signature` header. Response must be 400.
- [ ] **Audit log hash chain** — if audit logging is in place, run the verifier script and confirm no divergence.
- [ ] **Dependency vulnerability scan** — GitHub Actions `Dependency Scan` (OSV Scanner) passes for `pnpm-lock.yaml`. For a local cross-check, run OSV Scanner against the lockfile.
- [ ] **Razorpay webhook bad-sig test** — repeat the webhook test above specifically with Razorpay's test webhook tool; ensure a mismatched signature is rejected.
- [ ] **All env vars loaded from environment** — grep the production build for hardcoded API keys: `grep -r "rzp_live\|sk_live\|rk_live" apps/ packages/ --include="*.ts" --include="*.tsx"` → 0 results.

---

## 2. Compliance

- [ ] **Cookie consent banner** — visit the storefront in an incognito window. The consent banner must appear. Accept only "strictly necessary" and confirm no analytics scripts fire (check Network tab).
- [ ] **Privacy policy** — `{slug}.menukaze.com/privacy` returns a 200 with the full policy text.
- [ ] **Terms of service** — `{slug}.menukaze.com/terms` returns a 200 with the full ToS text.
- [ ] **DSAR export** — from the dashboard, trigger a data export for a test customer. Receive a JSON bundle within 5 minutes. Validate it contains order history, customer profile, and session data.
- [ ] **Receipt PDF tax check** — place a test order in a restaurant with a tax rule configured (e.g., 18% GST). Download the receipt PDF. Verify:
  - [ ] Subtotal is shown
  - [ ] Tax amount and label are shown separately
  - [ ] Total equals subtotal + tax
- [ ] **Allergen display** — mark an item with an allergen tag (e.g., "gluten-free"). Visit the storefront and verify the tag is visible on the menu item card, the KDS ticket, and the receipt.

---

## 3. Performance Budget

- [ ] **Bundle sizes** — run `pnpm build` and check that no app produces a first-load JS > 250 kB (gzipped). Inspect `.next/analyze/` or the build output.
- [ ] **Storefront Lighthouse (mobile)** — run Lighthouse on the storefront home page in Chrome DevTools on mobile preset:
  - [ ] LCP ≤ 2.5 s
  - [ ] TBT ≤ 200 ms
  - [ ] CLS ≤ 0.1
- [ ] **Dashboard tRPC P95** — with the dev server running, place 20 rapid requests to a tRPC endpoint (e.g., orders list) and confirm P95 ≤ 300 ms (use the Network tab timing or a quick `wrk`/`curl` loop).
- [ ] **KDS realtime P95** — open the KDS in one tab, place orders from another tab at a rate of 1/s for 30 s. Check browser console timing logs for Ably message delivery. P95 ≤ 2 s.

---

## 4. Backup & Restore Drill

Run against the **staging** database — never against production.

- [ ] **Take a snapshot** — in MongoDB Atlas, take a manual snapshot of the staging cluster.
- [ ] **Restore to scratch cluster** — create a temporary Atlas cluster, restore the snapshot to it.
- [ ] **Verify one tenant** — connect to the scratch cluster and run:
  ```js
  db.restaurants.findOne({ slug: 'demo' })
  ```
  Confirm the document is present and readable.
- [ ] **Tear down scratch cluster** — delete the temporary cluster after verification.

---

## 5. Observability Dry-Run

- [ ] **Error events** — trigger a deliberate 500 error on staging (e.g., pass an invalid ObjectId to an API route). Within 2 minutes, verify the event appears in the configured monitoring sink with a stack trace or digest.
- [ ] **Axiom logs** — set `AXIOM_TOKEN` and `AXIOM_DATASET`, restart the worker, and look for "worker ready". Confirm the line appears in Axiom under the correct dataset.
- [ ] **OpenTelemetry trace** — place a test order on staging. Open Axiom OTEL and confirm an HTTP span exists for the checkout request.
- [ ] **Webhook delivery log** — subscribe a test endpoint (e.g., `requestbin`) to `order.created`. Place a test order. Confirm the delivery attempt is logged in the dashboard webhook log with status 200.
- [ ] **Webhook failure log** — change the test endpoint to a URL that returns 500. Place an order. Confirm the delivery log records a failure and a retry is scheduled.

---

## 6. Load Smoke Test

Requires [k6](https://k6.io) installed (`brew install k6` or `apt install k6`).

```bash
# Start the dev server first: pnpm dev
# Then in a separate terminal:
k6 run scripts/smoke.js
```

Target: **0 errors, P95 < 1 s** over 50 VUs for 60 s.

For production smoke test (after deploy):
```bash
BASE_URL=https://demo.menukaze.com SLUG=demo k6 run scripts/smoke.js
```

- [ ] Smoke test passes with 0 errors.
- [ ] P95 response time < 1 s.
- [ ] No 5xx responses in the k6 output.

---

## 7. End-to-End Verification (Final Gate)

Run the full Phase 4 verification sequence one last time on staging/production:

- [ ] Sign up a fresh test account at `{domain}/signup`.
- [ ] Complete the onboarding wizard (profile → menu → tables → Razorpay → go live).
- [ ] Visit `{slug}.menukaze.com` as a customer in incognito.
- [ ] Add items to cart, checkout with a Razorpay test card.
- [ ] Order appears in the dashboard order list with correct tax breakdown.
- [ ] Order appears on the KDS; tap through statuses.
- [ ] Customer tracking page updates live as status changes.
- [ ] Scan a table QR code; start a dine-in session.
- [ ] Place two order rounds.
- [ ] Request the bill; pay via Razorpay test mode.
- [ ] Table is released; status returns to "Available".
- [ ] Order confirmation + receipt emails arrive (check Resend test domain or real inbox).
- [ ] Receipt PDF shows correct subtotal, tax amount, and total.
- [ ] Delete the test merchant from the database (or via super admin once available).

---

**Phase 5 is complete when every box above is ticked.**

Tag the release before production deploy: `git tag v1.0-rc && git push --tags`
