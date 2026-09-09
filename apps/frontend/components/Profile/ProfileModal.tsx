'use client';

import { useEffect } from 'react';
import { useProfileModal } from '@/lib/profileModalContext';
import ProfileContent from './ProfileContent';

export default function ProfileModal() {
  const { isOpen, closeProfile } = useProfileModal();

  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeProfile();
    }
    document.addEventListener('keydown', onKeyDown);

    // Prevent the page behind the modal from scrolling while it's open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, closeProfile]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) closeProfile();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Profile"
    >
      <ProfileContent onClose={closeProfile} />
    </div>
  );
}
