-- [US6-1] Payment gateway integration for visitor ticket purchase.
--
-- Schema ชุดนี้ทำ "migration กลาง" ตามที่ตกลงกับทีม US6-2 / US6-3:
--   1. ตาราง `payment` ผูกกับ `ticket` เก็บยอดเงินเป็นหน่วยสตางค์ (1 THB = 100 satang)
--      พร้อมสกุลเงิน, สถานะการชำระเงิน, gateway reference และ idempotency key
--   2. `system_config` เพิ่มราคาตั๋วและอายุใช้งานตั๋ว เพื่อให้ Backend เป็นผู้กำหนดเอง
--      (client ส่งราคาหรือช่วงเวลามาใช้ไม่ได้)
--
-- หมายเหตุ: `uid` ถูก denormalize มาไว้บน `payment` เพื่อให้ query "รายการชำระเงินของฉัน"
-- ไม่ต้อง join ผ่าน `ticket` (สอดคล้องกับรูปแบบเดียวกับ booking / issue_report)

-- CreateEnum
CREATE TYPE "payment_status_enum" AS ENUM ('Pending', 'Paid', 'Failed', 'Expired', 'Refunded');

-- CreateTable
CREATE TABLE "payment" (
    "paymentid" SERIAL NOT NULL,
    "ticketid" INTEGER NOT NULL,
    "uid" INTEGER NOT NULL,
    "amount_satang" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'THB',
    "status" "payment_status_enum" NOT NULL DEFAULT 'Pending',
    "gateway" VARCHAR(32) NOT NULL,
    "gateway_ref" VARCHAR(255),
    "idempotency_key" VARCHAR(64) NOT NULL,
    "checkout_url" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("paymentid")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_idempotency_key_key" ON "payment"("idempotency_key");

-- CreateIndex
CREATE INDEX "idx_payment_user_status" ON "payment"("uid", "status");

-- CreateIndex
CREATE INDEX "idx_payment_expiry" ON "payment"("status", "expires_at");

-- CreateIndex
CREATE INDEX "idx_payment_gateway_ref" ON "payment"("gateway_ref");

-- AlterTable
ALTER TABLE "system_config"
ADD COLUMN "ticket_price_satang" INTEGER NOT NULL DEFAULT 5000,
ADD COLUMN "ticket_validity_hours" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN "payment_checkout_expiry_minutes" INTEGER NOT NULL DEFAULT 30;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_ticketid_fkey" FOREIGN KEY ("ticketid") REFERENCES "ticket"("ticketid") ON DELETE CASCADE ON UPDATE CASCADE;
