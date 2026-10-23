CREATE TABLE "payment_webhook_event" (
    "gateway" VARCHAR(32) NOT NULL,
    "event_id" VARCHAR(255) NOT NULL,
    "paymentid" INTEGER NOT NULL,
    "gateway_ref" VARCHAR(255) NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_webhook_event_pkey" PRIMARY KEY ("gateway", "event_id")
);

CREATE INDEX "idx_payment_webhook_payment" ON "payment_webhook_event"("paymentid");
ALTER TABLE "payment_webhook_event" ADD CONSTRAINT "payment_webhook_event_paymentid_fkey"
    FOREIGN KEY ("paymentid") REFERENCES "payment"("paymentid") ON DELETE CASCADE ON UPDATE CASCADE;
