'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import HistoryModal from '@/components/Profile/HistoryModal';

type ProfileModalContextValue = {
  isOpen: boolean;
  openProfile: () => void;
  closeProfile: () => void;
  isHistoryOpen: boolean;
  openHistory: () => void;
  closeHistory: () => void;
};

const ProfileModalContext = createContext<ProfileModalContextValue | null>(null);

export function ProfileModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const openProfile = useCallback(() => setIsOpen(true), []);
  const closeProfile = useCallback(() => setIsOpen(false), []);
  const openHistory = useCallback(() => setIsHistoryOpen(true), []);
  const closeHistory = useCallback(() => setIsHistoryOpen(false), []);

  const value = useMemo(
    () => ({
      isOpen,
      openProfile,
      closeProfile,
      isHistoryOpen,
      openHistory,
      closeHistory,
    }),
    [isOpen, openProfile, closeProfile, isHistoryOpen, openHistory, closeHistory]
  );

  return (
    <ProfileModalContext.Provider value={value}>
      {children}
      <HistoryModal isOpen={isHistoryOpen} onClose={closeHistory} />
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
