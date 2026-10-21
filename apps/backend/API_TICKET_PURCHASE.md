# US6-1: Payment Gateway Integration — Ticket Purchase API

> สถานะ: Backend พร้อมใช้งาน (test mode) · ต้องรอทีม Frontend + US6-2/US6-3 ยืนยัน
> Gateway: **Stripe (test mode)** · สกุลเงิน: **THB**

---

## 1. ข้อสรุปราคาและอายุใช้งานตั๋ว (Step 1)

| หัวข้อ                 | ค่า                                             | ที่มา / หมายเหตุ                                                                      |
| ---------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| Gateway                | **Stripe Checkout Sessions** (test mode)        | รองรับ THB, มี idempotency key ระดับ request, มี hosted checkout page + webhook       |
| **ราคาตั๋ว**           | **50.00 THB** (5,000 satang)                    | `SystemConfig.ticketPriceSatang` — Backend อ่านจาก config เท่านั้น client ส่งมาไม่ได้ |
| **อายุใช้งานตั๋ว**     | **2 ชั่วโมง** นับจากเวลาที่ชำระเงินสำเร็จ       | `SystemConfig.ticketValidityHours`                                                    |
| อายุ Checkout Session  | 30 นาที                                         | `SystemConfig.paymentCheckoutExpiryMinutes` — Stripe บังคับขั้นต่ำ 30 นาที            |
| หน่วยเงินที่เก็บใน DB  | **สตางค์ (satang)** — จำนวนเต็ม                 | 1 THB = 100 satang เลี่ยง floating point                                              |
| ตั๋วเริ่มใช้งานเมื่อไร | เมื่อได้รับ **webhook ยืนยันการชำระเงินสำเร็จ** | ไม่เปิดใช้ตั๋วก่อนยืนยันผล                                                            |

**หมายเหตุสำคัญ:** ช่วงเวลาใช้งานตั๋วจะถูก **เลื่อนใหม่** เมื่อชำระเงินสำเร็จ
(เริ่มนับจาก `paidAt`) ไม่ใช่จากเวลาที่กดซื้อ — ผู้ใช้จึงไม่เสียเวลาที่ใช้หน้า checkout

### การเปลี่ยนราคา/อายุตั๋ว

แก้ในตาราง `system_config` (หรือผ่านหน้า Admin ของ US6-2) — ไม่ต้องแก้โค้ด

---

## 2. Schema ที่เพิ่ม (Step 2) — migration กลางชุดเดียว

Migration: `apps/backend/prisma/migrations/20261021165000_add_payment_for_ticket_purchase/migration.sql`

### ตาราง `payment`

| คอลัมน์           | ชนิด                           | หมายเหตุ                                                       |
| ----------------- | ------------------------------ | -------------------------------------------------------------- |
| `paymentid`       | SERIAL PK                      |                                                                |
| `ticketid`        | INTEGER FK → `ticket.ticketid` | `ON DELETE CASCADE`                                            |
| `uid`             | INTEGER                        | denormalize จาก ticket เพื่อ query "รายการของฉัน" ไม่ต้อง join |
| `amount_satang`   | INTEGER                        | ยอดเงินหน่วยสตางค์                                             |
| `currency`        | VARCHAR(3)                     | default `THB`                                                  |
| `status`          | `payment_status_enum`          | `Pending` / `Paid` / `Failed` / `Expired` / `Refunded`         |
| `gateway`         | VARCHAR(32)                    | `stripe` — รองรับการมีหลาย provider ในอนาคต                    |
| `gateway_ref`     | VARCHAR(255)                   | Stripe Checkout Session ID ใช้จับคู่ webhook                   |
| `idempotency_key` | VARCHAR(64) UNIQUE             | กันการซื้อซ้ำ                                                  |
| `checkout_url`    | TEXT                           | URL ที่ frontend redirect ไปชำระเงิน                           |
| `expires_at`      | TIMESTAMP                      | หมดอายุของ **payment attempt** (ไม่ใช่อายุใช้งานตั๋ว)          |
| `paid_at`         | TIMESTAMP                      | เวลาที่ชำระเงินสำเร็จ                                          |

Indexes: `idx_payment_user_status` (uid, status), `idx_payment_expiry` (status, expires_at), `idx_payment_gateway_ref`

