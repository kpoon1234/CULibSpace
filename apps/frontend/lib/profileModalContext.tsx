'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type ProfileModalContextValue = {
  isOpen: boolean;
  openProfile: () => void;
  closeProfile: () => void;
};

const ProfileModalContext = createContext<ProfileModalContextValue | null>(null);

export function ProfileModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openProfile = useCallback(() => setIsOpen(true), []);
  const closeProfile = useCallback(() => setIsOpen(false), []);

  const value = useMemo(
    () => ({ isOpen, openProfile, closeProfile }),
    [isOpen, openProfile, closeProfile]
  );

  return <ProfileModalContext.Provider value={value}>{children}</ProfileModalContext.Provider>;
}

export function useProfileModal() {
  const ctx = useContext(ProfileModalContext);
  if (!ctx) {
    throw new Error('useProfileModal must be used within a ProfileModalProvider');
  }
  return ctx;
}
