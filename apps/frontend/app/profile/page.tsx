import ProfileContent from '@/components/Profile/ProfileContent';

// Direct-link fallback (e.g. a bookmarked /profile URL). The normal entry
// point is the "Profile" nav item, which opens this same content in a modal
// over whatever page you're on — see ProfileModal / ProfileModalProvider.
export default function ProfilePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-pink-100 p-4">
      <ProfileContent />
    </main>
  );
}
