/**
 * [US6-1] Payment Gateway Abstraction
 * -------------------------------------------------------------------------
 * โมเดลนี้เป็น "สัญญา" (interface) ระหว่าง business logic ของระบบตั๋ว กับผู้ให้บริการเก็บเงิน
 * ภายนอก (Payment Gateway)
 *
 * เหตุผลที่ต้องมี interface:
 *   1. business logic ไม่ผูกกับ SDK ของ gateway ใด gateway หนึ่ง
 *      -> ทีม US6-2 / US6-3 สามารถเสริม gateway อื่น (Omise, PromptPay, ฯลฯ) ได้
 *      โดยไม่ต้องแก้ TicketService
 *   2. ทดสอบได้ง่าย: เขียน fake gateway ใน unit test ได้ ไม่ต้องต่อเน็ตจริง
 *   3. ทีมต่าง ๆ ทำงานร่วมกันได้ โดยยึดสัญญาเดียวกัน
 *
 * ข้อตกลงเรื่อง "หน่วยเงิน":
 *   - ระบบเก็บยอดเงินเป็น "สตางค์" (satang) เป็นจำนวนเต็ม เพื่อเลี่ยง floating point
 *   - 1 THB = 100 satang
 *   - Stripe ใช้หน่วยเล็กสุดของสกุลเงินเป็น unit_amount ซึ่งสำหรับ THB คือ satang
 *     จึงส่งค่าเดียวกันได้ตรง ๆ
 */

export interface CreateCheckoutSessionInput {
  /** ยอดเงินหน่วยสตางค์ (เช่น 5000 = 50.00 THB) */
  amountSatang: number;
  /** รหัสสกุลเงิน ISO-4217 ตัวพิมพ์ใหญ่ เช่น 'THB' */
  currency: string;
  /** อ้างอิงกลับเข้าระบบ (ใช้ paymentId) */
  reference: string;
  /** คำอธิบายที่จะแสดงในหน้า checkout ของ gateway */
  description: string;
  /** เวลาหมดอายุของ payment attempt (ไม่ใช่อายุใช้งานตั๋ว) */
  expiresAt: Date;
  /** กันการสร้าง checkout ซ้ำ ส่งต่อให้ gateway เอง */
  idempotencyKey: string;
  /** อีเมลผู้ซื้อ (ไม่บังคับ) */
  customerEmail?: string;
  /** URL หลังชำระเงินสำเร็จ */
  successUrl?: string;
  /** URL กรณีผู้ใช้ยกเลิก */
  cancelUrl?: string;
}

export interface CheckoutSessionResult {
  /** รหัสอ้างอิงฝั่ง gateway (เช่น Stripe Checkout Session ID) ใช้จับคู่ webhook */
  gatewayRef: string;
  /** URL ที่ frontend จะพาผู้ใช้ไปชำระเงิน */
  checkoutUrl: string;
  /** เวลาหมดอายุของ checkout session */
  expiresAt: Date;
}

/** ประเภท event ที่ระบบสนใจจาก webhook */
export type GatewayPaymentEventType =
  'payment.succeeded' | 'payment.failed' | 'payment.expired' | 'payment.unknown';

export interface GatewayPaymentEvent {
  type: GatewayPaymentEventType;
  /** รหัสอ้างอิงฝั่ง gateway เพื่อจับคู่กับ payment */
  gatewayRef: string;
  /**
   * อ้างอิงกลับเข้าระบบ = paymentId (รูปแบบ string)
   * ใช้ค้นหารายการในฐานข้อมูลได้โดยตรง แม้ยังไม่ได้บันทึก gateway_ref
   */
  reference?: string;
  /** ยอดเงินที่เรียกเก็บจริง (หน่วยสตางค์) ต้องเอาไปเทียบกับ payment.amount_satang */
  amountSatang?: number;
  /** สกุลเงินที่เรียกเก็บจริง ต้องเทียบกับ payment.currency */
  currency?: string;
  /** สถานะการจ่ายเงินจริงจาก gateway (ไม่ใช่แค่ "session completed") */
  paymentState: GatewayPaymentState;
  /**
   * เวลาที่ชำระเงินสำเร็จจริง
   * หมายเหตุ: ค่านี้ไม่ควรเป็นเวลาที่สร้าง checkout session
   * (เวลาสร้าง session คือเวลาที่ผู้ใช้ยังกำลังกรอกข้อมูลอยู่)
   */
  paidAt?: Date;
  /** payload ดิบ ไว้ debug / audit */
  raw: unknown;
}

