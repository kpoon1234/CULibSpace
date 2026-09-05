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
      className={`rounded-md px-2 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white sm:px-3 ${
        isActive ? 'bg-chula-pink text-white' : 'text-ink hover:text-chula-pink'
      }`}
    >
      {label}
    </Link>
  );
}