### `system_config` — คอลัมน์ใหม่

| คอลัมน์                           | ค่า default | หมายเหตุ                     |
| --------------------------------- | ----------- | ---------------------------- |
| `ticket_price_satang`             | `5000`      | ราคาตั๋ว (หน่วยสตางค์)       |
| `ticket_validity_hours`           | `2`         | อายุใช้งานตั๋ว (ชั่วโมง)     |
| `payment_checkout_expiry_minutes` | `30`        | อายุ Checkout Session (นาที) |

### เรื่องที่ต้องทีม US6-2 / US6-3 ช่วยยืนยัน

1. **ราคาตั๋ว 50 THB / 2 ชั่วโมง** ถูกต้องตามนโยบายห้องสมุดหรือไม่?
2. ต้องมี **ตั๋วแบบเป็นรายวัน / รายครึ่งวัน** เพิ่มไหม? ถ้าต้อง จะเพิ่ม `ticketType` ลง `payment`
3. `ManageScore.adminId` เป็น NOT NULL — ถ้าจะมีการตัดคะแนนจาก no-show ของตั๋ว จะใช้ admin คนไหนเป็นผู้บันทึก?
4. จะมี **refund** flow ใน US6-2 หรือไม่? (enum `Refunded` เตรียมไว้แล้ว)
5. เก็บ `uid` ซ้ำใน `payment` ยืนยันว่าโอเคกับทีม (ตอนนี้ทำแบบ denormalize ตามรูปแบบ `booking` / `issue_report`)

---

## 3. Endpoints (Step 3-4)

### `POST /api/tickets/purchase`

ซื้อตั๋วผู้เข้าชมภายนอก

**สิทธิ์:** `OUTSIDER` เท่านั้น (นิสิต/บุคลากรจะได้ 403)
**Auth:** `Authorization: Bearer <jwt>`

**Request body (ทั้งหมด optional):**

```json
{
  "idempotencyKey": "client-generated-uuid"
}
```

> ราคาและช่วงเวลา **ไม่รับจาก client** — Backend กำหนดเองจาก `SystemConfig`

**Response 200:**

```json
{
  "success": true,
  "data": {
    "ticketId": 501,
    "paymentId": 101,
    "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_a1b2c3",
    "amountSatang": 5000,
    "currency": "THB",
    "paymentStatus": "Pending",
    "ticketStatus": "Unpaid",
    "expiresAt": "2026-10-21T18:00:00.000Z",
    "ticketStartDateTime": "2026-10-21T17:30:00.000Z",
    "ticketEndDateTime": "2026-10-21T19:30:00.000Z",
    "replayed": false
  }
}
```

**Frontend ต้องทำ:**

1. เรียก `POST /api/tickets/purchase` พร้อม `idempotencyKey` ที่ generate เอง (เก็บไว้ใน state ของปุ่มซื้อ)
2. ถ้า `data.checkoutUrl` มีค่า → `window.location.href = data.checkoutUrl` (redirect ไป Stripe)
3. ผู้ใช้กดซื้อซ้ำ → ใช้ **key เดิม** → ระบบคืนรายการเดิม (`replayed: true`) ไม่สร้างซ้ำ

> ⚠️ `ticketStatus` จะยังเป็น `Unpaid` ทันทีหลังซื้อ — ตั๋วจะเปลี่ยนเป็น `Paid` หลัง webhook ยืนยัน
> หน้า "ตั๋วของฉัน" ควร poll หรือรีเฟรชหลังกลับจาก Stripe

---

### `GET /api/tickets/my-tickets`

ดูตั๋วของตัวเองทั้งหมด พร้อมประวัติการชำระเงิน

**สิทธิ์:** ทุกคนที่ login แล้ว (ดูได้เฉพาะตั๋วของตัวเอง)

**Response 200:**

```json
{
  "success": true,
  "data": {
    "tickets": [
      {
        "ticketId": 501,
        "status": "Paid",
        "startDateTime": "2026-10-21T17:30:00.000Z",
        "endDateTime": "2026-10-21T19:30:00.000Z",
        "createdAt": "2026-10-21T17:00:00.000Z",
        "payments": [
          {
            "paymentId": 101,
            "amountSatang": 5000,
            "currency": "THB",
            "status": "Paid",
            "gateway": "stripe",
            "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_a1b2c3",
            "paidAt": "2026-10-21T17:05:00.000Z",
            "expiresAt": "2026-10-21T17:30:00.000Z",
            "createdAt": "2026-10-21T17:00:00.000Z"
          }
        ]
      }
    ]
  }
}
```

