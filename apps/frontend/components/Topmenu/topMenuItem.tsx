import Link from 'next/link';

interface TopMenuItemProps {
  /** ข้อความที่แสดง เช่น "About", "Login" */
  label: string;
  /** path ปลายทางที่จะ route ไป เช่น "/about" */
  href: string;
  /** true = ไฮไลท์ว่ากำลังอยู่หน้านี้ */
  isActive?: boolean;
  /** เผื่อกรณีต้องปิด mobile menu หลังกด เป็นต้น */
  onClick?: () => void;
}

export default function TopMenuItem(props: TopMenuItemProps) {
  const { label, href, isActive = false, onClick } = props;

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex h-full w-[150px] justify-center items-center px-4 text-sm font-medium transition-colors hover:bg-pink-300 transition-colors ease-out duration-300 ${
        isActive ? 'bg-rose-50 text-rose-700' : 'text-white'
      }`}
    >
      {label}
    </Link>
  );
}
