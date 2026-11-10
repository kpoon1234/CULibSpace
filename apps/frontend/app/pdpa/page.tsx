export default function PDPAPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4 sm:p-8">
      <div className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-8 sm:p-12 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">
          นโยบายการคุ้มครองข้อมูลส่วนบุคคล (PDPA)
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          ข้อมูลส่วนบุคคลของคุณจะถูกเก็บรวบรวม ใช้
          และเปิดเผยภายใต้พระราชบัญญัติการคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)
        </p>

        <div className="mt-6 space-y-4 text-sm text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-sm font-semibold text-gray-800 mb-2">1. ข้อมูลที่เราเก็บรวบรวม</h2>
            <p className="mb-2">
              เราเก็บรวบรวมข้อมูลส่วนบุคคลที่คุณให้ไว้เมื่อสมัครสมาชิกหรือเข้าสู่ระบบผ่านบัญชี
              Google รวมถึงชื่อ นามสกุล อีเมล รูปภาพโปรไฟล์ และหมายเลขโทรศัพท์ สำหรับบุคคลภายนอก
              ระบบจะเก็บเลขบัตรประชาชน (สำหรับคนไทย) หรือหมายเลขหนังสือเดินทาง (สำหรับชาวต่างชาติ)
              เพิ่มเติม เพื่อใช้ยืนยันตัวตน
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mb-2">
              2. วัตถุประสงค์ในการเก็บรวบรวมข้อมูล
            </h2>
            <p className="mb-2">
              เพื่อยืนยันตัวตน จัดการการจองที่นั่งและโต๊ะในห้องสมุด ติดต่อแจ้งเตือนการจอง
              ดำเนินการชำระเงินค่าบัตรผ่านเข้าใช้บริการรายวันสำหรับบุคคลภายนอก
              และปรับปรุงประสบการณ์การใช้งานแอปพลิเคชัน CULibSpace
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mb-2">
              3. ฐานทางกฎหมายในการประมวลผล
            </h2>
            <p className="mb-2">
              เราประมวลผลข้อมูลของคุณบนฐานความยินยอมของเจ้าของข้อมูล และการปฏิบัติตาม
              สัญญาในการให้บริการจองที่นั่งห้องสมุด
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mb-2">
              4. การเปิดเผยและการส่งต่อข้อมูล
            </h2>
            <p className="mb-2">
              เราเปิดเผยข้อมูลส่วนบุคคลเฉพาะกับผู้ให้บริการที่มีความจำเป็นต่อการให้บริการ CULibSpace
              ได้แก่:
            </p>
            <ul className="list-disc list-inside mt-1 space-y-1 text-sm text-gray-600">
              <li>
                <strong>Google LLC:</strong> สำหรับการยืนยันตัวตนผู้ใช้งาน (Google OAuth 2.0 Single
                Sign-On)
              </li>
              <li>
                <strong>Stripe, Inc.:</strong>{' '}
                สำหรับการประมวลผลการชำระเงินค่าบัตรผ่านรายวันอย่างปลอดภัย
              </li>
            </ul>
            <p className="mt-2">
              เราจะไม่จำหน่าย ให้เช่า หรือเปิดเผยข้อมูลส่วนบุคคลของคุณแก่บุคคลภายนอกอื่นใด
              เว้นแต่เป็นไปตามที่กฎหมายหรือระเบียบของจุฬาลงกรณ์มหาวิทยาลัยกำหนด
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mb-2">5. สิทธิของเจ้าของข้อมูล</h2>
            <p className="mb-2">
              คุณมีสิทธิขอเข้าถึง แก้ไข ลบ หรือระงับการใช้ข้อมูลส่วนบุคคลของคุณ รวมถึงมีสิทธิ
              คัดค้านการประมวลผลข้อมูล โดยสามารถติดต่อผ่านช่องทางที่ระบุไว้ด้านล่าง
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mb-2">
              6. การติดต่อเจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล
            </h2>
            <p className="mb-2">
              หากคุณมีข้อสงสัยหรือต้องการใช้สิทธิในฐานะเจ้าของข้อมูล สามารถติดต่อได้ที่:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-gray-600">
              <li>
                เจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล (DPO):{' '}
                <a
                  href="mailto:dpo@chula.ac.th"
                  className="text-claret-600 underline font-medium hover:text-claret-700"
                >
                  dpo@chula.ac.th
                </a>
              </li>
              <li>
                หอสมุดกลาง จุฬาลงกรณ์มหาวิทยาลัย:{' '}
                <a
                  href="mailto:chulalibrary@car.chula.ac.th"
                  className="text-claret-600 underline font-medium hover:text-claret-700"
                >
                  chulalibrary@car.chula.ac.th
                </a>
              </li>
            </ul>
          </section>
        </div>

        <p className="mt-6 text-xs text-gray-500">
          นโยบายนี้อาจมีการปรับปรุงเป็นครั้งคราว
          การใช้งานต่อเนื่องถือว่าคุณยอมรับข้อผูกพันตามนโยบายที่แจ้งไว้ล่าสุด
        </p>
      </div>
    </main>
  );
}
