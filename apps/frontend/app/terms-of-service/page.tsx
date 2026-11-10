export default function TermsOfServicePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4 sm:p-8">
      <div className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-8 sm:p-12 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">
          ข้อกำหนดการให้บริการ (Terms of Service)
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          เงื่อนไขการใช้งานแอปพลิเคชัน CULibSpace สำหรับการจองที่นั่งและโต๊ะในห้องสมุด
          จุฬาลงกรณ์มหาวิทยาลัย
        </p>

        <div className="mt-6 space-y-4 text-sm text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-sm font-semibold text-gray-800 mb-2">1. การยอมรับข้อกำหนด</h2>
            <p className="mb-2">
              โดยการเข้าถึงหรือใช้งาน CULibSpace คุณถือว่ายอมรับข้อกำหนดเหล่านี้ทั้งหมด
              หากคุณไม่ยอมรับโปรดหยุดการใช้งานแอปพลิเคชันนี้
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mb-2">2. คุณสมบัติผู้ใช้งาน</h2>
            <p className="mb-2">
              บริการนี้มีไว้สำหรับนิสิต บุคลากร และอาจารย์ของจุฬาลงกรณ์มหาวิทยาลัยที่มีบัญชี
              มหาวิทยาลัยที่ถูกต้อง รวมถึงบุคคลภายนอกที่ลงทะเบียนและซื้อบัตรผ่านเข้าใช้บริการรายวัน
              (day-pass ticket) แล้ว
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mb-2">3. การจองที่นั่งและโต๊ะ</h2>
            <p className="mb-2">
              คุณสามารถจองที่นั่งหรือโต๊ะได้ผ่านระบบออนไลน์ โดยต้องเข้าสู่ระบบก่อนทำการจอง
              การจองแต่ละรายการมีระยะเวลาที่กำหนดและต้องยกเลิกหากไม่ประสงค์จะใช้งาน
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mb-2">4. ความรับผิดชอบของผู้ใช้</h2>
            <p className="mb-2">
              คุณต้องรักษาความลับของรหัสผ่านและบัญชีผู้ใช้งาน และต้องรับผิดชอบต่อกิจกรรมทั้งหมดที่
              เกิดขึ้นภายใต้บัญชีของคุณ ห้ามใช้ระบบในทางที่ผิดหรือเพื่อจุดประสงค์ที่ผิดกฎหมาย
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mb-2">
              5. การยกเลิกและการเปลี่ยนแปลง
            </h2>
            <p className="mb-2">
              เราขอสงวนสิทธิในการเปลี่ยนแปลงหรือยกเลิกการจองได้ทุกเมื่อ ตามความจำเป็นในการ
              ดำเนินงานของห้องสมุด
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mb-2">6. การจำกัดความรับผิด</h2>
            <p className="mb-2">
              CULibSpace จะไม่รับผิดชอบต่อความเสียหายใดๆ ที่เกิดจากการใช้งานหรือไม่สามารถใช้งาน
              ระบบนี้ รวมถึงความเสียหายที่เกิดจากระบบขัดข้องหรือการบำรุงรักษา
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mb-2">7. การติดต่อ</h2>
            <p className="mb-2">หากคุณมีคำถามเกี่ยวกับข้อกำหนดเหล่านี้ สามารถติดต่อได้ที่:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-gray-600">
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

        <p className="mt-6 text-xs text-gray-500">
          ข้อกำหนดเหล่านี้อาจมีการปรับปรุงเป็นครั้งคราว การใช้งานต่อเนื่องถือว่าคุณยอมรับข้อกำหนดที่
          แจ้งไว้ล่าสุด
        </p>
      </div>
    </main>
  );
}
