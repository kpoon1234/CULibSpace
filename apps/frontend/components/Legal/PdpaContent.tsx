export interface LegalContentProps {
  lang?: 'en' | 'th';
}

export function PdpaContent({ lang = 'en' }: LegalContentProps) {
  if (lang === 'th') {
    return (
      <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">1. ข้อมูลที่เราเก็บรวบรวม</h3>
          <p>
            เราเก็บรวบรวมข้อมูลส่วนบุคคลที่คุณให้ไว้เมื่อสมัครสมาชิกหรือเข้าสู่ระบบผ่านบัญชี Google
            รวมถึงชื่อ นามสกุล อีเมล รูปภาพโปรไฟล์ และหมายเลขโทรศัพท์ สำหรับบุคคลภายนอก
            ระบบจะเก็บเลขบัตรประชาชน (สำหรับคนไทย) หรือหมายเลขหนังสือเดินทาง (สำหรับชาวต่างชาติ)
            เพิ่มเติม เพื่อใช้ยืนยันตัวตน
          </p>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">
            2. วัตถุประสงค์ในการเก็บรวบรวมข้อมูล
          </h3>
          <p>
            เพื่อยืนยันตัวตน จัดการการจองที่นั่งและโต๊ะในห้องสมุด
            ดำเนินการชำระเงินค่าบัตรผ่านเข้าใช้บริการรายวันสำหรับบุคคลภายนอก
            และปรับปรุงประสบการณ์การใช้งานแอปพลิเคชัน CULibSpace
          </p>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">3. ฐานทางกฎหมายในการประมวลผล</h3>
          <p>
            เราประมวลผลข้อมูลของคุณบนฐานความยินยอมของเจ้าของข้อมูล และการปฏิบัติตาม
            สัญญาในการให้บริการจองที่นั่งห้องสมุด
          </p>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">
            4. การเปิดเผยและการส่งต่อข้อมูล
          </h3>
          <p>
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
          <h3 className="text-sm font-semibold text-gray-800 mb-1">5. สิทธิของเจ้าของข้อมูล</h3>
          <p>
            คุณมีสิทธิขอเข้าถึง แก้ไข ลบ หรือระงับการใช้ข้อมูลส่วนบุคคลของคุณ รวมถึงมีสิทธิ
            คัดค้านการประมวลผลข้อมูล โดยสามารถติดต่อผ่านช่องทางที่ระบุไว้ด้านล่าง
          </p>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">
            6. การติดต่อเจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล
          </h3>
          <p>หากคุณมีข้อสงสัยหรือต้องการใช้สิทธิในฐานะเจ้าของข้อมูล สามารถติดต่อได้ที่:</p>
          <ul className="list-disc list-inside mt-1 space-y-1 text-sm text-gray-600">
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
    );
  }

  return (
    <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
      <section>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">1. Data We Collect</h3>
        <p>
          We collect personal data you provide when you register or sign in via Google, including
          your name, surname, email address, profile picture, and phone number. External visitors
          are additionally required to provide a Thai citizen ID or passport number for identity
          verification.
        </p>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">2. Purpose of Data Collection</h3>
        <p>
          To verify your identity, manage seat and table reservations in the library, process
          day-pass ticket payments for external visitors, and improve your experience using the
          CULibSpace application.
        </p>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">3. Legal Basis for Processing</h3>
        <p>
          We process your data based on your consent and on the performance of a contract for the
          library seat reservation service.
        </p>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">
          4. Disclosure and Transfer of Data
        </h3>
        <p>
          We only disclose your personal data to essential service providers necessary for operating
          CULibSpace:
        </p>
        <ul className="list-disc list-inside mt-1 space-y-1">
          <li>
            <strong>Google LLC:</strong> for user authentication (Google OAuth 2.0 Single Sign-On)
            and identity verification.
          </li>
          <li>
            <strong>Stripe, Inc.:</strong> for secure payment processing of visitor day-pass
            tickets.
          </li>
        </ul>
        <p className="mt-2">
          We do not sell, rent, or transfer your personal data to any other third parties, except as
          required by applicable law or official regulations of Chulalongkorn University.
        </p>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">5. Data Subject Rights</h3>
        <p>
          You have the right to access, rectify, erase, or restrict the processing of your personal
          data, and the right to object to processing, by contacting us through the channels below.
        </p>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">
          6. Contact the Data Protection Officer
        </h3>
        <p>
          If you have any questions or wish to exercise your rights as a data subject, please
          contact our Data Protection Officer (DPO) at{' '}
          <a
            href="mailto:dpo@chula.ac.th"
            className="text-claret-600 underline font-medium hover:text-claret-700"
          >
            dpo@chula.ac.th
          </a>{' '}
          or Central Library at{' '}
          <a
            href="mailto:chulalibrary@car.chula.ac.th"
            className="text-claret-600 underline font-medium hover:text-claret-700"
          >
            chulalibrary@car.chula.ac.th
          </a>
          .
        </p>
      </section>
    </div>
  );
}