---

### `POST /api/tickets/payment/webhook`

รับการแจ้งเตือนจาก Stripe (เรียกโดย Stripe เท่านั้น ไม่ต้อง auth)

**Headers:** `Stripe-Signature: <signature>`
**Body:** raw JSON — route นี้ถูก mount **ก่อน** `express.json()` เพื่อให้ verify signature ผ่าน

**ทดสอบในเครื่อง:**

```bash
stripe listen --forward-to localhost:8080/api/tickets/payment/webhook
```

เอา `whsec_...` ที่ได้ไปใส่ `STRIPE_WEBHOOK_SECRET` ใน `.env`

**พฤติกรรม:**

| Event                                   | ผลลัพธ์                                                                                |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| `checkout.session.completed`            | `payment.status = Paid`, `ticket.status = Paid`, เลื่อนช่วงเวลาใช้งานเริ่มจาก `paidAt` |
| `checkout.session.expired`              | `payment.status = Expired`, ตั๋วยังเป็น `Unpaid` (ใช้ไม่ได้)                           |
| `checkout.session.async_payment_failed` | `payment.status = Failed`, ตั๋วยังเป็น `Unpaid`                                        |
| event อื่น                              | ตอบ 200 + `handled: false` (ไม่ทำอะไร)                                                 |

**Idempotent:** webhook ซ้ำจะถูกจัดการครั้งเดียว (ใช้ `updateMany` ที่มีเงื่อนไข `status = Pending`)

---

## 4. การป้องกันรายการซ้ำ (Step 5)

| สถานการณ์                                                          | ผลลัพธ์                                                                            |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| ส่ง `idempotencyKey` เดิมซ้ำ                                       | คืนรายการเดิม (`replayed: true`) ไม่สร้าง Ticket/Payment ใหม่ ไม่เรียก gateway ซ้ำ |
| ไม่ส่ง `idempotencyKey` + กดซื้อซ้ำภายใน 2 นาที                    | คืนรายการ PENDING ล่าสุด (`replayed: true`) — กัน double click                     |
| ส่ง `idempotencyKey` เดิม แต่รายการเดิมยังอยู่ระหว่างเรียก gateway | `409 PAYMENT_IN_PROGRESS` (retry ได้)                                              |
| ส่ง `idempotencyKey` เดิม แต่รายการเดิม Failed/Expired             | `409 PAYMENT_NOT_COMPLETED` — ต้องใช้ key ใหม่เพื่อซื้อใหม่                        |

---

## 5. Error Codes สำหรับ Frontend (Step 6)

ทุก error response มีรูปแบบ: `{ "success": false, "code": "...", "error": "..." }`
(`retryable: true` แนบมาด้วยเมื่อ error นั้น retry ได้)

