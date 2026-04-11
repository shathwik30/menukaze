# Menukaze — Product Overview

> The restaurant operating system. Shopify, but for restaurants.

---

## 1. What Menukaze Is

Menukaze is a multi-tenant SaaS platform that gives any restaurant — from a neighbourhood cafe to a fine-dining venue — a complete digital operating system from a single signup. Each restaurant gets an online storefront, QR dine-in ordering, a self-serve kiosk, reservations, a kitchen display system, staff management, and a public API for building custom experiences. Everything runs from one unified dashboard.

Every restaurant is served at its own branded subdomain:

```
{restaurant-slug}.menukaze.com
```

---

## 2. Platform Architecture

Menukaze has three layers:

| Layer | Purpose |
|---|---|
| **Super Admin** | The platform owner runs the business: merchants, billing, plans, feature flags, platform health. |
| **Restaurant Dashboard** | Each restaurant runs its entire operation: menu, orders, staff, payments, analytics. |
| **Customer-Facing** | Storefront, QR dine-in, kiosk, and any custom frontend a restaurant builds on the API. |

The platform is **API-first**. The default storefront, the QR dine-in app, and the kiosk all consume the same public **Storefront API** that restaurants use to build custom integrations. Webhooks keep every component in sync.

---

## 3. Channels

A **channel** is the source of an order. Every order on Menukaze is tagged with exactly one channel, and channels power order routing, analytics, and customer attribution.

### Built-in Channels

Created automatically for every restaurant:

- **Menukaze Storefront** — orders from `{slug}.menukaze.com`
- **QR Dine-In** — orders from customers scanning a table QR code
- **Self-Serve Kiosk** — orders from the in-store kiosk
- **Walk-In / POS** — orders entered by staff from the dashboard

### API-Based Channels

Created by the restaurant. **Each API key is a channel.** When a restaurant generates a key, it assigns the key a channel name, icon, and colour. Every order placed through that key is tagged with that channel automatically.

Typical examples: "Our WordPress Site", "Partner Microsite", "UberEats Integration", "Zomato Feed". A restaurant creates as many channels as it needs.

### Per-Channel Controls

For every channel, the restaurant controls:

- Enable or disable (pauses the source without deleting it)
- Preparation time override
- Tax and fee overrides (e.g., aggregator commission)
- Notification preferences
- Sound alert on the KDS
- Visual colour on the KDS

### Channel Analytics

Every metric in the dashboard — revenue, orders, AOV, peak hours, popular items, customer acquisition — can be filtered, compared, and broken down by channel.

---

## 4. Restaurant Onboarding

Onboarding is the first interaction a restaurant has with Menukaze. The goal is signup to live orders in under 30 minutes.

### Signup

Email and password. Email verification. The user lands in the onboarding wizard immediately after verification — never in an empty dashboard.

### The Wizard

```
1. Restaurant Profile → 2. Menu → 3. Tables & QR → 4. Payment → 5. Staff → 6. Go Live
```

### Step 1 — Restaurant Profile

