import type { Metadata } from 'next';
import { resolveTenantOrNotFound } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  try {
    const restaurant = await resolveTenantOrNotFound();
    return {
      title: `Terms of Service · ${restaurant.name}`,
      description: `The terms that apply when you order from ${restaurant.name} online.`,
      robots: { index: true, follow: true },
    };
  } catch {
    return { title: 'Terms of Service' };
  }
}

export default async function TermsPage() {
  const restaurant = await resolveTenantOrNotFound();
  const contactEmail = restaurant.email;
  const updatedAt = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <article className="prose prose-sm dark:prose-invert max-w-none space-y-6">
        <header className="space-y-1">
          <h1 className="text-3xl font-bold">Terms of Service</h1>
          <p className="text-muted-foreground text-sm">
            {restaurant.name} · Last updated {updatedAt}
          </p>
        </header>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">1. Agreement</h2>
          <p>
            These terms govern your use of the {restaurant.name} ordering site, including placing
            orders, scanning a table QR code, making reservations, and using the kiosk. By placing
            an order or starting a dine-in session, you agree to these terms.
          </p>
          <p>
            The site is operated by {restaurant.name} on the Menukaze platform. {restaurant.name} is
            the merchant of record and the seller of the food and beverages you order.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">2. Eligibility</h2>
          <p>
            You must be at least 18 years old, or the age of majority in your jurisdiction, to place
            an order or hold a payment method. You confirm that any information you provide is
            accurate.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">3. Orders and pricing</h2>
          <ul className="list-disc pl-5">
            <li>
              Prices, taxes, and any service charge are shown at checkout in the configured local
              currency. Tax is calculated according to the rules configured by the restaurant.
            </li>
            <li>
              An order is accepted only when you receive an order confirmation. We may decline or
              cancel an order at our discretion (e.g. an item is unavailable, the kitchen is at
              capacity, suspected fraud, or outside operating hours).
            </li>
            <li>
              Estimated preparation and delivery times are estimates only and are not guaranteed.
            </li>
            <li>
              Allergen and dietary information is provided in good faith. If you have a serious
              allergy or intolerance, please confirm directly with the restaurant before ordering.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">4. Payment</h2>
          <p>
            Payment is taken at the time you place the order, except for in-restaurant dine-in
            sessions where payment is taken when you request the bill or at the counter. Online
            payments are processed by Razorpay. We do not store your full card details.
          </p>
          <p>
            If a payment is declined or reversed, the order may be cancelled or held until you
            settle it.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">5. Cancellations and refunds</h2>
          <ul className="list-disc pl-5">
            <li>
              Once an order has entered preparation, it usually cannot be cancelled. Contact the
              restaurant immediately if you need to cancel.
            </li>
            <li>
              Refunds for items missing, incorrect, or of unsatisfactory quality are issued at the
              restaurant&apos;s discretion in line with consumer protection law.
            </li>
            <li>
              Refunds are returned to the original payment method and may take 5 to 10 business days
              to appear, depending on your bank.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">6. Delivery and pickup</h2>
          <p>
            Where delivery is offered, deliveries are limited to the configured delivery zones and
            times. We may refuse delivery to addresses outside our coverage area. Pickup orders must
            be collected during operating hours; uncollected orders may be discarded after a
            reasonable period without refund.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">7. QR dine-in</h2>
          <p>
            Scanning a table QR code starts a dine-in session tied to that table. Each session is
            subject to security checks (geolocation, device limits, behavioural anomaly detection)
            to prevent off-site abuse of shared QR codes. Orders placed during the session are
            charged to the bill associated with that table.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">8. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul className="list-disc pl-5">
            <li>Place fraudulent or speculative orders.</li>
            <li>Interfere with the operation of the site, the kiosk, or the kitchen display.</li>
            <li>
              Attempt to circumvent the security controls on shared QR codes (e.g. spoofing
              location) or to access tables you are not seated at.
            </li>
            <li>Use the site to harass restaurant staff or other customers.</li>
            <li>Scrape, reverse-engineer, or republish the menu, prices, or images.</li>
          </ul>
          <p>
            We may suspend or block your access if you breach these terms, without prior notice
            where the breach is serious.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">9. Intellectual property</h2>
          <p>
            All branding, menus, photography, and content on this site belong to {restaurant.name}{' '}
            or its licensors. The Menukaze platform itself, including the underlying software, is
            owned by Menukaze. You may not copy, modify, or redistribute any of it without written
            permission.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">10. Disclaimers and limitation of liability</h2>
          <p>
            The site is provided &quot;as is&quot;. To the maximum extent permitted by law, we
            disclaim all warranties (express or implied) and we are not liable for indirect,
            consequential, or incidental losses (e.g. loss of profit, lost opportunity). Nothing in
            these terms limits liability for death, personal injury caused by negligence, fraud, or
            any other liability that cannot be excluded by law.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">11. Governing law</h2>
          <p>
            These terms are governed by the laws of the jurisdiction in which the restaurant is
            registered ({restaurant.addressStructured.country}). Any dispute is subject to the
            exclusive jurisdiction of the courts of that country, without prejudice to any mandatory
            consumer rights you have under your local law.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">12. Changes</h2>
          <p>
            We may update these terms from time to time. The version in effect at the time you place
            an order is the version that applies to that order. Material changes will be highlighted
            on this page with an updated &quot;Last updated&quot; date.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">13. Contact</h2>
          <p>
            Questions about these terms? Contact us
            {contactEmail ? (
              <>
                {' '}
                at{' '}
                <a href={`mailto:${contactEmail}`} className="underline">
                  {contactEmail}
                </a>
              </>
            ) : (
              ' through the restaurant directly'
            )}
            .
          </p>
        </section>
      </article>
    </main>
  );
}
