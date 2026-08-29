interface ForgotPasswordProps {
  open: boolean;
  handleClose: () => void;
}

export default function ForgotPassword({ open, handleClose }: ForgotPasswordProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleClose();
        }}
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
      >
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Reset password</h2>
        <p className="mb-4 text-sm text-gray-600">
          Enter your account&apos;s email address, and we&apos;ll send you a link to reset your
          password.
        </p>

        <input
          autoFocus
          required
          id="email"
          name="email"
          type="email"
          placeholder="Email address"
          className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-200"
        />

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700"
          >
            Continue
          </button>
        </div>
      </form>
    </div>
  );
}
