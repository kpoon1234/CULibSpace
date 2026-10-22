# US6-1: Payment Gateway Integration — Ticket Purchase API

> สถานะ: Backend พร้อมใช้งาน (test mode) · ต้องรอทีม Frontend + US6-2/US6-3 ยืนยัน
> Gateway: **Stripe (test mode)** · สกุลเงิน: **THB**

---

## 0. ขอบเขตงานนี้ (Scope)

| ✅ อยู่ในขอบเขต US6-1                                | ❌ อยู่ในขอบเขต US6-2 / US6-3                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------------- |
| ตาราง `payment` + migration                          | `GET /api/tickets/my-tickets` (ดูตั๋ว + ประวัติการชำระเงิน) → **US6-2** |
| `POST /api/tickets/purchase`                         | webhook endpoint + การยืนยันผลชำระเงิน → **US6-3**                      |
| Backend validation (สิทธิ์, โปรไฟล์, ราคา, อายุตั๋ว) | เปิดใช้ตั๋ว (`Ticket.status = PAID`) → **US6-3**                        |
| ป้องกันคำขอซ้ำ + กู้รายการเดิม                       | ตั้ง Payment เป็น `Failed` / `Expired` จาก webhook → **US6-3**          |
| Error handling ตอนเรียก gateway                      |                                                                         |
| Payment gateway adapter (โค้ดกลาง)                   |                                                                         |

**สิ่งที่ทีม US6-3 ต้องทำต่อ (สำคัญ):**

1. สร้าง `POST /api/tickets/payment/webhook` โดย mount **ก่อน `express.json()`** เพื่อให้ได้ raw body
   (Stripe คำนวณ signature จาก byte ดิบ) — ดูหมายเหตุใน `src/server.ts`
2. เรียก `gateway.parseWebhookEvent(rawBody, signature)` แล้วตรวจสอบ **ทุกอย่างก่อนเปิดใช้ตั๋ว**:
   - `event.paymentState === 'paid'` (ไม่ใช่แค่ `session.completed`)
   - `event.amountSatang === payment.amount_satang`
   - `event.currency === payment.currency`
   - `event.reference` → ค้นหา payment ด้วย `paymentId` (ดูหมายเหตุด้านล่าง)
3. เมื่อยืนยันสำเร็จ: อัปเดต `payment.status = Paid`, `payment.paidAt = event.paidAt`,
   `payment.openUid = null` (สำคัญ — ล้างช่องรายการที่เปิดอยู่ ไม่งั้นผู้ใช้จะซื้อตั๋วใหม่ไม่ได้)
   และ `ticket.status = Paid` พร้อมเลื่อนช่วงเวลาใช้งานเป็น `paidAt` → `paidAt + payment.ticketValidityHours`
   (ใช้ค่าที่ snapshot ไว้ ไม่ใช่ config ปัจจุบัน)

> **เรื่อง identifier:** ตอนสร้าง checkout เราส่ง `reference = String(paymentId)` ให้ gateway
> (ทั้งใน `session.metadata.reference` และ `payment_intent_data.metadata.reference`)
> → ให้ค้นหา payment ด้วย **paymentId** เสมอ จะได้เจอแม้ยังไม่ได้บันทึก `gateway_ref`
> (เช่นกรณี gateway สร้าง checkout สำเร็จแต่ response timeout — ดูหัวข้อ 4)

---

## 1. ข้อสรุปราคาและอายุใช้งานตั๋ว

