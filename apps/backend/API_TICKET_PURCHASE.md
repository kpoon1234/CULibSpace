# Ticket Payment API — Purchase, Confirmation และคู่มือ Stripe Test Mode

> ครอบคลุม US6-1 (ซื้อ/เชื่อม gateway) และ US6-3 (ยืนยันการจ่ายสำเร็จ/เปิดใช้ตั๋ว)
> Gateway: **Stripe (test mode เท่านั้น)** · สกุลเงิน: **THB**
> ตรวจ Stripe test key และสร้าง/retrieve Checkout ผ่าน adapter จริงสำเร็จแล้ว (23 ต.ค. 2026)
> รายการทดสอบถูก expire โดยไม่ชำระเงิน; ยังไม่ใช่หลักฐานว่าการจ่าย → webhook → เปิดใช้ตั๋วผ่านครบ flow

---

## 0. ขอบเขตงานนี้ (Scope)

| งาน                                                             | เจ้าของ / สถานะ                                              |
| --------------------------------------------------------------- | ------------------------------------------------------------ |
| Purchase API, Payment, gateway adapter, validation และ recovery | US6-1 Poom/Kaopoon — มีโค้ดแล้ว                              |
| Verified successful webhook และเปิดใช้ตั๋ว                      | US6-3 Hill/Kaopoon — มีโค้ดแล้ว ใช้ service ร่วมกับ recovery |
| Pending/failed/expired handling และ error/UI ที่เกี่ยวข้อง      | US6-3 Poom/Punt — ไม่ทำซ้ำในงานยืนยันสำเร็จ                  |
| ฟอร์มซื้อ/validation/return pages                               | ทีม frontend US6-1                                           |
| API และ UI ดูตั๋ว/ประวัติการจ่าย                                | ทีม US6-2                                                    |

ใช้ webhook entry point **เดียว**; handler ของ pending/failed/expired ต้องต่อใน dispatcher เดิม
ตอนนี้ event ที่ตรวจ signature ผ่านแต่ไม่ใช่ success จะตอบ `200, handled: false`
โดยไม่แก้ DB และไม่บันทึก success receipt หากต้องการเติมสถานะย้อนหลังหลังเพิ่ม handler
ต้อง resend event เหล่านั้นเอง ไม่ใช่ถือว่าตอบ 200 แล้วประมวลผลเสร็จทั้งหมด

**ไม่เพิ่ม enum `ACTIVE`:** ใช้ `Ticket.status = PAID` และช่วง `startDateTime–endDateTime`
ตาม booking entitlement เดิม ส่วน US6-2/UI แสดงคำว่า “Active” เมื่อตั๋วอยู่ในช่วงใช้งานได้

---

## 1. ข้อสรุปราคาและอายุใช้งานตั๋ว

| หัวข้อ                 | ค่า                                                             | ที่มา / หมายเหตุ                                                                      |
| ---------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Gateway                | **Stripe Checkout Sessions** (test mode)                        | รองรับ THB, มี idempotency key ระดับ request, hosted checkout page + webhook          |
| **ราคาตั๋ว**           | **50.00 THB** (5,000 satang)                                    | `SystemConfig.ticketPriceSatang` — Backend อ่านจาก config เท่านั้น client ส่งมาไม่ได้ |
| **อายุใช้งานตั๋ว**     | **2 ชั่วโมง** นับจากเวลาที่ชำระเงินสำเร็จ                       | `SystemConfig.ticketValidityHours` — **snapshot ไว้ใน payment ตอนซื้อ**               |
| อายุ Checkout Session  | 30 นาที                                                         | `SystemConfig.paymentCheckoutExpiryMinutes` — Stripe บังคับขั้นต่ำ 30 นาที            |
| หน่วยเงินที่เก็บใน DB  | **สตางค์ (satang)** — จำนวนเต็ม                                 | 1 THB = 100 satang เลี่ยง floating point                                              |
| ตั๋วเริ่มใช้งานเมื่อไร | เมื่อ backend ยืนยันการชำระเงินสำเร็จผ่าน webhook หรือ recovery | ไม่เปิดใช้จาก redirect หรือข้อมูลที่ผู้ใช้ส่งมาเอง                                    |

