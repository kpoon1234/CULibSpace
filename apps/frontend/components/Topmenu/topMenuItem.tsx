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
      className={`inline-flex h-10 w-28 items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
        isActive ? 'bg-white/20 text-white' : 'text-white hover:bg-white/15'
      }`}
    >
      {label}
    </Link>
  );
}