| หัวข้อ                 | ค่า                                                     | ที่มา / หมายเหตุ                                                                      |
| ---------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Gateway                | **Stripe Checkout Sessions** (test mode)                | รองรับ THB, มี idempotency key ระดับ request, hosted checkout page + webhook          |
| **ราคาตั๋ว**           | **50.00 THB** (5,000 satang)                            | `SystemConfig.ticketPriceSatang` — Backend อ่านจาก config เท่านั้น client ส่งมาไม่ได้ |
| **อายุใช้งานตั๋ว**     | **2 ชั่วโมง** นับจากเวลาที่ชำระเงินสำเร็จ               | `SystemConfig.ticketValidityHours` — **snapshot ไว้ใน payment ตอนซื้อ**               |
| อายุ Checkout Session  | 30 นาที                                                 | `SystemConfig.paymentCheckoutExpiryMinutes` — Stripe บังคับขั้นต่ำ 30 นาที            |
| หน่วยเงินที่เก็บใน DB  | **สตางค์ (satang)** — จำนวนเต็ม                         | 1 THB = 100 satang เลี่ยง floating point                                              |
| ตั๋วเริ่มใช้งานเมื่อไร | เมื่อได้รับ **webhook ยืนยันการชำระเงินสำเร็จ** (US6-3) | ไม่เปิดใช้ตั๋วก่อนยืนยันผล                                                            |

> **ทำไมต้อง snapshot อายุตั๋ว:** ถ้าอ่าน `ticketValidityHours` ใหม่ตอนยืนยันการจ่ายเงิน
> แอดมินอาจแก้ config ระหว่างที่ผู้ใช้กำลังกรอกข้อมูลในหน้า checkout
> → ผู้ใช้จะได้อายุตั๋วไม่ตรงกับตอนซื้อ จึงเก็บค่าไว้ใน `payment.ticket_validity_hours` ตอนซื้อ

> **ทำไมห้าม fallback ราคา:** ถ้าอ่าน config ไม่ได้แล้ว fallback ไปเก็บ 50 บาท
> ผู้ใช้จะถูกเก็บผิดราคา ระบบจึง **หยุดและคืน error** แทน (ไม่มีการเรียกเก็บเงิน)

---

## 2. Schema ที่เพิ่ม (migration กลางชุดเดียว)

Migration: `apps/backend/prisma/migrations/20261021165000_add_payment_for_ticket_purchase/migration.sql`

### ตาราง `payment`

| คอลัมน์                 | ชนิด                           | หมายเหตุ                                                               |
| ----------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| `paymentid`             | SERIAL PK                      | ใช้เป็น `reference` ที่ส่งให้ gateway                                  |
| `ticketid`              | INTEGER FK → `ticket.ticketid` | `ON DELETE CASCADE`                                                    |
| `uid`                   | INTEGER                        | denormalize จาก ticket เพื่อ query "รายการของฉัน" ไม่ต้อง join         |
| `amount_satang`         | INTEGER                        | ยอดเงินหน่วยสตางค์                                                     |
| `currency`              | VARCHAR(3)                     | default `THB`                                                          |
| `status`                | `payment_status_enum`          | `Pending` / `Unconfirmed` / `Paid` / `Failed` / `Expired` / `Refunded` |
| `gateway`               | VARCHAR(32)                    | `stripe` — รองรับการมีหลาย provider ในอนาคต                            |
| `gateway_ref`           | VARCHAR(255)                   | Stripe Checkout Session ID ใช้จับคู่ webhook                           |
| `client_key`            | VARCHAR(64)                    | key ที่ client ส่งมา (สูงสุด 64 ตัว)                                   |
| `idempotency_key`       | VARCHAR(128)                   | key เต็ม `user_<uid>_<client_key>` ที่ส่งต่อให้ gateway                |
| `checkout_url`          | TEXT                           | URL ที่ frontend redirect ไปชำระเงิน                                   |
| `ticket_validity_hours` | INTEGER                        | snapshot อายุตั๋วตอนซื้อ                                               |
| `expires_at`            | TIMESTAMP                      | หมดอายุของ **payment attempt** (ไม่ใช่อายุใช้งานตั๋ว)                  |
| `open_uid`              | INTEGER UNIQUE                 | ช่อง "รายการที่เปิดอยู่" ของผู้ใช้ (ดูหัวข้อ 4)                        |
| `paid_at`               | TIMESTAMP                      | เวลาที่ชำระเงินสำเร็จ (US6-3 เป็นคนเขียน)                              |