ค่าราคา/อายุในตารางเป็น defaults ของ migration ไม่ใช่การยืนยันค่าของ DB ที่กำลังใช้งานจริง

> **ทำไมต้อง snapshot อายุตั๋ว:** ถ้าอ่าน `ticketValidityHours` ใหม่ตอนยืนยันการจ่ายเงิน
> แอดมินอาจแก้ config ระหว่างที่ผู้ใช้กำลังกรอกข้อมูลในหน้า checkout
> → ผู้ใช้จะได้อายุตั๋วไม่ตรงกับตอนซื้อ จึงเก็บค่าไว้ใน `payment.ticket_validity_hours` ตอนซื้อ

> **ทำไมห้าม fallback ราคา:** ถ้าอ่าน config ไม่ได้แล้ว fallback ไปเก็บ 50 บาท
> ผู้ใช้จะถูกเก็บผิดราคา ระบบจึง **หยุดและคืน error** แทน (ไม่มีการเรียกเก็บเงิน)

---

## 2. Schema และ migrations

Migration: `apps/backend/prisma/migrations/20261021165000_add_payment_for_ticket_purchase/migration.sql`

### ตาราง `payment`

| คอลัมน์                 | ชนิด                           | หมายเหตุ                                                                                                          |
| ----------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `paymentid`             | SERIAL PK                      | ใช้เป็น `reference` ที่ส่งให้ gateway                                                                             |
| `ticketid`              | INTEGER FK → `ticket.ticketid` | `ON DELETE CASCADE`                                                                                               |
| `uid`                   | INTEGER                        | denormalize จาก ticket เพื่อ query "รายการของฉัน" ไม่ต้อง join                                                    |
| `amount_satang`         | INTEGER                        | ยอดเงินหน่วยสตางค์                                                                                                |
| `currency`              | VARCHAR(3)                     | default `THB`                                                                                                     |
| `status`                | `payment_status_enum`          | `Pending` / `Unconfirmed` / `Paid` / `Failed` / `Expired` / `Refunded`                                            |
| `gateway`               | VARCHAR(32)                    | `stripe` — รองรับการมีหลาย provider ในอนาคต                                                                       |
| `gateway_ref`           | VARCHAR(255)                   | Stripe Checkout Session ID ใช้จับคู่ webhook                                                                      |
| `client_key`            | VARCHAR(64)                    | key ที่ client ส่งมา (สูงสุด 64 ตัว)                                                                              |
| `idempotency_key`       | VARCHAR(128)                   | key เต็ม `user_<uid>_<client_key>` ที่ส่งต่อให้ gateway                                                           |
| `checkout_url`          | TEXT                           | URL ที่ frontend redirect ไปชำระเงิน                                                                              |
| `checkout_payload`      | TEXT (JSON)                    | payload ของ checkout ที่ "เตรียมไว้" ใช้ซ้ำตอน retry — บันทึกภายใน transaction เดียวกับ Ticket/Payment (หัวข้อ 4) |
| `ticket_validity_hours` | INTEGER                        | snapshot อายุตั๋วตอนซื้อ                                                                                          |
| `expires_at`            | TIMESTAMP                      | หมดอายุของ **payment attempt** — ค่าเดียวกับที่ส่งให้ gateway                                                     |
| `open_uid`              | INTEGER UNIQUE                 | ช่อง "รายการที่เปิดอยู่" ของผู้ใช้ (ดูหัวข้อ 4)                                                                   |
| `paid_at`               | TIMESTAMP                      | เวลาที่ชำระเงินสำเร็จ (US6-3 เป็นคนเขียน)                                                                         |

**Unique constraints (ตัวตั้งกันรายการซ้ำอยู่ที่ระดับ DB ไม่พึ่งการเช็คในแอปพลิเคชัน):**