/**
 * สถานะการจ่ายเงินตาม gateway
 * - paid                : ชำระเงินสำเร็จแล้ว (ยืนยันได้)
 * - unpaid              : ยังไม่ได้ชำระเงิน (เช่น วิธีชำระเงินที่ต้องรอ) -> ยังเปิดใช้ตั๋วไม่ได้
 * - no_payment_required : ไม่ต้องชำระเงิน (เช่น 0 บาท)
 * - unknown             : gateway ไม่ได้ระบุ
 */
export type GatewayPaymentState = 'paid' | 'unpaid' | 'no_payment_required' | 'unknown';

export type PaymentGatewayErrorCode =
  /** ยังไม่ได้ตั้งค่า key ของ gateway (เช่น STRIPE_SECRET_KEY) */
  | 'GATEWAY_NOT_CONFIGURED'
  /** gateway ไม่ตอบในเวลาที่กำหนด */
  | 'GATEWAY_TIMEOUT'
  /** gateway ล่ม / ติดต่อไม่ได้ / 5xx */
  | 'GATEWAY_UNAVAILABLE'
  /** gateway ปฏิเสธคำขอ (เช่น ข้อมูลไม่ถูกต้อง 4xx) */
  | 'GATEWAY_REJECTED'
  /** gateway ตอบกลับมาในรูปแบบที่คาดไม่ถึง */
  | 'GATEWAY_INVALID_RESPONSE';

export class PaymentGatewayError extends Error {
  readonly code: PaymentGatewayErrorCode;
  /** true = ลองใหม่ได้ (เช่น timeout, 5xx) */
  readonly retryable: boolean;
  readonly status: number;
  readonly cause?: unknown;

  constructor(
    code: PaymentGatewayErrorCode,
    message: string,
    options: { retryable?: boolean; status?: number; cause?: unknown } = {}
  ) {
    super(message);
    this.name = 'PaymentGatewayError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.status = options.status ?? 502;
    this.cause = options.cause;
  }
}

/**
 * สัญญาที่ทุก Payment Gateway ต้อง implement
 */
export interface PaymentGateway {
  /** ชื่อ gateway เก็บลง DB (เช่น 'stripe') เพื่อรองรับการมีหลาย provider */
  readonly name: string;

  /**
   * สร้าง checkout session ให้ผู้ใช้ไปชำระเงิน
   *
   * สัญญาเรื่อง idempotency (สำคัญมาก):
   *   การเรียกด้วย `idempotencyKey` เดิม ต้องได้ผลลัพธ์เดิมเสมอ
   *   และต้อง "ไม่สร้าง" checkout ซ้ำ
   *   -> ใช้กู้รายการเดิมได้ ในกรณีที่ gateway สร้าง checkout สำเร็จ
   *      แต่ response ของเรา timeout กลางทาง
   */
  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult>;

  /**
   * ตรวจสอบลายเซ็นและแปลง webhook payload เป็น event ที่ระบบเข้าใจ
   *
   * หมายเหตุ: การ "ยืนยันผลชำระเงินและเปิดใช้ตั๋ว" เป็นหน้าที่ของ US6-3
   * ฟังก์ชันนี้แค่แปลงข้อมูลดิบให้เป็นรูปแบบที่ตรวจสอบได้
   */
  parseWebhookEvent(rawBody: Buffer, signature: string): Promise<GatewayPaymentEvent>;
}
