# 🛍️ ShopSphere QA Sandbox

An open-source, fully functional e-commerce single-page application built with **HTML5, Tailwind CSS, and Vanilla JavaScript** — created specifically as a **hands-on QA portfolio project**.

Use it to practice and demonstrate:
- ✅ Manual test case design & exploratory testing
- 🐞 Jira-style bug logging & retesting
- 🌐 Cross-browser / cross-device testing
- 🔌 API/REST response validation (mocked 200 / 400 / 404)
- 🤖 E2E test automation with **Playwright** or **Cypress**
- 📊 GA4-style analytics event verification

---

## 📁 Project Structure

```
shopsphere-qa-sandbox/
├── index.html        # App shell & all markup (home, shop, checkout, modals, drawer)
├── styles.css         # Design system, animations, and the responsive "bug" styles
├── app.js             # All application logic, state, mock API, and event wiring
├── products.json      # Seed data: 8 demo products w/ images, prices, reviews
└── README.md          # You are here
```

No build step, no dependencies to install — it's pure static HTML/CSS/JS.

---

## 🚀 Deploy in 2 Clicks

### Option A — GitHub Pages
1. Push this repo to GitHub (or fork it).
2. Go to **Settings → Pages → Build and deployment → Source: "Deploy from a branch"**, select the `main` branch and `/ (root)` folder, then click **Save**.
3. GitHub will publish your site at `https://<your-username>.github.io/<repo-name>/` within a minute.

> That's it — 2 clicks: **Settings → Pages**, pick the branch, hit **Save**.