**Unique constraints (ตัวตั้งกันรายการซ้ำอยู่ที่ระดับ DB ไม่พึ่งการเช็คในแอปพลิเคชัน):**

| Constraint                                     | ป้องกัน                                       |
| ---------------------------------------------- | --------------------------------------------- |
| `uq_payment_user_client_key` (uid, client_key) | retry คำขอเดิม → คืนรายการเดิม                |
| `payment_open_uid_key` (open_uid)              | ผู้ใช้มีรายการที่ยัง "เปิด" ได้แค่รายการเดียว |

### `system_config` — คอลัมน์ใหม่

| คอลัมน์                           | ค่า default | หมายเหตุ                     |
| --------------------------------- | ----------- | ---------------------------- |
| `ticket_price_satang`             | `5000`      | ราคาตั๋ว (หน่วยสตางค์)       |
| `ticket_validity_hours`           | `2`         | อายุใช้งานตั๋ว (ชั่วโมง)     |
| `payment_checkout_expiry_minutes` | `30`        | อายุ Checkout Session (นาที) |

### เรื่องที่ต้องทีม US6-2 / US6-3 ช่วยยืนยัน

1. **ราคาตั๋ว 50 THB / 2 ชม.** ถูกต้องตามนโยบายห้องสมุดหรือไม่?
2. ต้องมี **ตั๋วแบบเป็นรายวัน / รายครึ่งวัน** เพิ่มไหม? ถ้าต้อง จะเพิ่ม `ticketType` ลง `payment`
3. `ManageScore.adminId` เป็น NOT NULL — ถ้าจะมีการตัดคะแนนจาก no-show ของตั๋ว จะใช้ admin คนไหนเป็นผู้บันทึก?
4. จะมี **refund** flow ใน US6-2 หรือไม่? (enum `Refunded` เตรียมไว้แล้ว)
5. เก็บ `uid` ซ้ำใน `payment` (denormalize) ยืนยันว่าโอเคกับทีม (ตอนนี้ทำแบบ denormalize ตามรูปแบบ `booking` / `issue_report`)
6. **US6-3 ต้องล้าง `payment.open_uid` เป็น NULL** เมื่อ payment ออกจากสถานะเปิด (Paid/Expired/Failed)
   ไม่งั้นผู้ใช้จะซื้อตั๋วใหม่ไม่ได้ (ระบบจะคืนรายการเก่าให้ตลอด)

---

## 3. Endpoint

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

- รูปแบบ: อักษร/ตัวเลข และ `.` `_` `:` `-` เท่านั้น, **ยาวไม่เกิน 64 ตัว**
- ถ้าไม่ส่ง ระบบจะ generate ให้เอง (ป้องกัน double-click ด้วย `open_uid` unique)

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
4. ได้ `409 PAYMENT_AWAITING_CONFIRMATION` → แสดงว่า "กำลังตรวจสอบ" แล้ว retry ด้วย **key เดิม**

> ⚠️ `ticketStatus` จะยังเป็น `Unpaid` ทันทีหลังซื้อ — ตั๋วจะเปลี่ยนเป็น `Paid` หลัง webhook ยืนยัน (US6-3)
> หน้า "ตั๋วของฉัน" (US6-2) ควร poll หรือรีเฟรชหลังกลับจาก Stripe

---

## 4. การป้องกันรายการซ้ำ

ระบบป้องกันด้วย **3 ชั้น** และบังคับด้วย unique constraint ที่ระดับ DB (ไม่พึ่งการเช็คในแอปพลิเคชันอย่างเดียว)

| ชั้น | กลไก                       | ผลลัพธ์                                                                           |
| ---- | -------------------------- | --------------------------------------------------------------------------------- |
| 1    | `(uid, client_key)` UNIQUE | retry คำขอเดิม → คืนรายการเดิม (`replayed: true`)                                 |
| 2    | `open_uid` UNIQUE          | ผู้ใช้มีรายการที่ยัง "เปิด" ได้แค่ 1 รายการ → กัน double-click และกันคำขอพร้อมกัน |
| 3    | `P2002` handling           | ถ้าชน unique constraint (request พร้อมกัน) → ดึงรายการที่ชนะมาตอบแทน              |