| Constraint                                     | ป้องกัน                                       |
| ---------------------------------------------- | --------------------------------------------- |
| `uq_payment_user_client_key` (uid, client_key) | retry คำขอเดิม → คืนรายการเดิม                |
| `payment_open_uid_key` (open_uid)              | ผู้ใช้มีรายการที่ยัง "เปิด" ได้แค่รายการเดียว |

> ชื่อ index ใน schema มี `map:` กำกับ เพื่อให้ตรงกับชื่อที่ migration สร้างจริง
> (ตรวจสอบแล้วด้วย `prisma migrate diff` ว่า schema กับ migration ตรงกันทุก index และทุกคอลัมน์)

### `system_config` — คอลัมน์ใหม่

| คอลัมน์                           | ค่า default | หมายเหตุ                     |
| --------------------------------- | ----------- | ---------------------------- |
| `ticket_price_satang`             | `5000`      | ราคาตั๋ว (หน่วยสตางค์)       |
| `ticket_validity_hours`           | `2`         | อายุใช้งานตั๋ว (ชั่วโมง)     |
| `payment_checkout_expiry_minutes` | `30`        | อายุ Checkout Session (นาที) |

### ตาราง `payment_webhook_event` (US6-3)

Migration เพิ่มใหม่: `20261023090000_add_payment_webhook_receipts`

| คอลัมน์               | หน้าที่                                               |
| --------------------- | ----------------------------------------------------- |
| `gateway`, `event_id` | Compound primary key กัน event เดิมซ้ำ                |
| `paymentid`           | FK ไป Payment พร้อม index; ลบตาม Payment ด้วย cascade |
| `gateway_ref`         | Session ID ที่ยืนยันแล้ว                              |
| `processed_at`        | เวลาบันทึก receipt (ไม่ใช่เวลาจ่ายเงิน)               |

เก็บเฉพาะ identifiers ไม่เก็บ raw payload/ข้อมูลบัตร เป็นหลักฐานว่า success event ถูกประมวลผลแล้ว
แม้ backend restart และเขียนใน transaction เดียวกับ Payment/Ticket
ส่วน event คนละ ID ที่อ้างถึง payment เดียวกันป้องกันด้วย row lock และสถานะตั๋วอีกชั้น

ต้อง apply migrations ก่อนเปิดใช้ webhook ไม่แก้หรือรัน migration ซื้อเดิมซ้ำ
เครื่องพัฒนานี้ apply ทั้ง purchase และ webhook receipt migrations แล้ว (23 ต.ค. 2026)
เครื่องอื่นยังต้องรัน `npx prisma migrate deploy` จาก `apps/backend` กับ DB ของเครื่องนั้น

เรื่องที่ทีมต้องยืนยันก่อน demo: ราคา/อายุตั๋วจริง, ความพร้อมของ return pages, และการต่อ handler ของ Poom/Punt
เมื่อรายการจบต้องล้าง `payment.open_uid` เพื่อให้ซื้อรายการใหม่ได้; success service ทำส่วน Paid แล้ว

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
→ ถ้าตัดเป็น `Failed` และปล่อยช่องทันที ผู้ใช้อาจซื้อ checkout ใหม่ทั้งที่รายการเก่ายังจ่ายได้

**วิธีแก้:**

1. เก็บเป็น `Unconfirmed` (ไม่ใช่ `Failed`) — ยังไม่รู้ว่า gateway สร้าง session หรือไม่
2. **payload ที่เตรียมไว้ต้องถูกเก็บลงรายการ** (`payment.checkout_payload`) และใช้ชุดเดิมทุกครั้งที่ retry
   — Stripe ปฏิเสธการใช้ idempotency key เดิมถ้าพารามิเตอร์ต่างกัน (เช่น `expires_at` ที่คำนวณใหม่,
   หรือ `customer_email` / `success_url` / `cancel_url` ที่ไม่ได้ส่งไป)
3. ครั้งถัดไปที่ยิงด้วย key เดิม ระบบจะยิง gateway ซ้ำด้วย payload ชุดเดิม → gateway คืน session เดิม

