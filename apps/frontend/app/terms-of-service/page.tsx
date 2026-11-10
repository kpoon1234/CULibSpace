import { TermsContent } from '@/components/Legal/TermsContent';

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

        <div className="mt-6">
          <TermsContent lang="th" />
        </div>

        <p className="mt-6 text-xs text-gray-500">
          ข้อกำหนดเหล่านี้อาจมีการปรับปรุงเป็นครั้งคราว การใช้งานต่อเนื่องถือว่าคุณยอมรับข้อกำหนดที่
          แจ้งไว้ล่าสุด
        </p>
      </div>
    </main>
  );
}