### สถานะของ Payment

| สถานะ         | ความหมาย                                                    | ผู้ใช้ซื้อใหม่ได้ไหม             |
| ------------- | ----------------------------------------------------------- | -------------------------------- |
| `Pending`     | สร้าง checkout แล้ว รอผู้ใช้จ่ายเงิน                        | ❌ (ต้องรอ/ยกเลิกรายการเก่าก่อน) |
| `Unconfirmed` | gateway ตอบไม่ชัดเจน (timeout) — **อาจสร้าง checkout แล้ว** | ❌ (ต้อง reconcile ก่อน)         |
| `Failed`      | gateway ปฏิเสธชัดเจน (ไม่มี checkout ค้าง)                  | ✅ (ต้องใช้ key ใหม่)            |
| `Expired`     | หมดอายุ                                                     | ✅ (ต้องใช้ key ใหม่)            |
| `Paid`        | จ่ายแล้ว (US6-3 เป็นคนเขียน)                                | ✅ (ต้องใช้ key ใหม่)            |

### การกู้รายการเดิม (Recovery)

**สถานการณ์:** gateway สร้าง checkout สำเร็จ แต่ response ของเรา timeout กลางทาง
→ ถ้าตัดเป็น `Failed` ทันที ผู้ใช้จะถูกห้ามซื้อใหม่ และ webhook ที่มาสำเร็จภายหลังจะถูกข้าม (เพราะสถานะไม่ใช่ `Pending`)

**วิธีแก้:** เก็บเป็น `Unconfirmed` (ไม่ใช่ `Failed`) แล้ว **ยิง gateway ซ้ำด้วย idempotency key เดิม**
Stripe เก็บผลลัพธ์ของ idempotency key ไว้ → คืน session เดิม ไม่สร้าง checkout ซ้ำ

```
ครั้งที่ 1: POST /purchase  -> timeout           -> payment = Unconfirmed (open_uid ยังถูกจอง)
ครั้งที่ 2: POST /purchase (key เดิม)
            -> เจอรายการเดิม -> ยิง gateway ซ้ำด้วย key เดิม -> ได้ session เดิมกลับมา
            -> payment = Pending + checkoutUrl  (กู้สำเร็จ)
```

---

## 5. Error Codes สำหรับ Frontend

ทุก error response: `{ "success": false, "code": "...", "error": "..." }`
(`retryable: true` แนบมาด้วยเมื่อ error นั้น retry ได้)