```
ครั้งที่ 1: POST /purchase  -> timeout  -> payment = Unconfirmed (open_uid ยังถูกจอง)
                            -> checkout_payload ถูกเก็บไว้แล้ว
ครั้งที่ 2: POST /purchase (key เดิม)
            -> เจอรายการเดิม -> ยิง gateway ซ้ำด้วย payload ชุดเดิม + key เดิม
            -> ได้ session เดิมกลับมา -> payment = Pending + checkoutUrl (กู้สำเร็จ)
```

**ข้อสำคัญ — payload ถูกบันทึก "ภายใน transaction" เดียวกับ Ticket/Payment**
ทั้ง Ticket, Payment และ `checkout_payload` ถูก commit พร้อมกัน
ถ้าการเขียน payload ล้มเหลว → transaction rollback ทั้งหมด
ไม่เหลือรายการที่จองช่อง (`open_uid`) ไว้แต่ไม่มี payload ให้กู้
และไม่มีการเรียก gateway เลย (เรียกหลัง commit เท่านั้น)

**ข้อสำคัญ — ห้ามเขียนทับรายการที่จบแล้วด้วย response ที่มาช้า**
ทุกการอัปเดตหลังคุยกับ gateway ใช้ conditional update (`updateMany`) ที่มีเงื่อนไข:
`paymentId` + สถานะเดิมเป็น `Pending`/`Unconfirmed` + `gateway_ref IS NULL`
→ response ที่มาช้าไม่สามารถเขียนสถานะ `Paid` กลับเป็น `Pending`
และไม่ทับ gateway reference ที่ถูกกู้ไปแล้ว
ถ้าอัปเดตไม่ได้ (count = 0) → โหลดข้อมูลล่าสุดมาตอบแทน

**ข้อสำคัญ — ห้ามปิดรายการจากเวลาฝั่ง DB อย่างเดียว**
เวลาในฐานข้อมูลอาจผ่านไปแล้ว แต่ checkout ที่ gateway สร้างไว้ยังเปิดอยู่
→ ต้องถาม gateway ก่อนเสมอด้วย `retrieveCheckoutStatus()`:

| ผลจาก gateway           | การกระทำ                                                                          |
| ----------------------- | --------------------------------------------------------------------------------- |
| `open`                  | ยังจ่ายได้ → เก็บช่องไว้ คืนรายการเดิม                                            |
| `paid`                  | ใช้ confirmation service ร่วมกัน → Payment/Ticket เป็น Paid + ปล่อยช่องแบบ atomic |
| `expired` / `not_found` | ใช้ไม่ได้แล้ว → ปิดรายการ ปล่อยให้ซื้อใหม่ได้                                     |
| `unknown`               | ตรวจไม่ได้ → คง `Unconfirmed` ห้ามปล่อยช่อง                                       |

> เพื่อไม่ให้เกิดเหตุการณ์นี้ ระบบตรวจค่า `payment_checkout_expiry_minutes` ต้องอยู่ในช่วงที่ gateway รองรับ
> (Stripe: 30–1440 นาที) **ก่อนสร้างรายการ** และใช้เวลาหมดอายุชุดเดียวกันทั้งฐานข้อมูลและ gateway

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
เมื่อชำระเงินสำเร็จ Stripe จะยิง webhook มาที่ `/api/tickets/payment/webhook`
route mount แล้ว แต่การรันบน localhost ยังต้องตั้ง `stripe listen` และ signing secret ตามหัวข้อ 10

---

## 7. โครงสร้างโค้ดที่เพิ่ม

