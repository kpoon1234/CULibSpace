-- [US6-1] Payment gateway integration for visitor ticket purchase.
--
-- Schema ชุดนี้ทำ "migration กลาง" ตามที่ตกลงกับทีม US6-2 / US6-3:
--   1. ตาราง `payment` ผูกกับ `ticket` เก็บยอดเงินเป็นหน่วยสตางค์ (1 THB = 100 satang)
--      พร้อมสกุลเงิน, สถานะการชำระเงิน, gateway reference และ idempotency key
--   2. `system_config` เพิ่มราคาตั๋วและอายุใช้งานตั๋ว เพื่อให้ Backend เป็นผู้กำหนดเอง
--      (client ส่งราคาหรือช่วงเวลามาใช้ไม่ได้)
--
-- หมายเหตุเรื่องกันรายการซ้ำ:
--   - `client_key` คือ key ที่ client ส่งมา (สูงสุด 64 ตัว) เก็บเป็นคู่ (uid, client_key)
--     ด้วย UNIQUE constraint ตัวตั้งกันรายการซ้ำอยู่ที่ระดับฐานข้อมูล ไม่พึ่งการเช็คในโค้ดอย่างเดียว
--     (ป้องกันกรณี request ซ้ำที่ทำพร้อมกันจนเช็คในแอปพลิเคชันไม่ทัน)
--   - `idempotency_key` คือ key เต็มที่ผูก uid + client_key แล้ว ส่งต่อให้ gateway เพื่อกู้รายการเดิม
--     ในกรณีที่ gateway สร้าง checkout สำเร็จแต่ response มาไม่ถึง (timeout)
--   - `ticket_validity_hours` เป็น snapshot ค่าอายุตั๋วตอนซื้อ เพื่อไม่ให้ config ที่แก้ระหว่าง
--     ที่ผู้ใช้กำลังกรอกข้อมูลในหน้า checkout เปลี่ยนอายุตั๋วของผู้ใช้
--
-- หมายเหตุ: `uid` ถูก denormalize มาไว้บน `payment` เพื่อให้ query "รายการชำระเงินของฉัน"
-- ไม่ต้อง join ผ่าน `ticket` (สอดคล้องกับรูปแบบเดียวกับ booking / issue_report)

-- CreateEnum
CREATE TYPE "payment_status_enum" AS ENUM ('Pending', 'Unconfirmed', 'Paid', 'Failed', 'Expired', 'Refunded');

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
    "client_key" VARCHAR(64) NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "checkout_url" TEXT,
    "checkout_payload" TEXT,
    "ticket_validity_hours" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "open_uid" INTEGER,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("paymentid")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_payment_user_client_key" ON "payment"("uid", "client_key");

-- CreateIndex
-- ช่อง "รายการที่เปิดอยู่" ของผู้ใช้ -> บังคับว่าผู้ใช้มีรายการที่ยังเปิดอยู่ได้แค่รายการเดียว
-- (NULL ไม่ชนกันใน unique index จึงปล่อยให้มีรายการที่ปิดแล้วได้หลายรายการ)
CREATE UNIQUE INDEX "payment_open_uid_key" ON "payment"("open_uid");

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
