export interface LegalContentProps {
  lang?: 'en' | 'th';
}

export function TermsContent({ lang = 'en' }: LegalContentProps) {
  if (lang === 'th') {
    return (
      <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">1. การยอมรับข้อกำหนด</h3>
          <p>
            โดยการเข้าถึงหรือใช้งาน CULibSpace คุณถือว่ายอมรับข้อกำหนดเหล่านี้ทั้งหมด
            หากคุณไม่ยอมรับโปรดหยุดการใช้งานแอปพลิเคชันนี้
          </p>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">2. คุณสมบัติผู้ใช้งาน</h3>
          <p>
            บริการนี้มีไว้สำหรับนิสิต บุคลากร และอาจารย์ของจุฬาลงกรณ์มหาวิทยาลัยที่มีบัญชี
            มหาวิทยาลัยที่ถูกต้อง รวมถึงบุคคลภายนอกที่ลงทะเบียนและซื้อบัตรผ่านเข้าใช้บริการรายวัน
            (day-pass ticket) แล้ว
          </p>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">3. การจองที่นั่งและโต๊ะ</h3>
          <p>
            คุณสามารถจองที่นั่งหรือโต๊ะได้ผ่านระบบออนไลน์ โดยต้องเข้าสู่ระบบก่อนทำการจอง
            การจองแต่ละรายการมีระยะเวลาที่กำหนดและต้องยกเลิกหากไม่ประสงค์จะใช้งาน
          </p>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">4. ความรับผิดชอบของผู้ใช้</h3>
          <p>
            คุณต้องรักษาความลับของรหัสผ่านและบัญชีผู้ใช้งาน และต้องรับผิดชอบต่อกิจกรรมทั้งหมดที่
            เกิดขึ้นภายใต้บัญชีของคุณ ห้ามใช้ระบบในทางที่ผิดหรือเพื่อจุดประสงค์ที่ผิดกฎหมาย
          </p>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">
            5. การยกเลิกและการเปลี่ยนแปลง
          </h3>
          <p>
            เราขอสงวนสิทธิในการเปลี่ยนแปลงหรือยกเลิกการจองได้ทุกเมื่อ ตามความจำเป็นในการ
            ดำเนินงานของห้องสมุด
          </p>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">6. การจำกัดความรับผิด</h3>
          <p>
            CULibSpace จะไม่รับผิดชอบต่อความเสียหายใดๆ ที่เกิดจากการใช้งานหรือไม่สามารถใช้งาน
            ระบบนี้ รวมถึงความเสียหายที่เกิดจากระบบขัดข้องหรือการบำรุงรักษา
          </p>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">7. การติดต่อ</h3>
          <p>หากคุณมีคำถามเกี่ยวกับข้อกำหนดเหล่านี้ สามารถติดต่อได้ที่:</p>
          <ul className="list-disc list-inside mt-1 space-y-1 text-sm text-gray-600">
            <li>
              อีเมล:{' '}
              <a
                href="mailto:chulalibrary@car.chula.ac.th"
                className="text-claret-600 underline font-medium hover:text-claret-700"
              >
                chulalibrary@car.chula.ac.th
              </a>
            </li>
            <li>หอสมุดกลาง สำนักงานวิทยทรัพยากร จุฬาลงกรณ์มหาวิทยาลัย</li>
          </ul>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
      <section>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">1. Acceptance of Terms</h3>
        <p>
          By accessing or using CULibSpace, you agree to be bound by these terms. If you do not
          agree, please discontinue use of this application.
        </p>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">2. User Eligibility</h3>
        <p>
          This service is available to Chulalongkorn University students, faculty, and staff with a
          valid university account, as well as external visitors who register and purchase a valid
          day-pass ticket.
        </p>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">3. Seat and Table Reservations</h3>
        <p>
          You may reserve seats or tables online through the system. You must sign in before making
          a reservation. Each reservation has a set duration and must be cancelled if you do not
          intend to use it.
        </p>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">4. User Responsibilities</h3>
        <p>
          You must keep your password and account credentials confidential and are responsible for
          all activity under your account. You may not use the system for unlawful or improper
          purposes.
        </p>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">5. Cancellation and Changes</h3>
        <p>
          We reserve the right to change or cancel any reservation at any time as necessary for
          library operations.
        </p>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">6. Limitation of Liability</h3>
        <p>
          CULibSpace shall not be liable for any damages arising from the use or inability to use
          this system, including damages due to system outages or maintenance.
        </p>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">7. Contact</h3>
        <p>
          If you have any questions about these terms, please contact us at{' '}
          <a
            href="mailto:chulalibrary@car.chula.ac.th"
            className="text-claret-600 underline font-medium hover:text-claret-700"
          >
            chulalibrary@car.chula.ac.th
          </a>{' '}
          or Chulalongkorn University Central Library (Office of Academic Resources).
        </p>
      </section>
    </div>
  );
}
