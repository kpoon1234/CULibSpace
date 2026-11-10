import { PdpaContent } from '@/components/Legal/PdpaContent';

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

        <div className="mt-6">
          <PdpaContent lang="th" />
        </div>

        <p className="mt-6 text-xs text-gray-500">
          นโยบายนี้อาจมีการปรับปรุงเป็นครั้งคราว
          การใช้งานต่อเนื่องถือว่าคุณยอมรับข้อผูกพันตามนโยบายที่แจ้งไว้ล่าสุด
        </p>
      </div>
    </main>
  );
}
