'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import HistoryBookingModal from '@/components/Profile/HistoryBookingModal';

type ProfileModalContextValue = {
  isOpen: boolean;
  openProfile: () => void;
  closeProfile: () => void;
  isBookingHistoryOpen: boolean;
  openBookingHistory: () => void;
  closeBookingHistory: () => void;
};

const ProfileModalContext = createContext<ProfileModalContextValue | null>(null);

export function ProfileModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isBookingHistoryOpen, setIsBookingHistoryOpen] = useState(false);

  const openProfile = useCallback(() => setIsOpen(true), []);
  const closeProfile = useCallback(() => setIsOpen(false), []);
  const openBookingHistory = useCallback(() => setIsBookingHistoryOpen(true), []);
  const closeBookingHistory = useCallback(() => setIsBookingHistoryOpen(false), []);

  const value = useMemo(
    () => ({
      isOpen,
      openProfile,
      closeProfile,
      isBookingHistoryOpen,
      openBookingHistory,
      closeBookingHistory,
    }),
    [
      isOpen,
      openProfile,
      closeProfile,
      isBookingHistoryOpen,
      openBookingHistory,
      closeBookingHistory,
    ]
  );

  return (
    <ProfileModalContext.Provider value={value}>
      {children}
      <HistoryBookingModal isOpen={isBookingHistoryOpen} onClose={closeBookingHistory} />
    </ProfileModalContext.Provider>
  );
}

export function useProfileModal() {
  const ctx = useContext(ProfileModalContext);
  if (!ctx) {
    throw new Error('useProfileModal must be used within a ProfileModalProvider');
  }
  return ctx;
}