- Restaurant name
- Logo upload (the restaurant's branding replaces the placeholder as soon as one is uploaded)
- Physical address, with a map pin. The form adapts to the selected country — international address structures, non-Latin scripts, neighbourhood/district fields, and countries without postal codes are all supported.
- Phone number, with the international dialling code auto-selected from the country.
- Country and currency. This one choice locks in the currency symbol, decimal and thousands separators, currency placement, decimal count, tax rules, tax display format, date and time format, time zone, and the list of available payment gateways.
- Language selection for the menu and customer-facing interfaces. All world languages are supported, including non-Latin scripts (Arabic, Chinese, Japanese, Korean, Hindi, Thai, Hebrew, Cyrillic, Devanagari, Tamil, Bengali, Ge'ez, Khmer, Myanmar) and RTL layouts (Arabic, Hebrew, Urdu, Persian).
- Operating hours — same hours every day or custom per day, with break times.
- Subdomain, auto-generated from the restaurant name and editable (e.g., `joes-pizza.menukaze.com`).

### Step 2 — Menu Setup

The restaurant adds its menu directly. Two paths:

1. **Manual entry** — create a category and add items (name, price, image, modifiers).
2. **Bulk import** — upload a CSV or paste from a spreadsheet (item name, price, category).

A short explainer shows the difference between variants and modifiers with practical examples.

### Step 3 — Tables & QR Codes

The restaurant answers "Do you have dine-in tables?".

- **No** — the step ends.
- **Yes** — the restaurant enters a table count. The system auto-generates that many tables (Table 1 … Table N) with default seating. Names, capacity, and zones are editable later. A QR code preview is shown, with a note that the full set of printable QR codes is available from the dashboard.

### Step 4 — Connect Payment Gateway

The restaurant connects **Razorpay** to accept online payments — UPI, cards, wallets, netbanking, and EMI.

Connection flow: the restaurant pastes its Razorpay key ID and key secret. Inline help links to the exact page in the Razorpay dashboard where the credentials live.

Test mode is available for dummy orders before going live.

Restaurants in regions where Razorpay is not the right fit use the cash / pay-at-counter workflow until additional gateways come online. The platform is built on a pluggable adapter architecture (see §18), so new gateways are added without touching the rest of the product.

### Step 5 — Invite Staff

The restaurant invites up to 3 team members by email, selecting a role (Manager, Waiter, Kitchen, Cashier) for each. More invites are sent from the dashboard later.

### Step 6 — Go Live

The wizard summarises everything that was configured and gives the restaurant two actions:

- **Preview** — opens `{slug}.menukaze.com` in a new tab.
- **Go Live** — activates the restaurant. If a payment gateway is connected, the restaurant can accept real orders immediately. If not, the storefront is visible but checkout shows a "Coming Soon" message until a gateway is connected.

### Post-Onboarding Checklist

The dashboard shows a setup checklist that persists until every item is complete:

- Restaurant profile
- Menu
- Tables
- Payment gateway
- Menu item images
- Tax rates
- Receipt branding
- Test order
- Printable QR codes

A progress bar shows the percentage complete. Each item is a direct link to its settings page. The checklist is dismissible once the critical items (profile, menu, payment) are done.

### Test Orders

A "Place a test order" flow lets the owner order from their own storefront in test mode — the order flows through the dashboard and the KDS exactly like a real one. Test orders are labelled "TEST" and excluded from analytics.

### Super Admin Onboarding Analytics

The super admin sees the onboarding funnel: Signup → Step 1 → … → Go Live, with drop-off at every step. It also tracks average time to go live, day-one gateway connection rate, and a list of merchants who signed up but never went live.

---

## 5. Restaurant Dashboard

The dashboard is where restaurant owners and managers run the business. It is the central hub for every operational decision.

### Menu Management

- Unlimited menus (Breakfast, Lunch, Dinner, Specials, Weekend Brunch)
- Drag-and-drop reordering of categories
- Each item has: name, description, price, image, dietary tags, modifiers
- Modifiers and add-ons: sizes, extras, spice levels, toppings — each priced independently
- Combo and meal deals: bundles at a discount
- Real-time sold-out toggle — the change propagates across every channel instantly
- Scheduled menus: auto-switch by time of day or day of week
- Dietary tags: vegetarian, vegan, gluten-free, nut-free, dairy-free, soy-free, egg-free, shellfish-free, halal, kosher, Jain, sugar-free, organic, locally sourced. Restaurants create custom tags for regional needs (Buddhist vegetarian, Hindu sattvic, low-FODMAP, etc.)
- Multi-language menus: the restaurant configures the languages it serves, and every item supports translations in all of them

### Table Management

- Add, edit, and remove tables (number, seating capacity, zone — indoor, outdoor, bar, private dining)
- A unique QR code per table, encoding the restaurant ID and the table ID
- Download and print QR codes individually or in bulk, ready to place on the table
- Real-time table status: Available → Occupied → Bill Requested → Payment Done → Available, plus a "Needs Review" status for edge cases (see QR dine-in section)
- Auto-release with a configurable cooldown after payment

### Reservation Management

- Time slots, maximum party size, buffer time between bookings
- Auto-confirm or manual approval
- Confirmation email to the customer
- Dashboard view of upcoming reservations, grouped by date, with status (confirmed, cancelled, completed, no-show)
- Walk-in vs. reservation tracking for occupancy insights
- Blocked dates and time slots for private events, holidays, and maintenance
- Reservation reminders sent to the customer at a configurable interval before the booking

### Channel Management

- Live order count per channel
- Enable, disable, and configure any channel (built-in or API-based)
- Per-channel preparation time override, tax/fee rules, notification preferences, KDS colour, KDS sound
- Performance overview per channel: orders, revenue, AOV, growth

### Order Management

- Unified live order feed across all channels in one view
- Every order carries a visible channel badge
- Filter by channel, status, table, date range
- Order lifecycle: Received → Confirmed → Preparing → Ready → Served / Picked Up / Delivered → Completed
- Order detail view: items, modifiers, instructions, customer, payment, channel
- Cancel or refund with a reason
- Full searchable history with channel filtering
- For delivery orders, the restaurant updates status to "Out for Delivery" and "Delivered" from the detail view, triggering real-time customer tracking and email updates

### Walk-In / POS Order Entry

Staff with Waiter, Cashier, Manager, or Owner role create orders for walk-in customers directly from the dashboard:

- "New Walk-In Order" button on the order screen
- The same menu browsing, modifiers, and special instructions interface used across every channel
- Order type: Dine-In (with table assignment) or Takeaway
- Customer details stay anonymous unless provided
- Payment method: Cash, Card (via connected terminal or gateway), or Pay Later (for dine-in tabs). **Terminal** is a physical card reader (Stripe Terminal, Square Reader); **gateway** is the restaurant's online payment provider. Both settle through the connected gateway account.
- Takeaway orders get a token number (same system as the kiosk)
- The order goes straight to the KDS on confirmation
- Tagged as "Walk-In / POS" for reporting

### Staff Management

Staff are invited by email. The platform ships with five predefined roles plus a Custom role that the restaurant configures with granular permission toggles.

#### Predefined Roles

| Role | One-line summary |
|---|---|
| **Owner** | Full access. The account holder. Only role that can manage Menukaze billing and API keys. |
| **Manager** | Runs the restaurant. Full operational access. Cannot touch Menukaze billing, subscription, or API keys. |
| **Waiter** | Front-of-house. Assigned tables, marks orders served, sends bills, takes walk-in orders. |
| **Kitchen** | Back-of-house. KDS only. Moves orders Preparing → Ready. |
| **Cashier** | Money handling. Processes payments, issues refunds, manages bills across tables. |
| **Custom** | Restaurant-defined role built from the permission flags below. |

#### Permission Matrix

Legend: **F** = full access · **V** = view only · **A** = action-scoped (see footnotes) · **—** = no access

| Capability | Owner | Manager | Waiter | Kitchen | Cashier |
|---|---|---|---|---|---|
| **Menu** | | | | | |
| View menu | F | F | V | V | V |
| Create / edit / delete items, modifiers, combos | F | F | — | — | — |
| Mark item sold out / back in stock | F | F | A¹ | A¹ | — |
| Manage scheduled menus | F | F | — | — | — |
| **Tables** | | | | | |
| View tables | F | F | A² | — | V |
| Create / edit / delete tables | F | F | — | — | — |
| Generate and print QR codes | F | F | — | — | — |
| **Reservations** | | | | | |
| View reservations | F | F | V | — | V |
| Create / edit / cancel reservations | F | F | A³ | — | — |
| Configure reservation settings | F | F | — | — | — |
| **Orders** | | | | | |
| View live order feed | F | F | A² | A⁴ | F |
| View order detail | F | F | A² | A⁴ | F |
| Update order status | F | F | A⁵ | A⁶ | A⁷ |
| Cancel order (with reason) | F | F | — | — | F |
| Refund order (with reason) | F | F | — | — | F |
| Create walk-in / POS order | F | F | F | — | F |
| Call waiter alert (acknowledge) | F | F | F | — | — |
| **KDS** | | | | | |
| View KDS | F | F | V | F | V |
| Update item / order status on KDS | F | F | — | F | — |
| Configure stations and routing | F | F | — | — | — |
| **Channels** | | | | | |
| View channels and live counts | F | F | — | — | V |
| Enable / disable channels | F | F | — | — | — |
| Configure per-channel rules | F | F | — | — | — |
| **Payments** | | | | | |
| Connect / configure payment gateway | F | F | — | — | — |
| Configure tax, service charge, tips, rounding | F | F | — | — | — |
| Process payment at counter (cash, terminal, gateway) | F | F | A⁸ | — | F |
| **Staff** | | | | | |
| View staff list | F | F | — | — | — |
| Invite staff | F | A⁹ | — | — | — |
| Edit staff role | F | A⁹ | — | — | — |
| Remove or deactivate staff | F | A⁹ | — | — | — |
| Create / edit Custom roles | F | F | — | — | — |
| **Analytics** | | | | | |
| View revenue and order analytics | F | F | — | — | A¹⁰ |
| View per-channel analytics | F | F | — | — | — |
| View staff performance | F | F | — | — | — |
| Export reports | F | F | — | — | — |
| **Customer Data (CDP)** | | | | | |
| View customer profiles | F | F | A¹¹ | — | A¹¹ |
| Export customer data | F | F | — | — | — |
| Delete customer data (DSAR) | F | F | — | — | — |
| **Settings** | | | | | |
| Edit restaurant profile | F | F | — | — | — |
| Edit operating hours and breaks | F | F | — | — | — |
| Toggle holiday / vacation mode | F | F | — | — | — |
| Edit delivery configuration and minimum order | F | F | — | — | — |
| Edit receipt branding and email templates | F | F | — | — | — |
| Configure notifications | F | F | — | — | — |
| **API Keys & Webhooks** | | | | | |
| Generate / revoke API keys (= channels) | F | — | — | — | — |
| Configure webhooks | F | — | — | — | — |
| **Billing & Subscription (Menukaze)** | | | | | |
| View subscription and Menukaze invoices | F | — | — | — | — |
| Change plan | F | — | — | — | — |
| Update Menukaze payment method | F | — | — | — | — |
| **Audit & Security** | | | | | |
| View own activity log | F | F | F | F | F |
| View full restaurant audit log | F | F | — | — | — |
| Revoke kiosk device tokens | F | F | — | — | — |

**Footnotes:**

1. **Sold-out toggle (Waiter, Kitchen)** — front- and back-of-house staff flip the real-time availability toggle on items, but cannot edit menu content, prices, or modifiers.
2. **Assigned tables (Waiter)** — Waiters see tables they are assigned to by a Manager (or all tables if no assignment is configured) and only the orders on those tables.
3. **Reservation actions (Waiter)** — Waiters confirm walk-ins, mark reservations as seated or no-show, and cancel them on the customer's behalf. They cannot change reservation settings (slot capacity, blocked dates).
4. **KDS view (Kitchen)** — Kitchen staff see items on their station's KDS only, with no customer information or payment status.
5. **Order status (Waiter)** — Waiters mark orders as Served, Picked Up, or Delivered. They cannot move an order back to Preparing or cancel it.
6. **Order status (Kitchen)** — Kitchen moves Received → Preparing → Ready. They cannot mark Served, Cancelled, or Refunded.
7. **Order status (Cashier)** — Cashier marks orders Paid and triggers Completed. They can also Cancel or Refund (see rows above).
8. **Payment processing (Waiter)** — Waiters collect payment for their assigned tables (cash, card terminal, or gateway). Cashiers handle payment for any table or walk-in.
9. **Manager staff actions** — Managers invite, edit, and remove any staff member except the Owner. Managers cannot promote a user to Owner. There is exactly one Owner per restaurant; ownership transfer is a separate explicit flow.
10. **Cashier analytics** — Cashiers see today's payment totals (cash drawer reconciliation) but no historical analytics, channel breakdowns, or revenue trends.
11. **Customer data view (Waiter, Cashier)** — They see the customer associated with the order they are currently handling. They cannot browse the full customer database.

#### Permission Flags (for Custom Roles)

The Custom role is built by toggling individual permission flags. Each flag maps directly to a row in the matrix above. The complete flag set:

```
menu.view
menu.edit                  # create, update, delete items / modifiers / combos
menu.toggle_availability   # sold-out toggle only
menu.schedule              # scheduled menus

tables.view
tables.edit
tables.qr_print

reservations.view
reservations.edit          # create, cancel, mark seated / no-show
reservations.configure     # slots, blocked dates, settings

orders.view_all
orders.view_assigned       # only orders on assigned tables
orders.update_status
orders.cancel
orders.refund
orders.create_walkin

kds.view
kds.update                 # move status on the KDS
kds.configure              # stations, item routing

channels.view
channels.configure         # enable / disable, per-channel rules

payments.process           # collect at counter
payments.configure         # gateway, tax, tips, service charge

staff.view
staff.invite
staff.edit
staff.remove
staff.manage_custom_roles

analytics.view
analytics.view_today_only  # cashier-style daily totals
analytics.export

customers.view
customers.view_current_only
customers.export
customers.delete

settings.edit_profile
settings.edit_hours
settings.toggle_holiday
settings.edit_delivery
settings.edit_branding
settings.edit_notifications

api_keys.manage            # Owner-only by default
webhooks.manage            # Owner-only by default

billing.manage             # Owner-only — Menukaze subscription, never assignable

audit.view_self
audit.view_all
security.revoke_kiosk_token
```

Flags marked Owner-only by default cannot be granted to a Custom role. The system enforces this — there is always exactly one user with `billing.manage`, and that user is the Owner.

#### Lifecycle and Auditing

- Staff can be deactivated (login disabled, history retained) or permanently removed (login disabled, history anonymised after the configured retention period).
- Every dashboard action is recorded in a per-user audit log: order changes, menu edits, payments, refunds, settings changes, role changes, login events. Each entry includes timestamp, acting user, role at the time, IP address, and the affected resource.
- Audit log retention follows the restaurant's configured data retention policy (default 12 months).
- A staff member with `audit.view_self` sees only their own actions; `audit.view_all` is required to see the full restaurant audit log.

### Payment Configuration

The restaurant connects **Razorpay** for online payments. Cash and pay-at-counter are always available as a parallel option.

- **Accepted payment methods**: cards (credit and debit), UPI, wallets, netbanking, EMI, QR payments, cash, pay-at-counter
- **Currencies**: any of the 190+ active world currencies — the configured currency drives display, tax, and locale formatting. Online payment processing currently runs through Razorpay's supported currencies; cash settles in any currency the restaurant operates in.
- **Taxes**: fully configurable to support any tax system worldwide — GST (India, Australia, New Zealand, Singapore, Canada, Malaysia), VAT (EU, UK, and 160+ other countries), US sales tax (per state/county/city), consumption tax (Japan), ICMS/ISS (Brazil), and any other percentage-based or fixed rate. Both tax-inclusive and tax-exclusive pricing are supported. Multiple rates apply simultaneously (central + state). Display format matches local convention.
- **Service charge**: percentage-based, on or off per restaurant
- **Tips**: suggested percentages (10%, 15%, 20%) or custom amounts, enabled per restaurant
- **Rounding rules**: configurable for currencies without minor units (JPY, KRW) or those that dropped small denominations (CAD penny, AUD 1/2-cent)
- **Test mode** toggle on Razorpay
- **Cash / pay-at-counter** workflow available in every country, with or without a gateway

### Analytics Dashboard

- Revenue by day, week, month, and custom ranges — filterable by channel
- Channel breakdown (orders, revenue, AOV) as bars or pie charts
- Channel comparison side-by-side (Storefront vs. QR Dine-In vs. Kiosk)
- Channel growth trends
- Popular items — most ordered and highest revenue, per channel or overall
- Peak hours heatmap, per channel (dine-in peaks at 7 PM, online peaks at 12 PM)
- Average order value, overall and per channel
- Average table session duration
- Reservation stats: booked, completed, no-shows, cancellations
- New vs. returning customers (matched by email or phone)
- First-channel acquisition — where each customer came from
- Staff performance: orders handled, average service time

### Settings

- Restaurant profile (name, logo, description, address, phone, email)
- Operating hours per day, with break times
- Holiday mode — pauses orders and shows a custom message
- Order throttling — caps orders per hour when the kitchen is overwhelmed
- Delivery configuration — delivery zones (postcode list or radius), delivery fees, minimum order value. Menukaze tags orders as delivery or pickup and calculates fees; logistics are handled by the restaurant (in-house or its own couriers).
- Minimum order value — orders below the threshold are blocked at checkout with a clear message
- Estimated preparation time shown to customers during checkout
- Receipt branding (logo, footer text, social links)
- Notification preferences (email, dashboard, sound)

### API Key Management

The restaurant generates API keys with scoped permissions (read-only, read-write, admin). **Each key is a channel**: at creation, the restaurant names it, picks an icon, and picks a colour.

- Example: create a key → name it "Our WordPress Site" → every order through that key is tagged "Our WordPress Site"
- Example: create a key → name it "Zomato Integration" → every aggregator order is tracked separately

Keys can have expiry dates, be revoked, or be rotated. Each key's usage stats (requests, last used, total orders, revenue) are visible from the key management page, which doubles as channel-level analytics.

### Webhook Management

The restaurant subscribes to events from the dashboard or via API (see §12 for the event catalogue). Each endpoint is configured with an HTTPS URL and a list of subscribed events, and the restaurant receives a secret for HMAC-SHA256 signature verification.

Failed deliveries retry with exponential backoff: 1 min → 5 min → 30 min → 2 hr → 24 hr, then marked permanently failed. The delivery log shows every payload, response code, retry attempt, and timestamp. A "Test" button sends a synthetic event. Webhooks can be disabled and re-enabled without deletion.

---

## 6. Default Storefront

Every restaurant gets a production-ready website at `{slug}.menukaze.com`. The storefront is built on the public Storefront API — it is the same API restaurants use to build custom frontends.

The default theme is polished, responsive, and fast:

- Restaurant branding (logo, primary and secondary colours) pulled from dashboard settings
- Hero section with the restaurant name, description, and current operating hours
- Full menu browsing with categories, search, and dietary filters
- Item detail view with images, descriptions, modifiers, and add-ons
- Shopping cart with a live total
- Guest checkout — the customer enters an email. No forced account creation. A customer can create an account if they want faster checkout, saved addresses, saved payment methods, and an order history.
- Delivery or pickup selection at checkout
- Address input with automatic delivery fee calculation
- Payment through the restaurant's configured gateway
- Order confirmation with order number and estimated prep/delivery time
- Real-time order status tracking
- Reservation booking (date, time, party size, notes)
- Restaurant info page — hours, map, contact
- Mobile-first responsive design
- SEO with meta tags and Schema.org structured data, supporting rich results across Google, Bing, Yandex, Baidu, Naver
- Cookie consent banner with granular category controls (strictly necessary, performance, functional, targeting)
- WCAG 2.1 Level AA accessibility

---

## 7. QR Dine-In Ordering

The core dine-in experience. No app download — it is purely web-based.

### Flow

```
Sit down → Scan QR → Web app opens, restaurant + table identified
       │
       ▼
Customer enters name, email, and phone → Session starts (restaurant + table + timestamp)
       │
       ▼
Browse menu → Add items → Place order (Round 1)
       │
       ▼
Kitchen prepares → Waiter serves
       │
       ▼
Order again (Round 2, 3, 4 …) or Request Bill
       │
       ▼
Bill summary combines every round into one total
       │
       ▼
Customer pays from their phone → Receipt emailed
       │
       ▼
Session closes → Table returns to Available
```

### Session Start

Before the menu loads, the customer enters:

- **Name** — used to label the customer in the running order, the bill, and group ordering. Required.
- **Email** — used to send the order confirmation and the payment receipt. Required.
- **Phone number** — captured with the international dialling code auto-selected from the restaurant's country. The phone field validates against the country's phone number format and accepts every global format. Required.

The phone number is **stored on the customer profile for future use only**. The platform does not currently send any SMS, WhatsApp, voice call, or other phone-based communication. It is collected now so the data is in place when phone-based channels light up at Step 51 (SMS Operational Notifications) in the build sequence. Until then, the only outbound channel for this customer is email.

### Session Features

- Persistent sessions — closing the browser and re-scanning resumes exactly where the customer left off
- Session timeout configurable per restaurant (default 3 hours of inactivity)
- Live running order summary visible at all times, across every round
- Per-round status (Round 1: Served, Round 2: Preparing)
- Special instructions per item
- "Call Waiter" button sends a real-time alert to the assigned waiter

### Edge Cases

- **Concurrent scans on the same table**: additional scans join the existing session rather than creating a new one. Every participant sees the shared running order and adds items independently.
- **Group ordering**: within a shared session, each participant's additions are labelled by name so the group sees who ordered what. Everything rolls up into one bill.
- **Payment failure**: the customer is prompted to retry with the same or a different method. The session stays open and the bill stays visible until payment succeeds. A "Request Assistance" button alerts the waiter, who processes payment at the counter via cash or terminal. The table is not released until payment clears.
- **Session timeout with unpaid orders**: an on-screen alert fires 15 minutes before timeout. If the session closes unpaid, the order is flagged "Unpaid — Requires Attention", the manager is notified, and the table moves to "Needs Review" instead of "Available".

### QR Misuse Prevention

A QR code printed on a table is a static image. Anyone who photographs it can scan it later from anywhere, so the platform protects against remote abuse of shared QR codes silently — with no staff effort and no extra friction for legitimate diners.

**Primary control — silent geolocation verification.** When a customer scans a QR, the web app runs the following checks in order before the session starts. The customer sees nothing unless a check fails.

1. **Browser geolocation.** The web app requests location permission as the page loads. The browser returns lat/long. The server compares it to a geofence around the restaurant address from onboarding (default radius 100 m). Inside → session starts. Outside → blocked with "It looks like you're not at the restaurant — please ask your server for help."
2. **IP geolocation fallback.** If the customer denies location permission, the server falls back to IP-based geolocation. This is city-level, not table-level, but it instantly catches the worst cases (someone scanning from another country or another city). A wildly mismatched IP region blocks the session.
3. **Device fingerprint and rate limit.** The same browser or device cannot open more than a configurable number of sessions per rolling 24 hours across every table in the restaurant. Stops one attacker spawning sessions in a loop.
4. **Behavioural anomaly engine.** Velocity (orders too fast for real eating), volume (session total far above table capacity), off-hours attempts, and repeat offenders are all flagged. Suspicious orders are held in a "Suspicious" state and never reach the KDS until a manager approves them.

For 99% of real diners the experience is: scan → tap "Allow location" once → in the menu within two seconds. No PIN, no friction, no awareness anything happened.

**Hardening toggles** (off by default, enabled per restaurant from Settings → Table Security):

- **Strict mode** — geolocation is required. If the customer denies location, no session opens. The IP fallback is bypassed.
- **Tighter geofence** — drop the radius from 100 m to 50 m for restaurants in dense areas.
- **Restaurant WiFi gate** — verify the customer's IP matches the restaurant's known public WiFi IP. If they're not on the restaurant network, no session.
- **First-order delay** — the first order in a session must wait a configurable number of seconds after session start, blocking scripted abuse from racing through checkout.
- **Max active sessions per table** — cap how many sessions can be open on a single table at once (default 1, raised for very large tables that split bills).

The default mode is silent and automatic. The hardening toggles exist for restaurants that need more.

---

## 8. Self-Serve Kiosk

The same ordering system as the storefront, with a UI built for a tablet or touchscreen at the counter.

- Full-screen, no browser chrome
- Customer picks Dine-In or Takeaway
- Dine-In → system assigns a table number or generates a token number
- Browse menu → customise items → cart → checkout
- Payment at the kiosk (when a terminal is connected) or at the counter (a token number is generated)
- Order goes straight to the KDS
- Auto-reset between customers
- Idle screen shows restaurant branding with a "Tap to Start" prompt

### Kiosk Lock-Down

Kiosk mode is activated from the dashboard by a Manager or Owner. A **4-digit PIN** configured in settings is required to exit kiosk mode, access settings, or pause the kiosk. The browser is locked to full-screen, and the PIN must be entered to exit.

Five wrong PIN entries lock the kiosk and email the owner. The kiosk is tied to the restaurant via a long-lived device token; revoking the token from the dashboard immediately logs the kiosk out.

### Token Numbers

Cash and pay-at-counter orders generate an **order token number** shown on screen (Order #47). The KDS shows the same token alongside the order so the kitchen calls it out when ready. Tokens reset daily and increment sequentially.

### Accessibility

- Large-text mode via the device's OS accessibility settings — the UI reflows correctly at every font size
- Strong colour contrast at all screen brightness levels
- 44 × 44 px minimum tap target on every interactive element
- High-contrast mode, enabled from dashboard settings

---

## 9. Kitchen Display System

The KDS is a dedicated view within the dashboard, designed for a screen in the kitchen.

- Real-time order feed over WebSocket
- **Colour-coded by channel** — each channel has its own colour for instant recognition (Green = QR Dine-In, Blue = Storefront, Orange = Kiosk, Grey = Walk-In, plus custom colours per API-based channel)
- Every order card shows items, modifiers, instructions, table number (dine-in), the channel badge, and an elapsed-time timer
- Tap a card to move status: Received → Preparing → Ready
- The timer transitions from normal → yellow → red as the order ages
- Sound alert on every new order, configurable per channel
- Filter the feed by channel
- Completed orders archive per shift, searchable from the full order history

### Multi-Station KDS

Restaurants with separate stations (grill, fry, salads, drinks, bar) run multiple KDS screens simultaneously:

- Each screen is configured as a **station** in the dashboard
- Menu categories and items are assigned to one or more stations
- When an order arrives, each station sees only its items — no clutter
- Items marked Ready on a station update their individual status
- The overall order is Ready only when every item on every station is Ready
- While stations are still working, the waiter view shows "Partially Ready" with a breakdown of which stations are done and which aren't

---

## 10. Storefront API

The Storefront API is the backbone of the platform. Every customer-facing experience — default storefront, QR dine-in, kiosk, and every custom integration — runs on it.

### Authentication and Channel Identification

- Authentication: `X-Menukaze-Key: mk_live_xxxx` header
- **The key identifies the channel** — every order placed through a key is tagged with that key's channel automatically
- Rate limits are enforced per key and scaled by plan
- Live keys are prefixed `mk_live_`, test keys `mk_test_`
- Built-in channels (Storefront, QR, Kiosk) use internal **system keys** that restaurants don't manage

### API Domains

| Domain | Endpoints |
|---|---|
| Restaurant | Profile, hours, settings |
| Menu | Menus, categories, items, modifiers, search, dietary filters |
| Cart | Create, add, update, remove, get |
| Order | Place, get status, history, filter by channel |
| Table Session | Start via QR token, add orders, get session, request bill |
| Payment | Create intent, confirm, get status |
| Reservation | Available slots, create, cancel |
| Customer | Register, login, profile, order history |
| Channel | List channels, channel stats, channel orders |

### Order Payload

```json
POST /v1/orders
{
  "items": [...],
  "customer": { "email": "john@example.com", "phone": "+1234567890" },
  "type": "delivery"
}

Response:
{
  "id": "ord_456",
  "channel": { "id": "ch_partner_site", "name": "Our WordPress Site", "type": "api" },
  "items": [...],
  "status": "received"
}
```

The channel is derived from the API key — it is never passed explicitly.

### System Keys vs. Restaurant Keys

- **System keys** — internal, invisible to restaurants, used by the built-in channels. Issued and rotated automatically by the platform.
- **Restaurant keys** — created and managed by the restaurant from API Key Management. Named as channels. Revocable and rotatable at any time.

Both use the same `X-Menukaze-Key` header and the same channel-tagging logic.

### Rate Limits

Enforced per key per minute:

| Plan | Requests/min |
|---|---|
| Starter | 60 |
| Growth | 300 |
| Enterprise | 1,000 |
| System | Unlimited |

Exceeding the limit returns `429 Too Many Requests` with a `Retry-After` header.

### Error Envelope

```json
{
  "error": {
    "code": "order_items_empty",
    "message": "The order must contain at least one item.",
    "status": 422
  }
}
```

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `invalid_request` | Malformed body or missing fields |
| 401 | `unauthenticated` | Missing or invalid API key |
| 403 | `forbidden` | Key lacks permission for the operation |
| 404 | `not_found` | Resource does not exist |
| 409 | `idempotency_conflict` | Same idempotency key, different body |
| 422 | `order_items_empty` | Order has no items |
| 422 | `item_unavailable` | Item is sold out |
| 422 | `restaurant_closed` | Outside operating hours |
| 422 | `below_minimum_order` | Total below minimum order amount |
| 422 | `delivery_zone_not_covered` | Address outside delivery zones |
| 429 | `rate_limit_exceeded` | Too many requests — see `Retry-After` |
| 500 | `internal_error` | Safe to retry with exponential backoff |
| 503 | `service_unavailable` | Maintenance — see `Retry-After` |

### CORS

Browser-based integrations are allowed through a per-key origin allowlist configured in the dashboard. Server-to-server requests (no `Origin` header) bypass CORS. System keys have no CORS restrictions.

### Sandbox

Every account has an isolated sandbox:

- Base URL: `https://sandbox-api.menukaze.com/v1/`
- Test keys prefixed `mk_test_`
- Gateways run in test mode — no real money moves
- Sandbox data is completely isolated from live data and analytics
- Every endpoint, error code, webhook event, and rate limit behaves identically to live

### Other Features

- Cursor-based pagination on list endpoints (`after`, `before`, default 20, max 100). Responses include `next_cursor` and `has_more`.
- Filter and sort on every list endpoint. Order endpoints accept `?channel=` for channel filtering.
- Idempotency keys on every write to prevent duplicate orders
- API versioning via URL path (`/v1/`, `/v2/`)
- Auto-generated OpenAPI and Swagger docs
- JavaScript and Python SDKs

---

## 11. Webhooks

> **External-integration feature.** Webhooks exist purely for systems outside Menukaze. Every built-in component (storefront, QR dine-in, kiosk, dashboard, KDS) talks to the API or WebSocket layer directly and never needs webhooks. This section is the design that engineering implements at Step 33 in the build sequence (§20), once the public API and channel keys exist.

Real-time event delivery for restaurants and integrations.

### Delivery Flow

```
Event occurs → Webhook service picks it up → Finds active subscriptions
       │
       ▼
POST to each endpoint with:
  - JSON payload (event type + full resource)
  - X-Menukaze-Signature (HMAC-SHA256 using the webhook secret)
  - X-Menukaze-Webhook-Id (unique delivery ID for deduplication)
  - X-Menukaze-Timestamp (replay attack protection)
       │
       ▼
Expect 2xx within 30 seconds → Otherwise retry
Retry schedule: 1 min → 5 min → 30 min → 2 hr → 24 hr → permanent fail
```

### Event Catalogue

| Category | Events |
|---|---|
| Order | `order.created`, `order.confirmed`, `order.preparing`, `order.ready`, `order.completed`, `order.cancelled` — all payloads include the channel |
| Payment | `payment.initiated`, `payment.completed`, `payment.failed`, `payment.refunded` |
| Menu | `menu.updated`, `item.created`, `item.updated`, `item.deleted`, `item.sold_out`, `item.back_in_stock` |
| Table | `table.created`, `table.deleted`, `table_session.started`, `table_session.bill_requested`, `table_session.closed` |
| Reservation | `reservation.created`, `reservation.confirmed`, `reservation.cancelled`, `reservation.no_show` |
| Channel | `channel.created`, `channel.updated`, `channel.disabled`, `channel.enabled` |
| Staff | `staff.invited`, `staff.removed`, `staff.role_changed` |
| Restaurant | `restaurant.updated`, `restaurant.hours_changed`, `restaurant.paused`, `restaurant.resumed` |

### Payload Structure

```json
{
  "id": "evt_abc123",
  "type": "order.created",
  "created_at": "2026-03-17T14:30:00Z",
  "restaurant_id": "rst_xyz789",
  "api_version": "v1",
  "data": {
    "id": "ord_456",
    "channel": { "id": "ch_qr_dinein", "name": "QR Dine-In", "type": "built_in" },
    "table_id": "tbl_12",
    "items": [...],
    "total": 4500,
    "currency": "usd",
    "status": "received"
  }
}
```

`currency` is always an ISO 4217 code set from the restaurant's country (`eur`, `inr`, `brl`, `ngn`, `jpy`, `kes`, …).

### Security

- Unique webhook secret per endpoint, used to sign the payload with HMAC-SHA256
- Timestamp header for replay attack prevention — reject anything older than 5 minutes
- IP allowlisting to restrict delivery to known addresses

### Dashboard Features

- Active subscription list
- 30-day delivery history with status codes, response bodies, and latency
- One-click replay of failed deliveries
- Disable and re-enable any webhook without deleting it
- Test button sends a synthetic event

---

## 12. Notifications

| Event | Restaurant Staff | Customer |
|---|---|---|
| New order (any channel) | Dashboard + sound + email, with channel badge | Order confirmation email |
| New QR dine-in order | KDS + waiter alert | On-screen confirmation |
| Order status change | Dashboard update | Real-time tracking page |
| Order ready | Waiter alert (dine-in) | Email (online) |
| Bill requested | Waiter + cashier alert | Bill summary on screen |
| Payment received | Dashboard + email | Emailed receipt |
| Reservation confirmed | Dashboard + email | Confirmation email |
| Reservation cancelled | Dashboard + email | Cancellation email |
| Daily summary | End-of-day email to owner/manager | — |
| Monthly platform invoice | Email to owner | — |
| Item sold out | Dashboard alert | Menu updates live |
| Staff login from new device | Owner/manager alert | — |

---

## 13. Email and Receipts

### Transactional Emails to Customers

Every email is sent in the restaurant's primary language with full Unicode support (non-Latin scripts, RTL, mixed direction). Templates adapt to the restaurant's locale — date/time formats, currency symbols, and number formatting follow country settings.

- Order confirmation — order number, itemised list, estimated time
- Order ready / out for delivery
- Payment receipt — items, modifiers, subtotal, tax, service charge, tip, total, payment method
- Reservation confirmation — date, time, party size, special requests
- Reservation cancellation
- Reservation reminder — at a configurable interval before the booking

### Receipt Contents

- Restaurant name, logo, address, contact
- Tax registration number (GSTIN, VAT number, ABN, TIN, CNPJ, RFC, or any other national format)
- Order number, date, time — locale-formatted
- Itemised list with quantities, modifiers, and prices — in the configured currency with correct symbol placement, decimal separator, and thousands separator
- Breakdown: subtotal, tax (labelled per the local system), service charge, tip, total
- Payment method details (last 4 digits, wallet name, mobile money number, UPI ID, PIX key, bank reference — whichever applies)
- QR code linking to feedback and reorder
- Compliance with local tax and invoicing law — GST (India, Australia, Singapore, Canada, NZ, Malaysia), VAT (EU, UK, Switzerland, Turkey, UAE, Saudi Arabia, and 160+ other jurisdictions), US sales tax, Japanese consumption tax, and every other configured tax system
- E-invoicing mandates supported where applicable: India GST, EU EN 16931, Mexico CFDI, Brazil NF-e, Saudi Arabia ZATCA, Turkey e-Fatura
- PDF attachment included

### Restaurant-Level Template Customisation

Restaurants customise every customer-facing transactional email from the dashboard:

- Branding — logo, header colour, custom footer (social links, website, tagline)
- Custom sender name ("Joe's Pizza" instead of Menukaze). The sending domain stays Menukaze-managed unless the restaurant is on Enterprise, which unlocks a custom SPF/DKIM-authenticated domain.
- Custom intro text on the order confirmation ("Thank you for choosing Joe's Pizza — we're preparing your order with love!")
- Live preview in the dashboard before saving
- The super admin sets platform-level defaults used when a restaurant hasn't customised its own

### Emails to the Restaurant

- New order alert
- Daily summary report
- Monthly platform invoice
- Staff invitations
- Payment gateway connection confirmation

---

## 14. Super Admin Panel

The dashboard for running Menukaze as a business.

### Merchant Management

- Full merchant list with search and filter (name, status, plan, region, signup date, order volume, onboarding status)
- Merchant detail view: profile, plan, billing, onboarding progress, order volume, revenue, feature usage, support history
- Activate, deactivate, suspend any merchant
- **Impersonation** — view a merchant's dashboard exactly as they see it. Sessions are time-limited to 2 hours, labelled with a persistent banner ("You are impersonating [Restaurant Name]"), and every action is logged in the platform audit log attributed to the super admin user.

### Onboarding Analytics

- Full funnel: Signup → Step 1 → … → Go Live, with per-step drop-off
- Average time from signup to first live order
- Day-one / 7-day / never-completed percentages
- Day-one gateway connection rate
- Worst drop-off step (the thing to fix next)
- List of merchants stuck in onboarding — signed up but never went live

### Flexible Billing Engine

Every billing amount is in the platform owner's configured base currency. The "$" examples below are illustrative.

**Global default pricing** applied to every new merchant:
- Monthly subscription
- Commission percentage per order
- Flat fee per order
- Any combination

**Per-merchant overrides** for custom deals:
- "Restaurant X pays $199/month flat, 0% commission"
- "Restaurant Y pays $0/month, 3% commission"
- "Restaurant Z gets 60 days free, then $49/month + 1.5% commission"

**Plan tiers** defined by the platform owner. Each plan includes name, monthly price, commission rate, feature set, order limits, and API rate limits. Plans can be created, edited, or retired any time. Typical tiers: Starter ($29/mo, 2.5% commission, core features), Growth ($79/mo, 1.5%, all features), Enterprise (custom).

**Billing cycle**: monthly, auto-charge or invoice.
**Free trial**: configurable per plan or per merchant.
**Promo codes**: percentage or flat discount, with expiry.

### Commission Collection

- **Razorpay**: monthly invoice. The platform calculates commission at the end of the cycle and charges the restaurant's subscription payment method on file.
- **Cash / manual orders**: invoice-based, calculated at month-end.

When future gateways come online, real-time split-payment models (e.g., Stripe Connect) will replace invoicing where the gateway supports it. The super admin picks the collection method per gateway in Platform Settings.

### Trial End Behaviour

When a free trial expires:

- **Payment method on file** → auto-upgrade to the configured paid plan and charge at the next cycle.
- **No payment method** → email reminders 7, 3, and 1 days before end. On expiry, ordering is disabled and the storefront shows "Coming Soon" until a method is added. Dashboard access is retained.

All trial data — menu, orders, customers, settings — carries through.

### Dunning

Failed subscription charges retry:

1. Day 3
2. Day 8 (5 days after attempt 1)
3. Day 15 (7 days after attempt 2)

If every retry fails, ordering is suspended and an email with a payment update link is sent. Dashboard access is retained. Service resumes immediately on successful charge.

### Revenue & Financial Dashboard

- MRR
- Platform GMV (total order value across every restaurant)
- Commission revenue
- Subscription revenue
- Top earners
- Churn (cancellations, downgrades)
- Failed payment alerts
- Payout history across every connected gateway

### Platform Health

- Active merchants
- Orders today / this week / this month, platform-wide
- API uptime and average response time
- Error rate
- Active table sessions
- New signups over time

### Feature Flags

Toggle features globally or per merchant — for beta testing, gradual rollouts, or restricting features to higher plans. Example flags: "Kiosk mode only for Growth+", "Beta: multi-language menus for selected merchants".

### Platform Settings

- Supported payment gateways (enable/disable globally — new gateways plug in through the adapter architecture)
- Supported currencies (190+ active world currencies, selectively enabled)
- Supported countries for registration (every country enabled by default)
- Default email templates (restaurants override them per-restaurant)
- Platform branding (logo and colours for the super admin interface)
- Terms of service and privacy policy links, configurable per region
- Onboarding flow customisation
- Default locale settings (date/time, number format, first day of week)

### Audit & Security

- Platform-wide audit log of every super admin action
- Suspicious activity alerts (unusual order volumes, failed payment spikes)
- Data export for compliance and reporting

---

## 15. Customer Data Platform

Every order — online, QR, kiosk, API, or walk-in — feeds a unified customer database. Data from every channel is merged into single profiles.

### Unified Profiles

```
Customer places an online order → Profile created
       │
       ▼
Same customer scans a QR code at dine-in (enters the same email)
       │
       ▼
Profiles merged → One profile with online + dine-in history
       │
       ▼
Over time → A rich behavioural profile builds automatically
```

### Data Per Customer

- **Identity**: name, email, phone
- **Order history**: every order, full item detail, across every channel
- **Spending**: lifetime spend, average order value, highest single order
- **Visit frequency**: how often they order, last order date, days since last visit
- **Favourite items**: most ordered, preferred categories, typical modifiers
- **Channel preference**: primary ordering source
- **Time patterns**: typical day and time
- **Reservations**: frequency, party size, no-show rate
- **Feedback**: star ratings and comments
- **Delivery addresses** (from online orders)
- **Device/browser** signals for storefront optimisation

### Collection Touchpoints

| Channel | Data Captured |
|---|---|
| Menukaze Storefront | Email, name, delivery address, items, amount, payment method, timestamp |
| QR Dine-In | Name, email, phone (stored for future use), items per round, table, session duration, total |
| Self-Serve Kiosk | Email or phone, items, amount, dine-in vs. takeaway |
| Walk-In / POS | Staff-entered name and phone, items, amount |
| Custom API channel | Whatever the integration collects (minimum: email or phone for matching) |
| Reservation | Name, email, phone, party size, date/time, special requests |
| Feedback | Star rating, comment, linked to the order and its channel |

### Channel Attribution

Every profile tracks:

- **First channel** — how the customer discovered the restaurant ("Acquired via QR Dine-In")
- **Most used channel** — where they order most ("Primary: QR Dine-In")
- **All channels used** — full cross-channel view
- **Migration** — how behaviour has shifted ("Started on Storefront → now mostly QR Dine-In")

### Profile Management

- **Merging**: same email across channels merges profiles automatically. Phone is a secondary merge key where email is absent.
- **De-duplication**: email first, phone second — catches cases where the same customer used different emails but the same phone.
- **Consent**: customers opt in to marketing at checkout through an unchecked-by-default checkbox (GDPR-aligned).
- **Retention**: configurable per restaurant (example default: anonymise inactive profiles after 2 years).

---

## 16. Compliance

Menukaze is built for compliance at the infrastructure level so individual restaurants benefit automatically. The same platform serves restaurants in every country, with region-specific controls surfaced where they're needed.

### Data Protection and Privacy

Compliant with every major global data protection and privacy framework:

- **GDPR** (EU/EEA) — consent-based collection, access, rectification, erasure, portability, objection; data minimisation; documented lawful basis; DPIAs for high-risk processing
- **UK GDPR / Data Protection Act 2018** (UK) — mirrors EU GDPR with ICO guidelines
- **CCPA / CPRA** (California) — right to know, delete, opt out of sale/sharing, non-discrimination; "Do Not Sell or Share" link
- **LGPD** (Brazil) — consent, data subject rights, DPO where required
- **POPIA** (South Africa) — eight lawful processing conditions, prior authorisation for direct marketing
- **PDPA** (Singapore, Thailand) — consent, purpose limitation, access/correction, retention limits, Do Not Call
- **DPDP Act 2023** (India) — consent-based processing, right to access and erase, Consent Manager framework
- **PIPEDA** (Canada) — ten fair information principles
- **APPs** (Australia) — thirteen Australian Privacy Principles under the Privacy Act 1988
- **APPI** (Japan) — data subject rights, cross-border transfer restrictions
- **PIPA** (South Korea) — consent, minimisation, breach notification

### Cross-Border Data Transfer

- Standard Contractual Clauses (SCCs) for EU/EEA transfers to non-adequate countries
- Data residency selection during onboarding, with hosting regions that satisfy local data localisation mandates
- Transfer Impact Assessments documented where GDPR Chapter V requires them

### Marketing and Communication

- **CAN-SPAM** (US) — unsubscribe mechanism, valid physical address, accurate headers and subject lines; opt-outs honoured within 10 business days
- **PECR** (UK) — prior consent before marketing email, soft opt-in for existing customer relationships
- **ePrivacy Directive** (EU) — cookie consent and electronic marketing
- **CASL** (Canada) — express or implied consent before commercial messages, sender identification, functioning unsubscribe
- **Spam Act 2003** (Australia) — accurate sender info, functional unsubscribe, consent before sending
- Frequency caps configurable per restaurant and enforced globally

### Cookie Consent

A cookie consent banner on every customer-facing page, with granular category controls (strictly necessary, performance, functional, targeting). Consent records stored with timestamps for audit.

### Payment and Financial Compliance

- **PCI DSS**: Menukaze never stores, processes, or transmits raw cardholder data. All card data is delegated to PCI DSS certified gateway providers. Menukaze maintains SAQ-A compliance.
- **RBI Guidelines** (India) — recurring payments and tokenisation norms enforced through Razorpay
- **UPI Regulations** (India) — NPCI guidelines enforced through Razorpay

As additional gateways come online, the equivalent regional financial regulations will be inherited from each provider — PSD2/SCA in the EU, PIX in Brazil, mobile money rules in Africa, PBOC/PCAC in China, and ASEAN payment regulations through MAS, Bank Indonesia, BSP, and Bank of Thailand.

### Tax and Invoicing

The tax engine is fully configurable and supports every tax system worldwide. Rather than hardcoding rules, the platform provides a flexible framework restaurants configure for their jurisdiction.

- **GST** — India, Australia, New Zealand, Singapore, Canada, Malaysia
- **VAT** — EU, UK, Switzerland, Norway, Turkey, South Africa, UAE, Saudi Arabia, and 160+ other VAT jurisdictions
- **US Sales Tax** — per state, county, and city; multi-jurisdiction support
- **Consumption Tax** — Japan (standard and reduced rates, dine-in vs. takeaway)
- **ICMS / ISS** — Brazil (state-level ICMS, municipal ISS)
- **Impuesto al Consumo** — Colombia
- **Custom** — any number of rates with custom names, percentages, and application rules (inclusive/exclusive, per-item/per-order, percentage/flat) for any country

Service charges are labelled clearly in jurisdictions where they must be voluntary (India's CCPA guidelines and equivalents). E-invoicing mandates supported: India GST e-invoicing, EU EN 16931, Mexico CFDI, Brazil NF-e, Saudi Arabia ZATCA, Turkey e-Fatura.

### Food Safety and Allergen Disclosure

- **EU FIC Regulation 1169/2011** — 14 major allergens tagged on every item
- **FDA Menu Labeling Rule** (US) — calorie and nutritional disclosure for chains with 20+ locations
- **FSSAI** (India) — licence number on storefront and receipts, vegetarian/non-vegetarian labelling
- **Natasha's Law** (UK) — full ingredient listing and allergen labelling for PPDS items
- **ANVISA** (Brazil) — mandatory allergen declarations and nutritional labelling
- **FSANZ** (Australia, New Zealand) — allergen labelling and food safety standards
- **Japan Food Labeling Act** — 8 specified and 20 recommended allergens
- **Custom regulatory fields** — restaurants configure any locally required field (licence numbers, inspection grades, halal/kosher certification references)

Dietary tags supported globally: vegetarian, vegan, gluten-free, nut-free, dairy-free, soy-free, egg-free, shellfish-free, halal, kosher, Jain, sugar-free, organic, locally sourced, with custom tags for regional needs. Tags display across every channel — storefront, QR, kiosk, API.

### Accessibility

- **WCAG 2.1 Level AA** — the foundation, met across the default storefront, QR dine-in, and kiosk. Proper contrast, keyboard navigation, screen reader compatibility, alt text, focus indicators, semantic HTML.
- **ADA** (US), **EAA** (EU), **EN 301 549** (EU), **Accessible Canada Act** (Canada), **Disability Discrimination Act 1992** (Australia), **RPwD Act 2016** (India), **JIS X 8341-3** (Japan) — all satisfied through WCAG compliance.

### Consumer Protection

Transparent pricing, honest descriptions, clear refund policies, no dark patterns. Aligned with:

- **Consumer Rights Directive** (EU)
- **Consumer Protection Act 2019** (India)
- **Australian Consumer Law**
- **FTC Act Section 5** (US)
- **Consumer Protection Act** (South Africa)
- **Consumer Contracts Regulations** (UK)
- **Código de Defesa do Consumidor** (Brazil)
- **Consumer Protection (Fair Trading) Act** (Singapore)
- **Consumer Contract Act** (Japan)

### Age Verification

For restaurants serving alcohol, tobacco, or other age-restricted items, an age verification gate runs per item or per category. The restaurant configures it for the local legal age (21 US, 18 most of EU/UK/India/Australia/Brazil, 19 South Korea / parts of Canada, 20 Japan/New Zealand). Verification methods: self-declaration checkbox, date-of-birth entry, third-party age verification integration.

Restricted items are blocked from the cart before verification. Item-level and category-level restrictions enforce local law. The restaurant disables online alcohol ordering in jurisdictions where it's prohibited.

### Data Retention and Deletion

- Configurable retention per restaurant (anonymise inactive profiles after 2 years, purge transaction logs beyond the legally required period)
- Automated purge jobs on schedule
- Customer data export (JSON or CSV) and permanent deletion requests processed from the dashboard
- Consent status visible per customer on the restaurant dashboard
- Every marketing message includes a functional opt-out
- Data Processing Agreement (DPA) available for restaurants that need one

### Breach Notification

Affected restaurants and customers are notified within the timeframes mandated by applicable regulations: 72 hours under GDPR, without unreasonable delay under CCPA, as soon as reasonably possible under POPIA.

---

## 17. Customer Experience

### Accounts

Guest checkout is always available. Customers create an account to unlock full order history, saved delivery addresses, saved payment methods, faster checkout, and an "Order Again" one-tap reorder from past orders. Reservation history lives in the account.

### Feedback

A feedback prompt is shown after delivery completes or a dine-in session ends. Star rating 1–5 with a text comment. Feedback is visible to the restaurant in its dashboard (not public). Aggregate ratings show in the analytics view.

### Estimated Time

The restaurant sets a base preparation time in settings. The system adjusts the estimate dynamically based on current order volume. The estimate is shown at checkout and on the order tracking page.

---

## 18. Technical Architecture

### Multi-Tenancy

- Single shared database with strict tenant isolation — every row is scoped by `restaurant_id`
- Row-level security enforced at the database layer
- Tenant-aware caching
- Subdomain routing: `{slug}.menukaze.com`
- **Custom domain support**: restaurants map their own domain by adding a CNAME to `custom.menukaze.com`. Menukaze provisions and renews a TLS certificate via Let's Encrypt. Both `www` and apex (A-record / ALIAS) work. SSL provisioning completes within minutes of DNS detection.

### Real-Time Communication

WebSocket powers:

- KDS live order feed
- Waiter notifications
- Table session updates
- Customer-facing order tracking

Every connection is authenticated by identity and role. Server-Sent Events fall back in environments without WebSocket support.

### Payment Gateway Architecture

Every gateway implements the same interface, so new gateways plug in without touching the core:

```
PaymentGatewayInterface
├── createPaymentIntent(amount, currency, metadata)
├── confirmPayment(intentId)
├── refund(paymentId, amount)
├── getPaymentStatus(paymentId)
├── getSupportedMethods()
├── getSupportedCurrencies()
└── handleWebhook(payload, signature)

Current implementations:
├── RazorpayAdapter      (UPI, cards, wallets, netbanking, EMI)
└── CashAdapter          (universal manual tracking)
```

Additional adapters (Stripe, PayPal, Adyen, Mercado Pago, Paystack, Flutterwave, M-Pesa, Mollie, PayU, Square, Alipay, WeChat Pay, and more) are added later through the same interface.

### Scalability

- Stateless API servers that scale horizontally
- Database read replicas for analytics and reporting
- Redis for sessions, caching (menus, settings), rate limiting, and pub/sub
- A message queue handles order processing, webhook delivery, email sending, and receipt generation
- CDN for menu images, static assets, and storefront delivery
- Indexing strategy: composite `(restaurant_id, created_at)` indexes on every major table

### Offline Resilience

- **KDS**: caches the current order queue. If the WebSocket drops, previously received orders stay visible and status updates queue for sync. A visible Offline indicator warns staff that new orders may not be arriving.
- **Kiosk**: caches the full menu. Browsing and selection keep working offline. Order submission queues and retries on reconnect. If the outage passes a configurable threshold (default 5 min), the kiosk shows "Temporarily Unavailable — Please Order at Counter".
- **QR Dine-In**: caches the menu and session. Browsing works offline. Submission queues with a "Waiting for connection…" indicator.
- **Dashboard**: degrades gracefully — cached data remains visible with staleness indicators, writes queue or block with clear errors.

### Security

- TLS 1.2+ enforced everywhere
- JWT authentication with refresh token rotation
- RBAC at the API level
- API key scoping (read-only, read-write)
- Webhook signatures via HMAC-SHA256
- Rate limiting per key and per IP
- Input validation and sanitisation on every endpoint
- Parameterised queries and ORM usage against SQL injection
- Output encoding against XSS
- CSRF protection on dashboard endpoints
- SAQ-A PCI DSS compliance — card data is delegated entirely to certified gateways
- AES-256 encryption at rest, TLS 1.2+ in transit
- Tamper-evident audit logs on every sensitive operation
- Breach notification procedures aligned with every applicable jurisdiction
- Penetration testing and vulnerability assessments on a regular schedule
- Dependency vulnerability scanning in CI/CD
- Secure SDLC practices across engineering

---

## 19. Revenue Model

Every amount in this section is in the platform owner's base currency. The "$" is illustrative — the super admin sets the real billing currency.

### Pricing Models

The super admin configures any combination of:

| Model | Description |
|---|---|
| Monthly subscription | Fixed monthly fee per restaurant |
| Per-order commission | Percentage of each order's total |
| Flat fee per order | Fixed amount per order (e.g., $0.30) |
| Hybrid | Subscription + commission (e.g., $49/month + 1.5%) |
| Custom deal | Unique arrangement for a specific restaurant |
| Free trial | Configurable trial before billing |

Every model is configurable globally (default for new restaurants) and overridable per restaurant for custom deals.

### Commission Collection

- **Razorpay** → monthly invoice. Commission is calculated at month-end and charged to the restaurant's subscription payment method on file.
- **Cash / manual orders** → invoice-based, calculated at month-end.

When future gateways come online, real-time split-payment models (e.g., Stripe Connect) will replace invoicing where the gateway supports it.

### Trial End Behaviour

- **Payment method on file** → auto-upgrade to the configured paid plan, charged at the next cycle.
- **No payment method** → reminders at 7, 3, and 1 days before end. On expiry, ordering is disabled and the storefront shows "Coming Soon" until a method is added. Dashboard access is retained.

Trial data — menu, orders, customers, settings — carries through.

### Dunning

Failed subscription charges retry on a 3/5/7-day cadence:

1. Day 3 — first retry
2. Day 8 — second retry
3. Day 15 — third retry

If every retry fails, ordering is suspended and an email with a payment update link is sent. Dashboard access is retained. Service resumes immediately on a successful charge.

---

## 20. Build Sequence

Menukaze is built step by step. Each step is a vertical slice — small enough to implement in a single session, large enough to verify end-to-end before moving to the next. There are no phases; the goal is the complete product, built one verifiable step at a time.

Total: **54 steps**, grouped into nine tracks for navigation. The build order runs straight through the numbers — start at Step 1 and work down.

---

### MVP Scope

The first block of steps forms the MVP — the smallest complete product a real restaurant can use in production. After finishing the MVP, a restaurant can sign up, complete onboarding in under 30 minutes, configure its menu and tables, accept QR dine-in orders with multi-round ordering, take payment via Razorpay test mode, and run its kitchen on the KDS — all live at `theirslug.menukaze.com`.

**In the MVP:** Steps 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 21, 22, 23.

**Explicitly deferred to post-MVP:**

- Super admin panel — direct DB access until built
- Webhooks — no external consumers exist yet
- Public Storefront API + SDKs — internal apps talk to the DB directly
- Self-serve Kiosk
- Multi-station KDS
- Reservations
- Walk-In / POS order entry
- Customer Data Platform (auto-merging across channels)
- Custom roles + permission flag UI
- Email template customisation
- Audit log UI
- Billing engine + dunning (manual billing for now)
- Custom domains
- Multi-language / RTL
- Thermal printer integration
- SMS / push notifications
- Consent banner / DSAR / cookie controls (privacy policy as a static page only)
- Advanced analytics — only today's revenue and order count in the MVP
- QR misuse prevention (geofence layer) — defer
- Customer feedback
- Order throttling, holiday-mode message customisation, complex delivery zones
- CSV menu import
- Bulk QR code PDF download (download individual codes only)

Every deferred feature is fully specified earlier in this doc and ships later in the sequence.

---

### Steps

The 54 steps in build order, grouped into nine tracks for navigation. Each step has a concrete verification test at the end.

### Track 1 — Foundation

**Step 1 — Bootstrap.** Monorepo, database, BetterAuth, signup, login, email verification. Test: sign up, verify email, log in.

**Step 2 — Multi-tenant scaffolding.** `restaurant_id` on every table, row-level scoping middleware in tRPC and Hono, subdomain routing. Test: create two restaurants, confirm one cannot read the other's data.

### Track 2 — Onboarding

**Step 3 — Onboarding Step 1: Restaurant Profile.** Form for name, logo, address, country, currency, language, hours, subdomain. Country selection drives currency, locale, and tax defaults. Test: complete the profile, see it in the DB and on the dashboard header.

**Step 4 — Onboarding Step 2: Menu Setup.** Manual entry (categories, items, modifiers) and CSV bulk import. Test: add a category and three items manually, then import a 20-row CSV.

**Step 5 — Onboarding Step 3: Tables and QR Codes.** Enter table count → auto-generate tables → render printable QR codes. Test: enter 10 tables, download all 10 QR codes as a single PDF.

**Step 6 — Onboarding Step 4: Razorpay Connection.** Paste key ID and key secret, verify against Razorpay test mode, store encrypted. Test: paste valid test keys, see "Connected" state.

**Step 7 — Onboarding Step 5: Staff Invites.** Email invite with role assignment, invitee accepts and signs in. Test: invite a Waiter to a personal email, accept, log in.

**Step 8 — Onboarding Step 6: Go Live and Post-Onboarding Checklist.** Summary screen, "Go Live" button, persistent checklist on the dashboard. Test: complete onboarding, land on the dashboard with the checklist visible.

### Track 3 — Customer-Facing Storefront

**Step 9 — Default Storefront (read-only).** Server-rendered storefront at `{slug}.menukaze.com` showing branding, hours, and the menu. Test: visit the subdomain, browse categories and items.

**Step 10 — Cart and Guest Checkout.** Add-to-cart, running total, guest checkout collecting name and email, Razorpay payment in test mode. Test: place a test order end-to-end, see it confirmed.

**Step 11 — Order Confirmation and Tracking Page.** Order confirmation page, real-time tracking page powered by Ably. Test: place an order, watch the status update live as you change it from the dashboard.

**Step 12 — Email Confirmations and Receipts.** React Email templates for order confirmation and receipt, sent via Resend. Test: place an order, receive both emails with the right branding.

### Track 4 — Dashboard Operations

**Step 13 — Order Management Dashboard.** Live order feed with status updates, detail drawer, cancel/refund. Test: place an order from the storefront, see it appear in the dashboard.

**Step 14 — Single-Station KDS.** Real-time KDS view, tap-to-update status, sound alerts on new orders. Test: open KDS in one tab, place an order from the storefront, hear the alert and tap through statuses.

**Step 15 — Menu Management Dashboard.** Full CRUD on categories, items, modifiers, combos; sold-out toggle; image upload; scheduled menus. Test: edit an item, see the change propagate to the storefront live.

**Step 16 — Table Management Dashboard.** CRUD on tables, regenerate QR codes, table status view. Test: add a new table, download its QR.

**Step 17 — Settings.** Restaurant profile, hours, holiday mode, delivery zones and minimum order, throttling, receipt branding, notification preferences. Test: toggle holiday mode, see the storefront block checkout.

**Step 18 — Staff Management and RBAC.** Predefined roles, invite/remove staff, full permission matrix and flag system from §5. Test: invite a Waiter, log in as them, confirm scoped access matches the matrix.

**Step 19 — Walk-In / POS Order Entry.** "New Walk-In Order" flow for staff: pick items, type, payment, send to KDS. Test: as Cashier, create a walk-in cash order, see it in the KDS.

### Track 5 — QR Dine-In, Reservations, Kiosk

**Step 20 — QR Dine-In Session Start.** Scan handler, name/email/phone form (phone stored for future use only), session creation tied to (restaurant, table, timestamp). Test: scan a table QR, enter details, land in the menu.

**Step 21 — QR Dine-In Multi-Round Ordering.** Place rounds, see per-round status, running summary across rounds, "Call Waiter" alert. Test: place two rounds in one session, confirm both appear separately and the waiter alert reaches the dashboard.

**Step 22 — QR Dine-In Bill and Payment.** Request bill, itemized review, in-app payment, receipt email, table release. Test: complete a full session end to end.

**Step 23 — QR Dine-In Edge Cases.** Concurrent scans (join existing session), group ordering with per-name labels, payment failure retry, session timeout with unpaid alert, "Needs Review" status. Test: scan from two devices, confirm one shared session.

**Step 24 — QR Misuse Prevention.** Browser geolocation against the restaurant geofence, IP fallback, device fingerprint rate limit, anomaly engine, hardening toggles in settings. Test: simulate an out-of-geofence scan, see the block message.

**Step 25 — Reservations.** Storefront booking flow, dashboard reservation list, auto-confirm or manual approval, reminder emails, blocked dates and slots. Test: book on the storefront, see it appear in the dashboard, receive the reminder.

**Step 26 — Multi-Station KDS.** Station configuration, item routing, partial-ready handling, waiter consolidated view. Test: assign categories to two stations, place an order touching both, watch each station only see its items.

**Step 27 — Self-Serve Kiosk Mode.** Full-screen UI, PIN-locked exit, dine-in/takeaway selection, token numbers, auto-reset between customers, accessibility. Test: enter kiosk mode from the dashboard, place an order, confirm token printed and KDS received it.

### Track 6 — Public API, Channels, and Webhooks

**Step 28 — Public Storefront API.** Hono routes for restaurant, menu, cart, order, table session, payment, reservation, customer endpoints. Versioned at `/v1/`. Test: place an order through `curl` with a system test key.

**Step 29 — API Key Management = Channels.** Restaurant-generated keys with channel name, icon, colour. Per-key permission scopes (read-only / read-write / admin). Test: create a key, name it "Test App", place an order with it, see the channel badge in the dashboard.

**Step 30 — Channel System End to End.** Channel filtering on orders, KDS colour coding per channel, per-channel analytics, per-channel preparation time and tax overrides. Test: place orders from two different channels, filter by each in the dashboard.

**Step 31 — Rate Limiting, Idempotency, Errors, CORS.** Per-key rate limits, idempotency keys on writes, the standard error envelope, per-key CORS allowlist. Test: hit the rate limit and see 429; replay an idempotent write and see the same response.

**Step 32 — Sandbox Environment.** Isolated `sandbox-api.menukaze.com`, test keys, gateway test mode, fully isolated data. Test: place an order in sandbox, confirm it does not appear in live analytics.

**Step 33 — Webhook System.** Event dispatcher, HMAC-SHA256 signing, retry policy with exponential backoff, delivery log, dashboard subscription management, test button, full event catalogue from §11. Test: subscribe a `requestbin` endpoint to `order.created`, place an order, see the signed payload arrive.

**Step 34 — JavaScript and Python SDKs.** Idiomatic SDKs over the public API. Test: install each, run the README example end to end.

### Track 7 — Customer Data, Analytics, Compliance

**Step 35 — Customer Data Platform.** Auto-create profiles from every channel, dedupe by email then phone, channel attribution (first / most-used / all), profile detail view. Test: place orders with the same email from storefront and QR, confirm one merged profile.

**Step 36 — Customer Feedback System.** Post-order star rating and comment, dashboard review of feedback, aggregated rating in analytics. Test: complete an order, submit feedback, see it in the dashboard.

**Step 37 — Analytics Dashboard.** Revenue, popular items, peak hours, AOV, channel breakdown and comparison, staff performance, customer acquisition by channel. Test: place 10 test orders across channels, confirm every chart populates correctly.

**Step 38 — Consent Management and Cookie Banner.** Granular cookie categories, opt-in tracking, consent records with timestamps for audit. Test: visit the storefront, accept only "strictly necessary", confirm no analytics scripts load.

**Step 39 — Data Retention and DSAR.** Configurable retention per restaurant, customer data export and deletion processed from the dashboard. Test: request a data export, receive a JSON file with the customer's full history.

**Step 40 — Audit Logging.** Per-user log of every dashboard action, viewable from staff management, retention tied to data retention policy. Test: edit a menu item, see the entry appear in the audit log with timestamp, user, and IP.

### Track 8 — Super Admin

**Step 41 — Super Admin Merchant Management.** Merchant list with filters, detail view, activate/deactivate/suspend, time-limited impersonation with banner and audit log entries. Test: as super admin, search for a restaurant, impersonate, leave the impersonation, confirm audit entry.

**Step 42 — Flexible Billing Engine.** Plans with subscription + commission + flat fee, per-merchant overrides, promo codes, free trials, plan tier configuration. Test: create a plan, assign to a test restaurant, see the configured pricing reflected on their billing page.

**Step 43 — Commission Collection (Razorpay Invoice Flow).** Month-end commission calculation across orders, invoice generation, charge against the restaurant's subscription payment method. Test: simulate a month of orders, run the month-end job, see an invoice generated.

**Step 44 — Trial End and Dunning.** Trial expiry handling for both payment-on-file and no-payment-on-file paths, retry schedule (day 3 / 8 / 15), suspension with retained dashboard access. Test: simulate a failed charge, watch the retries fire, confirm suspension after the third failure.

**Step 45 — Onboarding Analytics.** Funnel view across every onboarding step, drop-off rates, time-to-live distribution, list of stuck merchants. Test: run a few onboarding flows with various drop-off points, confirm the funnel reflects them.

**Step 46 — Platform Health.** Live metrics for active merchants, daily/weekly/monthly orders, API uptime and latency, error rate, active table sessions, signup velocity. Test: open the super admin dashboard, confirm all metrics populate from real platform data.

**Step 47 — Feature Flags.** Global and per-merchant flag toggles, restriction by plan tier. Test: toggle a flag off for one merchant, confirm the feature disappears for them only.

### Track 9 — Globalisation and Hardware

**Step 48 — Global Payment Gateway Expansion.** Add adapters for Stripe (with Stripe Connect for split payments), PayPal, Mercado Pago, Paystack, Flutterwave, M-Pesa, Mollie, PayU, Square, Adyen, Alipay, WeChat Pay through the existing adapter interface. Test: connect each new gateway in test mode, place a test order through it.

**Step 49 — Multi-Language Menu Support.** Per-item translations, language switcher on storefront and QR, RTL layout support, full Unicode in receipts. Test: add Arabic translations to a menu, switch the storefront, confirm full RTL rendering and PDF receipts.

**Step 50 — Custom Domain Support.** CNAME setup, automatic TLS provisioning via Let's Encrypt, both `www` and apex configurations. Test: point a real domain at the platform, confirm TLS auto-provisions within minutes.

**Step 51 — SMS Operational Notifications.** Phone numbers collected earlier (Steps 3, 20) become active for outbound order confirmations, status updates, and reservation reminders, sent through Twilio or regional equivalents. Test: place an order, receive the SMS confirmation.

**Step 52 — Restaurant Email Template Customisation.** Per-restaurant branding, custom sender name, custom message text, real-time preview. Test: customise a confirmation template, place an order, receive the customised email.

**Step 53 — Thermal Printer Integration.** Cloud-driven kitchen ticket printing, per-station printer routing, printer status monitoring. Test: pair a printer, place an order, see the ticket print automatically.

**Step 54 — PWA Push Notifications.** Service worker, push subscription, real-time order status pushes to the customer in the browser. Test: opt in on the storefront, place an order, receive push notifications as status changes.

### How to Use This Sequence

- Build one step at a time. Do not start the next step until the current one is verified.
- Each step is small enough to be implemented in a single AI session.
- Each step has a concrete test that takes under two minutes for a human to run.
- Steps inside a Track can occasionally be reordered, but cross-Track dependencies must be respected (e.g., Step 28 needs Steps 9–14 complete because the public API mirrors what the dashboard already exposes).
- After every step: type-check, lint, build, and run the manual test before marking it done.
- If a step exposes a missing assumption, stop and update the relevant module section in this doc before continuing.

### Milestone Checkpoints

After certain steps, run an end-to-end check to confirm everything integrates. Each takes under five minutes.

| Checkpoint | After Steps | Test |
|---|---|---|
| **C1** — First end-to-end order | 10 + 13 | Place an order on the storefront → it appears in the dashboard order list with full detail |
| **C2** — Live KDS flow | 11 + 14 | Place an order → watch it appear on the KDS → tap through statuses → confirm the customer tracking page updates live |
| **C3** — Complete QR dine-in session | 22 + 14 | Scan a table QR → place two rounds → request bill → pay → table releases automatically |
| **C4** — Walk-in + KDS | 19 + 14 | Create a walk-in cash order → it appears in the KDS with the Walk-In/POS channel badge |
| **C5** — Channel attribution | 28 + 30 | Place orders from public API and storefront → confirm channel badges and per-channel analytics |
| **C6** — CDP merging | 35 + 37 | Place orders across channels with the same email → confirm one merged profile and correct analytics |
| **C7** — Webhook delivery | 28 + 33 | Subscribe a test endpoint to `order.created` → place an API order → confirm signed payload arrives within seconds |
| **C8** — Super admin live | 41 + 42 + 46 | Super admin sees the test merchant's onboarding state, billing, and health metrics in real time |
| **C9** — Reservation round-trip | 25 + 17 | Book a reservation on the storefront → see it in the dashboard → reminder email arrives at the configured interval |
| **C10** — Compliance gates | 38 + 39 + 40 | Cookie consent flow → opt out → confirm no analytics fire; export customer data → confirm correct JSON; audit log shows every operator action |

---

## 21. Glossary

| Term | Definition |
|---|---|
| Channel | The source of an order (Storefront, QR Dine-In, Kiosk, Walk-In/POS, custom API integration). Every order is tagged with exactly one channel. |
| Restaurant | A tenant on the Menukaze platform. Also called a merchant in billing contexts. |
| Storefront | A restaurant's customer-facing website, served at its branded subdomain. |
| Table Session | A dine-in session that begins when a customer scans a QR code and ends when payment completes. |
| Round | A single order placed within a dine-in session. A session contains one or more rounds. |
| KDS | Kitchen Display System — the real-time order view for kitchen staff. |
| Station | A section of the kitchen (Grill, Cold, Bar) with its own KDS screen and its own subset of menu items. |
| Storefront API | The public REST API that powers every customer-facing experience on the platform. |
| Webhook | An HTTP callback fired on an event (new order, payment, etc.) to a registered URL. |
| Super Admin | The Menukaze platform owner's administrative dashboard. |
| RBAC | Role-Based Access Control — staff capabilities determined by assigned role. |
| GMV | Gross Merchandise Value — total value of all orders across the platform. |
| MRR | Monthly Recurring Revenue — total subscription revenue per month. |
| CDP | Customer Data Platform — unified customer profiles merged from every channel. |
| CLV | Customer Lifetime Value — total revenue from a customer over their lifetime. |
| Churn | The percentage of customers who stop ordering over a given period. |
| Terminal | A physical card reader (Stripe Terminal, Square Reader) connected to a device. |
| Gateway | A digital payment provider (currently Razorpay; more later) processing online payments. |

---

*Menukaze — every restaurant deserves a digital upgrade.*