| HTTP | `code`                          | หมายถึง                                               | ให้ Frontend ทำอะไร                         |
| ---- | ------------------------------- | ----------------------------------------------------- | ------------------------------------------- |
| 401  | `Unauthorized`                  | ไม่มี/หมดอายุ token                                   | พาไป login                                  |
| 400  | `INVALID_IDEMPOTENCY_KEY`       | key ไม่ผ่านรูปแบบ หรือยาวเกิน 64 ตัว                  | ส่ง key ที่ถูกต้อง                          |
| 403  | `NOT_AN_OUTSIDE_USER`           | ผู้ใช้ไม่ใช่บุคคลภายนอก                               | ซ่อนปุ่มซื้อตั๋ว                            |
| 403  | `PROFILE_INCOMPLETE`            | ยังไม่จบ onboarding                                   | พาไป `/onboarding`                          |
| 403  | `OUTSIDE_PROFILE_INCOMPLETE`    | ยังไม่กรอกบัตรประชาชน/หนังสือเดินทาง                  | พาไปกรอกเอกสาร                              |
| 404  | `USER_NOT_FOUND`                | ไม่พบผู้ใช้                                           | แจ้งผู้ใช้                                  |
| 409  | `PAYMENT_AWAITING_CONFIRMATION` | รายการเดิมรอตรวจสอบ (เคย timeout)                     | retry ด้วย **key เดิม** (`retryable: true`) |
| 409  | `PAYMENT_NOT_COMPLETED`         | รายการเดิมจบแล้ว (Failed/Expired)                     | ใช้ **key ใหม่** เพื่อซื้อใหม่              |
| 500  | `GATEWAY_NOT_CONFIGURED`        | Backend ยังไม่ได้ตั้งค่า Stripe key                   | แจ้งผู้ดูแลระบบ (ไม่ใช่ปัญหาผู้ใช้)         |
| 502  | `GATEWAY_REJECTED`              | Stripe ปฏิเสธคำขอ (4xx) — ไม่มี checkout ค้าง         | แจ้งผู้ใช้ลองใหม่ภายหลัง ใช้ key ใหม่       |
| 503  | `GATEWAY_UNAVAILABLE`           | Stripe ล่ม/5xx                                        | retry ได้ (`retryable: true`)               |
| 504  | `GATEWAY_TIMEOUT`               | Stripe ไม่ตอบในเวลาที่กำหนด                           | retry ได้ (`retryable: true`)               |
| 503  | `CONFIG_UNAVAILABLE`            | อ่านราคาจาก config ไม่ได้ — **ไม่มีการเรียกเก็บเงิน** | แจ้งผู้ใช้ลองใหม่ภายหลัง                    |
| 503  | `INVALID_TICKET_PRICE`          | ค่าราคาใน config ผิด — **ไม่มีการเรียกเก็บเงิน**      | แจ้งผู้ดูแลระบบ                             |

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
เมื่อชำระเงินสำเร็จ Stripe จะยิง webhook มาที่ `/api/tickets/payment/webhook` (US6-3 ต้อง mount + `stripe listen`)

---

## 7. โครงสร้างโค้ดที่เพิ่ม

| ไฟล์                                    | หน้าที่                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/services/paymentGateway.ts`        | Interface (สัญญา) + `PaymentGatewayError` — ไม่ผูกกับ SDK ใด + โค้ดกลางที่ทีม US6-3 ใช้ต่อ              |
| `src/services/stripePaymentGateway.ts`  | การ implement จริงด้วย Stripe SDK (Checkout Session + webhook verify)                                   |
| `src/services/paymentGatewayFactory.ts` | เลือก gateway จาก env — จุดเดียวที่ต้องแก้เพื่อเพิ่ม provider ใหม่                                      |
| `src/services/ticketService.ts`         | Business logic: ราคา/อายุจาก config, idempotency, กันรายการซ้ำ, กู้รายการเดิม, จัดการ error จาก gateway |
| `src/controllers/ticketController.ts`   | HTTP layer: validate input, map error → status code                                                     |
| `src/routes/ticketRoutes.ts`            | `POST /purchase` (OUTSIDER only)                                                                        |
| `src/test/test_ticket_purchase.ts`      | 29 unit tests (รวม route-level test ผ่าน Express จริง)                                                  |

---

## 8. สิ่งที่ยังไม่ได้ทำ (รอทีมอื่น / US ถัดไป)

- ❌ ยืนยันตั๋วด้วย QR code / NFC ที่จุดเช็คอิน (น่าจะเป็น US6-2)
- ❌ Webhook endpoint + การยืนยันผลชำระเงิน + เปิดใช้ตั๋ว (US6-3)
- ❌ ดูรายการตั๋ว + ประวัติการชำระเงิน (US6-2)
- ❌ Worker ที่ mark payment เป็น `Expired` เมื่อ Checkout Session หมดอายุ
  (ตอนนี้ปิดรายการเก่าตอนผู้ใช้มาซื้อใหม่แทน — แต่ถ้าผู้ใช้ไม่กลับมาอีก รายการจะค้างเป็น `Pending`)
- ❌ Refund flow (enum `Refunded` เตรียมไว้แล้ว)
- ❌ Integration test กับ Stripe test mode จริง (ต้องมี test card + `stripe listen`)
