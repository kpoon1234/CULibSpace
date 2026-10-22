'use client';

import { useState } from 'react';

type VisitorType = 'THAI' | 'FOREIGN';

const inputClassName =
  'mt-1.5 w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-500 focus:border-rose-500 focus:ring-2 focus:ring-rose-200';

const labelClassName = 'text-sm font-medium text-gray-700';

export default function VisitorTicketPage() {
  const [visitorType, setVisitorType] = useState<VisitorType>('THAI');
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);

    // TODO: เชื่อมต่อ API สำหรับสร้างคำสั่งซื้อและเริ่มชำระเงิน
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="mb-8 max-w-2xl">
        <p className="mb-2 text-sm font-semibold text-rose-600">VISITOR TICKETS</p>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Purchase a library ticket
        </h1>
        <p className="mt-3 text-base leading-7 text-gray-600">
          Enter your visitor details and choose when you would like your ticket to be valid. You can
          review the price before continuing to payment.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-hairline bg-white p-5 shadow-sm sm:p-8"
        >
          <fieldset>
            <legend className="text-lg font-semibold text-gray-900">Visitor details</legend>
            <p className="mt-1 text-sm text-gray-600">
              Use the details shown on your identification document.
            </p>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label className={labelClassName}>
                First name
                <input
                  className={inputClassName}
                  name="firstName"
                  autoComplete="given-name"
                  placeholder="As shown on your ID"
                  required
                />
              </label>

              <label className={labelClassName}>
                Last name
                <input
                  className={inputClassName}
                  name="lastName"
                  autoComplete="family-name"
                  placeholder="As shown on your ID"
                  required
                />
              </label>

              <label className={labelClassName}>
                Email address
                <input
                  className={inputClassName}
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                />
              </label>

              <label className={labelClassName}>
                Phone number
                <input
                  className={inputClassName}
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="For purchase updates"
                  required
                />
              </label>

              <label className={`${labelClassName} sm:col-span-2`}>
                Visitor type
                <select
                  className={inputClassName}
                  name="visitorType"
                  value={visitorType}
                  onChange={(event) => setVisitorType(event.target.value as VisitorType)}
                >
                  <option value="THAI">Thai visitor</option>
                  <option value="FOREIGN">Foreign visitor</option>
                </select>
              </label>

              <label className={`${labelClassName} sm:col-span-2`}>
                {visitorType === 'THAI' ? 'Citizen ID number' : 'Passport number'}
                <input
                  className={inputClassName}
                  name={visitorType === 'THAI' ? 'citizenId' : 'passportId'}
                  autoComplete="off"
                  placeholder={
                    visitorType === 'THAI'
                      ? 'Enter your 13-digit citizen ID'
                      : 'Enter your passport number'
                  }
                  required
                />
                <span className="mt-1.5 block text-xs font-normal text-gray-500">
                  Your identification details are used to associate the ticket with its visitor.
                </span>
              </label>
            </div>
          </fieldset>

          <div className="my-7 border-t border-hairline" />

          <fieldset>
            <legend className="text-lg font-semibold text-gray-900">Ticket validity</legend>
            <p className="mt-1 text-sm text-gray-600">
              Choose the date and duration for this ticket.
            </p>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label className={labelClassName}>
                Start date
                <input
                  className={inputClassName}
                  name="startDate"
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  required
                />
              </label>

              <label className={labelClassName}>
                Ticket duration
                <select className={inputClassName} name="duration" defaultValue="1" required>
                  <option value="1">1 day</option>
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                </select>
              </label>
            </div>
          </fieldset>

          <label className="mt-6 flex items-start gap-3 text-sm leading-6 text-gray-600">
            <input
              className="mt-1 h-4 w-4 rounded border-gray-300 accent-rose-600 focus:ring-rose-500"
              type="checkbox"
              name="terms"
              required
            />
            <span>
              I confirm that the information above is accurate and agree to the library visitor
              ticket terms.
            </span>
          </label>

          {submitted && (
            <p
              role="status"
              className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              Your details are ready for review. Online payment will be available after the purchase
              and payment services are connected.
            </p>
          )}

          <button
            className="mt-6 w-full rounded-md bg-cta-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-cta-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta-primary focus-visible:ring-offset-2 sm:w-auto"
            type="submit"
          >
            Review purchase
          </button>
        </form>

        <aside
          aria-labelledby="summary-heading"
          className="h-fit rounded-xl border border-hairline bg-white p-5 shadow-sm sm:p-6"
        >
          <h2 id="summary-heading" className="text-lg font-semibold text-gray-900">
            Purchase summary
          </h2>

          <div className="mt-5 flex items-start justify-between gap-4 border-b border-hairline pb-4">
            <div>
              <p className="font-medium text-gray-900">Visitor ticket</p>
              <p className="mt-1 text-sm text-gray-600">Library facility access</p>
            </div>
            <span className="text-sm font-medium text-gray-700">To be confirmed</span>
          </div>

          <div className="flex justify-between gap-4 py-4 text-sm">
            <span className="text-gray-600">Total</span>
            <span className="font-semibold text-gray-900">Confirmed before payment</span>
          </div>

          <p className="rounded-md bg-gray-50 p-3 text-xs leading-5 text-gray-600">
            The ticket price and final validity period will be shown for your confirmation before
            any payment is collected.
          </p>
        </aside>
      </div>
    </section>
  );
}