| ไฟล์                                                | หน้าที่                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/services/paymentGateway.ts`                    | Interface (สัญญา) + `PaymentGatewayError` — ไม่ผูกกับ SDK ใด + โค้ดกลางที่ทีม US6-3 ใช้ต่อ              |
| `src/services/stripePaymentGateway.ts`              | การ implement จริงด้วย Stripe SDK (Checkout Session + webhook verify)                                   |
| `src/services/paymentGatewayFactory.ts`             | เลือก gateway จาก env — จุดเดียวที่ต้องแก้เพื่อเพิ่ม provider ใหม่                                      |
| `src/services/ticketService.ts`                     | Business logic: ราคา/อายุจาก config, idempotency, กันรายการซ้ำ, กู้รายการเดิม, จัดการ error จาก gateway |
| `src/controllers/ticketController.ts`               | HTTP layer: validate input, map error → status code                                                     |
| `src/routes/ticketRoutes.ts`                        | `POST /purchase` (OUTSIDER only)                                                                        |
| `src/routes/paymentWebhookRoutes.ts`                | รับ raw webhook, verify signature และแปลงผลเป็น HTTP response                                           |
| `src/services/paymentConfirmationService.ts`        | ตรวจผลที่ยืนยันแล้วและอัปเดต Payment/Ticket/receipt ใน transaction                                      |
| `src/test/test_ticket_purchase.ts`                  | 46 purchase tests รวม route-level tests                                                                 |
| `src/test/test_payment_confirmation.ts`             | Confirmation/HTTP signature tests และ live-key guard ไม่เรียก Stripe network                            |
| `src/test/test_payment_confirmation_integration.ts` | PostgreSQL rollback/concurrency tests บน DB ทดสอบแยก                                                    |

---

## 8. สิ่งที่ยังไม่ได้ทำ (รอทีมอื่น / US ถัดไป)

- ทดสอบร่วมกับฟอร์มซื้อ/return pages ของ frontend (ทีมยืนยันว่าสอง return pages พร้อมแล้ว)
- ดูรายการตั๋ว + ประวัติการชำระเงิน รวมถึง UI แสดง Active (US6-2)
- Handler ของ pending/failed/expired บน dispatcher เดียวกัน (US6-3 Poom/Punt)
- ❌ Worker ที่ mark payment เป็น `Expired` เมื่อ Checkout Session หมดอายุ
  (ตอนนี้ปิดรายการเก่าตอนผู้ใช้มาซื้อใหม่แทน — แต่ถ้าผู้ใช้ไม่กลับมาอีก รายการจะค้างเป็น `Pending`)
- ❌ Refund flow (enum `Refunded` เตรียมไว้แล้ว)
- ทดสอบจ่ายด้วย Stripe test card จน webhook เปิดใช้ตั๋วจริง (สร้าง/retrieve Checkout ทดสอบแล้ว แต่ยังไม่จ่าย)

## 9. ยืนยันการชำระเงินและเปิดใช้ตั๋ว (US6-3)

### `POST /api/tickets/payment/webhook`

- Mount **ก่อน `express.json()`** ใน `server.ts`; รับ raw body สูงสุด 256 KB
- ยืนยันด้วย `Stripe-Signature` ไม่ใช้ JWT; return URL และ `paid: true` จาก browser ไม่ใช่หลักฐานการจ่าย
- รับ `checkout.session.completed` และ `checkout.session.async_payment_succeeded`
  แต่ completed ที่ยัง unpaid และ `no_payment_required` ไม่เปิดใช้ตั๋วราคามากกว่า 0
- หลัง verify signed event จะ retrieve Checkout Session อิสระอีกครั้ง โดย expand `payment_intent.latest_charge`
  ตรวจ paid state, metadata payment ID, gateway/session binding, ยอดจำนวนเต็ม, currency และเจ้าของตั๋ว
- ค้นจาก `metadata.reference = String(paymentId)` เพื่อรองรับ webhook มาก่อนบันทึก `gatewayRef`
- Adapter ปัจจุบันใช้ `latest_charge.created` เป็น `paidAt`; ไม่ใช้ Session/PaymentIntent creation หรือเวลารับ webhook แทน
  หากข้อมูลเวลาไม่ครบจะตอบ retryable failure ไม่กำหนดเวลาใหม่เอง

ภายใน **transaction เดียว**: lock Payment ก่อน Ticket (`FOR UPDATE`) → บันทึก receipt ที่ไม่ซ้ำ
→ Payment PAID + ล้าง openUid → Ticket PAID พร้อมช่วง `paidAt .. paidAt + payment.ticketValidityHours`
ใช้ validity ที่ snapshot ตอนซื้อ ไม่อ่าน config ปัจจุบันมาทับ และ event ซ้ำไม่ยืดอายุตั๋ว
หากขั้นใดล้มเหลว การเปลี่ยนสถานะ/ช่วงใช้งานและ receipt จะ rollback ทั้งหมด

Purchase recovery เรียก service เดียวกัน และซ่อมกรณีเก่า Payment PAID แต่ Ticket UNPAID ได้
การจ่ายที่ยืนยันแล้วมาช้ายังเปิดใช้จากสถานะ local FAILED/EXPIRED ได้ แต่ไม่เปิดใช้รายการ REFUNDED
handler ของ failure/refund ในอนาคตต้องใช้ locking/conditional transitions ที่สอดคล้องกัน
และไม่ลด Paid กลับเพราะ failure event เก่ามาถึงช้า

| HTTP / ผล          | ความหมาย                                                                |
| ------------------ | ----------------------------------------------------------------------- |
| 200, handled=true  | ยืนยัน/เปิดใช้แล้ว หรือ event เดิมประมวลผลแล้ว; commit ก่อนตอบ          |
| 200, handled=false | ไม่รองรับ event หรือ signed event มี business mismatch ถาวร; ไม่เปิดใช้ |
| 400                | signature/raw body ไม่ถูกต้อง หรือ live event ถูกปฏิเสธ                 |
| 503                | gateway/เวลา/DB/config มีปัญหาชั่วคราว ให้ Stripe retry                 |

Business mismatch บันทึกเฉพาะ safe code/identifier ให้ผู้ดูแลตรวจ ไม่ log raw payload, secrets หรือ raw gateway errors
อย่าถือว่า HTTP 200 หรือ `received: true` แปลว่าจ่ายเงินหรือเปิดใช้สำเร็จ

## 10. ตั้งค่า Stripe Sandbox สำหรับ demo

1. สร้าง/เลือก sandbox ของทีม แล้วใส่ test API key (`sk_test_...` หรือ `rk_test_...` ที่สิทธิ์เพียงพอ)
   ใน `apps/backend/.env` เป็น `STRIPE_SECRET_KEY` โดยตรง ไม่ส่ง key ในแชต/Git/`NEXT_PUBLIC_*`
   gateway factory ปฏิเสธ live key และ webhook ปฏิเสธ live event
2. ตั้ง return URLs ใน `apps/backend/.env` ตามที่ตกลงกับ frontend:

   ```dotenv
   TICKET_CHECKOUT_SUCCESS_URL="http://localhost:3000/tickets/success"
   TICKET_CHECKOUT_CANCEL_URL="http://localhost:3000/tickets/cancel"
   ```

   ทีม frontend ยืนยันว่าสองหน้านี้พร้อมแล้ว ต้องทดสอบร่วมกับ branch ที่มีหน้าเหล่านี้
   URL ใช้พาผู้ใช้กลับ ไม่ใช่ endpoint ยืนยันการจ่าย
   การกลับหน้า cancel ไม่ได้ยกเลิกรายการใน DB อัตโนมัติ

   Flow นี้เป็น **Stripe-hosted Checkout**: frontend เรียก purchase API แล้วเปิด `data.checkoutUrl`
   ด้วย `window.location.assign(...)` ไม่จำเป็นต้องใช้ `STRIPE_PUBLISHABLE_KEY` หรือ Stripe.js
   Publishable key ใช้เมื่อ frontend เรียก Stripe.js/Elements/embedded checkout เอง
   ห้ามส่ง `STRIPE_SECRET_KEY` หรือ `STRIPE_WEBHOOK_SECRET` ให้ frontend

3. ติดตั้ง Stripe CLI แล้วเชื่อม sandbox เดียวกัน:

   ```bash
   stripe login
   stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded --forward-to http://localhost:8080/api/tickets/payment/webhook
   ```

   นำ `whsec_...` ที่ listener แสดงไปใส่ `STRIPE_WEBHOOK_SECRET` แล้ว restart backend และเปิด listener ค้างไว้
   secret ของ CLI และ secret ของ deployed HTTPS webhook เป็นคนละชุด ต้องใช้ให้ตรง endpoint

4. เปิด application DB และ apply migrations ตามกระบวนการ deploy ของทีม ตรวจ SystemConfig:
   `ticketPriceSatang` และ `ticketValidityHours` ต้องเป็นจำนวนเต็มบวก,
   `paymentCheckoutExpiryMinutes` อยู่ในช่วง 30–1440 นาที ค่า defaults คือ 5000 สตางค์/2 ชั่วโมง/30 นาที

คู่มือ provider: [API keys](https://docs.stripe.com/keys), [Webhooks](https://docs.stripe.com/webhooks),
[Test cards](https://docs.stripe.com/testing)

## 11. Tests และเกณฑ์รับงาน

รันจาก repository root โดยไม่ต้องมีบัญชี Stripe:

```bash
npm ci
npx prisma generate --schema apps/backend/prisma/schema.prisma
npm run test:payment --workspace=apps/backend
```

HTTP tests ใช้ real Stripe signature verifier กับ local test-only signing secret และ mock SDK retrieval
จึงไม่เรียก Stripe network และไม่ใช่หลักฐานว่า checkout sandbox จริงทำงานครบแล้ว

สำหรับ PostgreSQL integration tests ให้สร้าง DB **ทิ้งได้** ชื่อลงท้าย `_test` และคนละ URL กับ application DB
apply migrations ที่ DB นั้น แล้วตั้ง `TEST_DATABASE_URL` เพื่อรัน:

```bash
npm run test:payment:integration --workspace=apps/backend
```

Tests ใช้ generated fixture IDs และลบเฉพาะแถวที่สร้างเอง อยู่ใน `test:integration`/PR checks ด้วย
ครอบคลุม event ID เดียวพร้อมกัน 8 คำขอ, success ต่าง ID พร้อมกัน 8 คำขอ,
DB rollback เมื่อ final payment write ล้มเหลวและ retry, webhook แข่งกับ purchase recovery,
ซ่อม PAID/UNPAID เดิม และ webhook มาก่อน checkout response

### Demo กับ Stripe test mode หลังตั้งค่าครบ

1. Login เป็น outside visitor ที่ profile ครบ เรียก purchase API แล้วเปิด `checkoutUrl` ที่ตอบกลับ
2. ใช้ test card เท่านั้น ห้ามใช้บัตรจริง
3. ตรวจ webhook delivery และ DB: Payment PAID, openUid null, Ticket PAID, ช่วงใช้งานตรง validity snapshot
4. Resend event เดิม: receipt count/ช่วงใช้งานไม่เพิ่ม ตรวจ delayed success และ completed-but-unpaid ด้วย
   Pending/failed ต้องไม่ให้สิทธิ์ใช้งาน ส่วน negative status/error UI เป็นอีก task
5. ตรวจ booking ของ outside visitor ว่าต้องมี paid ticket ครอบคลุมช่วงจอง
   หากต้องเห็นสถานะเปลี่ยนอัตโนมัติบนหน้าเว็บ ต้องมี read API/UI ของ US6-2 และ refresh/poll บน return page

อย่าใช้ generic `stripe trigger checkout.session.completed` เป็นหลักฐาน end-to-end
เพราะปกติไม่มี reference ของ Payment ในระบบนี้ ต้องเริ่มจาก purchase API เพื่อให้ตรวจ metadata/ยอดได้

สิ่งที่ยังต้องยืนยันสำหรับ demo ครบ flow: webhook secret ต้องตรงกับ CLI listener หรือ public HTTPS endpoint/tunnel
ที่ส่งเข้า backend; จากนั้นใช้ frontend branch ที่มี return pages ทดลองจ่ายด้วย test card และตรวจการเปิดใช้ตั๋ว
ไม่มี fake-payment endpoint หรือ runtime mock fallback; mock SDK ใน tests มีไว้ทดสอบโดยไม่พึ่ง network และควรเก็บไว้
