import type { Metadata } from 'next';
import { resolveTenantOrNotFound } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  try {
    const restaurant = await resolveTenantOrNotFound();
    return {
      title: `Privacy Policy · ${restaurant.name}`,
      description: `How ${restaurant.name} handles your personal data when you order online.`,
      robots: { index: true, follow: true },
    };
  } catch {
    return { title: 'Privacy Policy' };
  }
}

export default async function PrivacyPage() {
  const restaurant = await resolveTenantOrNotFound();
  const contactEmail = restaurant.email;
  const address = [
    restaurant.addressStructured.line1,
    restaurant.addressStructured.line2,
    [
      restaurant.addressStructured.city,
      restaurant.addressStructured.state,
      restaurant.addressStructured.postalCode,
    ]
      .filter(Boolean)
      .join(' '),
    restaurant.addressStructured.country,
  ]
    .filter(Boolean)
    .join(', ');

  const updatedAt = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <article className="prose prose-sm dark:prose-invert max-w-none space-y-6">
        <header className="space-y-1">
          <h1 className="text-3xl font-bold">Privacy Policy</h1>
          <p className="text-muted-foreground text-sm">
            {restaurant.name} · Last updated {updatedAt}
          </p>
        </header>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">1. Who we are</h2>
          <p>
            {restaurant.name} (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates the
            ordering experience at this site. We act as the data controller for personal data you
            provide when placing an order or making a reservation.
          </p>
          {address ? (
            <p>
              <strong>Registered address:</strong> {address}
            </p>
          ) : null}
          {contactEmail ? (
            <p>
              <strong>Contact:</strong>{' '}
              <a href={`mailto:${contactEmail}`} className="underline">
                {contactEmail}
              </a>
            </p>
          ) : null}
          <p>
            Our ordering platform is provided by <strong>Menukaze</strong>, who acts as a data
            processor on our behalf and processes the data described below strictly under our
            instructions.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">2. What we collect</h2>
          <ul className="list-disc pl-5">
            <li>
              <strong>Order details</strong> — items, modifiers, special instructions, totals,
              channel (storefront, QR dine-in, kiosk).
            </li>
            <li>
              <strong>Contact details</strong> — name, email, and phone number you provide at
              checkout or when starting a dine-in session.
            </li>
            <li>
              <strong>Delivery address</strong> — only for delivery orders.
            </li>
            <li>
              <strong>Payment metadata</strong> — payment method, transaction reference, and the
              last four digits of the card. We do not store full card numbers, CVV, UPI PIN, or
              netbanking credentials. Card and UPI details are handled by Razorpay (PCI DSS Level
              1).
            </li>
            <li>
              <strong>Technical data</strong> — IP address, browser type, device identifier,
              approximate location, and timestamps. Used for security, fraud prevention, and to keep
              the service running.
            </li>
            <li>
              <strong>QR dine-in location</strong> — when you scan a table QR, we may verify your
              browser geolocation against the restaurant&apos;s geofence to prevent off-site abuse
              of shared QR codes. Coordinates are not stored after the check.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">3. Why we collect it</h2>
          <ul className="list-disc pl-5">
            <li>To process and fulfil your order or reservation.</li>
            <li>To send you order confirmation, status updates, and a receipt by email.</li>
            <li>To accept payment and issue refunds where applicable.</li>
            <li>To meet our legal obligations (tax, accounting, statutory record keeping).</li>
            <li>To detect and prevent fraud, abuse, and security incidents.</li>
            <li>To improve the menu, service quality, and ordering experience.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">4. Legal basis (where applicable)</h2>
          <p>
            Where the GDPR or a similar regime applies, we rely on the following bases: contract
            performance (to fulfil your order), legal obligation (tax and accounting), legitimate
            interest (fraud prevention, service improvement), and consent (for non-essential cookies
            and any optional marketing).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">5. Who we share it with</h2>
          <ul className="list-disc pl-5">
            <li>
              <strong>Menukaze</strong> — our platform processor for hosting, order routing, KDS,
              and email delivery.
            </li>
            <li>
              <strong>Razorpay</strong> — our payment processor. Their privacy policy governs how
              they handle card and UPI data.
            </li>
            <li>
              <strong>Resend</strong> — used to send confirmation and receipt emails on our behalf.
            </li>
            <li>
              <strong>Government and regulatory bodies</strong> — where required by law (tax filing,
              court order, statutory request).
            </li>
          </ul>
          <p>We do not sell your personal data.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">6. International transfers</h2>
          <p>
            Our processors may operate servers outside your country. Where required, transfers are
            covered by appropriate safeguards (e.g. EU Standard Contractual Clauses).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">7. How long we keep it</h2>
          <p>
            Order, payment, and receipt records are retained for the period required by tax and
            accounting law in our jurisdiction (typically 5 to 8 years). Other personal data is
            retained for up to 12 months after your last order, after which we anonymise or delete
            it. Cookie data is retained per the duration disclosed in the cookie consent banner.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">8. Your rights</h2>
          <p>Subject to applicable law, you have the right to:</p>
          <ul className="list-disc pl-5">
            <li>Access the personal data we hold about you.</li>
            <li>Request correction of inaccurate data.</li>
            <li>Request deletion of your data (subject to legal retention requirements).</li>
            <li>Request a portable export of your data.</li>
            <li>Object to or restrict certain processing.</li>
            <li>Withdraw consent for non-essential cookies at any time.</li>
            <li>
              Lodge a complaint with your local data protection authority if you believe your rights
              have been infringed.
            </li>
          </ul>
          <p>
            To exercise any of these rights, contact us
            {contactEmail ? (
              <>
                {' '}
                at{' '}
                <a href={`mailto:${contactEmail}`} className="underline">
                  {contactEmail}
                </a>
              </>
            ) : (
              ' using the details above'
            )}
            . We respond within 30 days.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">9. Cookies</h2>
          <p>
            We use a small number of strictly necessary cookies to keep your cart and session
            working. Non-essential cookies (analytics, functional preferences, advertising) are only
            set if you accept them in the cookie consent banner. You can change your preferences any
            time using the &quot;Cookie preferences&quot; link in the footer.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">10. Children</h2>
          <p>
            This service is not directed at children under 16. We do not knowingly collect personal
            data from children. If you believe a child has provided us with data, please contact us
            so we can remove it.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">11. Changes to this policy</h2>
          <p>
            We may update this policy from time to time. Material changes will be highlighted on
            this page with an updated &quot;Last updated&quot; date.
          </p>
        </section>
      </article>
    </main>
  );
}