### Option B — Vercel
1. Import the repository at [vercel.com/new](https://vercel.com/new).
2. Leave the framework preset as **"Other"** (no build command needed) and click **Deploy**.

Both platforms serve static files directly, so `products.json` and all relative paths (`fetch("products.json")`) work out of the box.

---

## 🔑 Test Credentials

| Username         | Password      | Behavior                                                        |
|------------------|---------------|-------------------------------------------------------------------|
| `standard_user`  | `password123` | Normal, fully functional checkout flow                           |
| `problem_user`   | `password123` | Logs in fine, but **breaks on the final "Finish" step** (see bugs below) |

Use the **"Use"** quick-fill buttons in the Sign In modal to autofill either account. You can also register a brand-new mock account from the "Register" tab (client-side only, not persisted to a real backend).

---

## 🧪 QA Testing Hooks

- **Locators:** Every interactive element (buttons, inputs, forms, alerts, cards) has a `data-testid` attribute, e.g. `data-testid="input-promo-code"`, `data-testid="btn-apply-promo"`, `data-testid="btn-checkout"`.
- **Analytics simulation:** Key actions (`add_to_cart`, `select_promotion`, `purchase`, `login`, `view_item`, `remove_from_cart`) dispatch a `window` `CustomEvent("analytics", {...})` and log to the console with a `[GA4 Event]` tag, and also push to `window.dataLayer`. Great for asserting analytics calls in Playwright via `page.on('console')` or by listening for the custom event.
- **Mock REST API:** See `MockAPI` in `app.js` — simulates:
  - `GET /api/products` → 200 (reads `products.json`)
  - `POST /api/login` → 200 / 400 (invalid credentials)
  - `POST /api/register` → 200 / 400 (weak password)
  - `POST /api/orders` → 200 / 400 (empty cart)
  - `GET /api/orders/:id` → 200 / 404 (unknown order id)
  All mock calls run through `window.ShopSphere.MockAPI` in the browser console for manual API-style testing.
- **State persistence:** Cart, applied promo, logged-in user, and shipping info persist to `localStorage` so refreshes don't wipe your test session.

---

## 🐞 Known Issues (Hidden QA Reference)

> **Spoiler warning:** This section intentionally documents planted bugs for bug-logging practice. If you want the thrill of discovering them yourself first, stop reading here and go explore the app!

<details>
<summary><strong>Click to reveal the 4 intentional bugs</strong></summary>

### 1. Promo Code Miscalculation — `SAVE20`
**Where:** `app.js` → `calculateDiscount(code, subtotal)`
**Expected:** `SAVE20` should always apply a flat **20% discount**, regardless of subtotal.
**Actual:** For subtotals **over $100**, the function incorrectly applies only **2%** instead of 20% (an accidental "bulk discount tier" branch).
**Repro steps:**
1. Add items to the cart until the subtotal is ≤ $100 (e.g., one $89.99 item).
2. Apply promo `SAVE20` → discount should be exactly 20% of subtotal. ✅ Works correctly.
3. Add more items until subtotal exceeds $100.
4. Re-apply `SAVE20` → discount incorrectly computes as 2% instead of 20%. ❌
**Good test design angle:** Boundary value analysis around the $100 threshold ($99.99 vs $100.01).

### 2. Mobile Responsiveness — Checkout Button Overlaps Footer Nav
**Where:** `styles.css` → `@media (max-width: 389px) { #cart-checkout-btn { ... } }`
**Expected:** The cart drawer's "Checkout" button should sit comfortably above the fixed mobile bottom navigation bar on small phones.
**Actual:** Below **390px viewport width** (e.g., iPhone SE, older iPhone models), the button is pinned to `bottom: 0`, exactly overlapping the `.mobile-bottom-nav` bar, which also uses `bottom: 0`. The two fixed elements stack on top of each other.
**Repro steps:**
1. Open DevTools responsive mode, set width to 375px (iPhone SE) or narrower.
2. Add an item to the cart and open the cart drawer.
3. Observe the "Checkout" button rendering directly on top of / flush against the mobile footer tab bar, making both hard to tap precisely.
**Good test design angle:** Cross-device / responsive breakpoint testing — test at 389px, 390px, and 391px to find the exact CSS breakpoint boundary.

### 3. ZIP Code Field Accepts Invalid Characters
**Where:** `app.js` → `isValidZip(value)`
**Expected:** ZIP/postal code should be validated for realistic numeric/alphanumeric postal formats.
**Actual:** The validator only checks **string length (5–10 characters)** and never checks the actual character set, so values like `@#$%^`, `!!!!!`, or `-----` pass validation without any error.
**Repro steps:**
1. Go to Checkout → Step 1 (Shipping Address).
2. Fill out all fields normally, but enter `@#$%^` in the ZIP Code field.
3. Click "Continue to Payment" → form incorrectly accepts it and proceeds. ❌
**Good test design angle:** Negative testing / input sanitization — try SQL-injection-like strings, emojis, and whitespace-only values.

### 4. `problem_user` Breaks on Final Checkout Step
**Where:** `app.js` → `handleFinishOrder()`
**Expected:** Clicking "Finish" after a successful order confirmation should return the user to the shop with a success toast, regardless of which account is logged in.
**Actual:** When logged in as `problem_user`, clicking **"Finish"** triggers a `fetch("/checkout-complete.html")` call to a page that doesn't exist, resulting in a **404** response. The promise chain has no `.catch()`, so it surfaces as an **unhandled promise rejection** in the DevTools console instead of failing gracefully.
**Repro steps:**
1. Sign in as `problem_user` / `password123`.
2. Add any product to cart → checkout → complete Shipping and Payment steps with valid data.
3. On the confirmation screen, click **"Finish"**.
4. Open DevTools console → observe an unhandled promise rejection / 404 network error for `/checkout-complete.html`.
**Good test design angle:** Negative/role-based testing, console-error assertions in Playwright (`page.on('pageerror')` / `page.on('console')`), and network-tab validation in Cypress (`cy.intercept`).

</details>

---

## 🧰 Suggested Automation Starting Points

```js
// Example Playwright locator usage
await page.getByTestId('input-promo-code').fill('SAVE20');
await page.getByTestId('btn-apply-promo').click();

// Example Cypress analytics event assertion
cy.window().then((win) => {
  cy.stub(win, 'dispatchEvent').as('analyticsEvent');
});
```

Happy testing! 🎯