| HTTP | `code`                       | หมายถึง                                       | ให้ Frontend ทำอะไร                     |
| ---- | ---------------------------- | --------------------------------------------- | --------------------------------------- |
| 401  | `Unauthorized`               | ไม่มี/หมดอายุ token                           | พาไป login                              |
| 400  | `INVALID_IDEMPOTENCY_KEY`    | key ไม่ผ่าน regex (`A-Za-z0-9._:-`, ≤ 64 ตัว) | ส่ง key ที่ถูกต้อง                      |
| 403  | `NOT_AN_OUTSIDE_USER`        | ผู้ใช้ไม่ใช่บุคคลภายนอก                       | ซ่อนปุ่มซื้อตั๋ว / แจ้งเฉพาะบุคคลภายนอก |
| 403  | `PROFILE_INCOMPLETE`         | ยังไม่จบ onboarding                           | พาไป `/onboarding`                      |
| 403  | `OUTSIDE_PROFILE_INCOMPLETE` | ยังไม่กรอกบัตรประชาชน/หนังสือเดินทาง          | พาไปกรอกเอกสาร                          |
| 404  | `USER_NOT_FOUND`             | ไม่พบผู้ใช้                                   | แจ้งผู้ใช้                              |
| 409  | `PAYMENT_IN_PROGRESS`        | คำขอเดิมยังประมวลผลอยู่                       | retry หลัง ~2 วินาที                    |
| 409  | `PAYMENT_NOT_COMPLETED`      | คำขอเดิมจบแล้ว (Failed/Expired)               | ใช้ idempotency key ใหม่                |
| 500  | `GATEWAY_NOT_CONFIGURED`     | Backend ยังไม่ได้ตั้งค่า Stripe key           | แจ้งผู้ดูแลระบบ (ไม่ใช่ปัญหาผู้ใช้)     |
| 502  | `GATEWAY_REJECTED`           | Stripe ปฏิเสธคำขอ                             | แจ้งผู้ใช้ลองใหม่ภายหลัง                |
| 503  | `GATEWAY_UNAVAILABLE`        | Stripe ล่ม/5xx                                | retry ได้ (`retryable: true`)           |
| 504  | `GATEWAY_TIMEOUT`            | Stripe ไม่ตอบในเวลาที่กำหนด                   | retry ได้ (`retryable: true`)           |

**หมายเหตุสำคัญ:** ทุกกรณีที่ gateway ล้มเหลว → `payment.status = Failed` และ `ticket.status` **ยังเป็น `Unpaid`**
ตั๋วจะไม่ถูกเปิดใช้งานจนกว่าจะได้รับ webhook ยืนยันการชำระเงินสำเร็จเท่านั้น

---

## 6. ตัวอย่างการเรียกใช้

### ซื้อตั๋ว (curl)

```bash
curl -X POST http://localhost:8080/api/tickets/purchase \
  -H "Authorization: Bearer <OUTSIDER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"idempotencyKey":"550e8400-e29b-41d4-a716-446655440000"}'
```

### ทดสอบด้วย Stripe test card

ใช้ test card `4242 4242 4242 4242`, วันหมดอายุ `12/34`, CVC `123`
เมื่อชำระเงินสำเร็จ Stripe จะยิง webhook มาที่ `/api/tickets/payment/webhook` (ต้องรัน `stripe listen` คู่กัน)

---

## 7. โครงสร้างโค้ดที่เพิ่ม

| ไฟล์                                    | หน้าที่                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/services/paymentGateway.ts`        | Interface (สัญญา) + `PaymentGatewayError` — ไม่ผูกกับ SDK ใด                                |
| `src/services/stripePaymentGateway.ts`  | การ implement จริงด้วย Stripe SDK (Checkout Session + webhook verify)                       |
| `src/services/paymentGatewayFactory.ts` | เลือก gateway จาก env — จุดเดียวที่ต้องแก้เพื่อเพิ่ม provider ใหม่                          |
| `src/services/ticketService.ts`         | Business logic: ราคา/อายุจาก config, idempotency, สร้าง Ticket+Payment, ยืนยันผลจาก webhook |
| `src/controllers/ticketController.ts`   | HTTP layer: validate input, map error → status code                                         |
| `src/routes/ticketRoutes.ts`            | `POST /purchase`, `GET /my-tickets`                                                         |
| `src/routes/ticketWebhookRoutes.ts`     | `POST /payment/webhook` (ใช้ raw body) — mount ก่อน `express.json()`                        |
| `src/test/test_ticket_purchase.ts`      | 16 unit tests                                                                               |

---

## 8. สิ่งที่ยังไม่ได้ทำ (รอทีมอื่น / US ถัดไป)

- ❌ ยืนยันตั๋วด้วย QR code / NFC ที่จุดเช็คอิน (น่าจะเป็น US6-2)
- ❌ Worker ที่ mark `payment` เป็น `Expired` เมื่อ Checkout Session หมดอายุ (ปัจจุบัน Stripe ส่ง webhook `checkout.session.expired` ให้แล้ว)
- ❌ Refund flow (enum `Refunded` เตรียมไว้แล้ว)
- ❌ ประวัติการซื้อ/ใช้จ่ายของผู้ใช้ในหน้าโปรไฟล์
- ❌ Integration test กับ Stripe test mode จริง (ต้องมี test card + `stripe listen`)
