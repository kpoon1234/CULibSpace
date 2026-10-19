'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  DEFAULT_PAGE_SIZE,
  USER_TYPES,
  useUserSearch,
  type AdminUserSummary,
  type UserType,
} from '@/lib/adminUsers';
import UserDetailPanel from './UserDetailPanel';
import UserResultsList from './UserResultsList';
import { USER_TYPE_LABEL } from './format';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, SearchIcon, UsersIcon } from './icons';

const SEARCH_DEBOUNCE_MS = 300;

interface UserSearchViewProps {
  /** Mount the Score Adjustment Form (separate US5-4 task) for the selected user. */
  renderActions?: (
    user: AdminUserSummary,
    actions: { retry: () => void; source: 'api' | 'mock' | undefined }
  ) => ReactNode;
}

// Admin user search (US5-4): find a user by name / email / student ID / phone,
// narrow by account type, and open their score + details beside the results.
export default function UserSearchView({ renderActions }: UserSearchViewProps) {
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [userType, setUserType] = useState<UserType | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  // Debounce typing into the query; a new query or filter starts from page 1.
  useEffect(() => {
    const id = setTimeout(() => {
      setQ(input.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [input]);

  const {
    page: result,
    source,
    isLoading,
    isFetching,
    error,
    retry,
  } = useUserSearch({
    q,
    userType,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  function chooseType(next: UserType | undefined) {
    setUserType(next);
    setPage(1);
  }

  function clearSearch() {
    setInput('');
    setQ('');
    setPage(1);
    inputRef.current?.focus();
  }

  function select(user: AdminUserSummary) {
    setSelectedUid(user.uid);
    // Below lg the panel stacks under the results — bring it into view.
    if (!window.matchMedia('(min-width: 1024px)').matches) {
      requestAnimationFrame(() =>
        detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      );
    }
  }

  // Derive the selected user from the latest results so the score stays in sync
  // after a retry (e.g. following a score adjustment) without calling setState
  // inside an effect.
  const selected = selectedUid ? (result?.users.find((u) => u.uid === selectedUid) ?? null) : null;

  const total = result?.total ?? 0;
  const first = total === 0 ? 0 : (page - 1) * DEFAULT_PAGE_SIZE + 1;
  const last = Math.min(page * DEFAULT_PAGE_SIZE, total);
  const pageCount = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(input.trim());
            setPage(1);
          }}
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          <label htmlFor="admin-user-search" className="sr-only">
            Search users
          </label>
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={inputRef}
              id="admin-user-search"
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && input) {
                  e.preventDefault();
                  clearSearch();
                }
              }}
              placeholder="Name, email, student ID or phone"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-md border border-gray-300 bg-paper py-2 pl-10 pr-9 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-rose-200 [&::-webkit-search-cancel-button]:hidden"
            />
            {input && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              >
                <CloseIcon width={16} height={16} />
              </button>
            )}
          </div>

          <div
            role="group"
            aria-label="Account type"
            className="flex flex-none overflow-x-auto rounded-md bg-gray-100 p-1"
          >
            <TypeTab active={!userType} onClick={() => chooseType(undefined)}>
              All
            </TypeTab>
            {USER_TYPES.map((t) => (
              <TypeTab key={t} active={userType === t} onClick={() => chooseType(t)}>
                {USER_TYPE_LABEL[t]}
              </TypeTab>
            ))}
          </div>
        </form>

        <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-paper shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-2.5">
            <p className="text-sm text-gray-600" aria-live="polite">
              {isLoading
                ? 'Searching…'
                : error && !result
                  ? 'Search failed'
                  : total === 0
                    ? 'No users'
                    : `${first}–${last} of ${total} ${total === 1 ? 'user' : 'users'}`}
            </p>
            {source === 'mock' && (
              <span className="rounded bg-brass-100 px-1.5 py-0.5 text-xs font-medium text-brass-800">
                Sample data
              </span>
            )}
          </div>

          {error && result && (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 bg-red-50 px-4 py-2 text-sm text-red-700"
            >
              <span>Couldn&apos;t refresh — showing the last results.</span>
              <button
                type="button"
                onClick={retry}
                className="font-medium underline-offset-2 hover:underline"
              >
                Retry
              </button>
            </div>
          )}

          {isLoading ? (
            <ResultsSkeleton />
          ) : error && !result ? (
            <ResultsError message={error.message} onRetry={retry} />
          ) : total === 0 ? (
            <ResultsEmpty query={q} filtered={Boolean(userType)} onClear={clearSearch} />
          ) : (
            <div
              aria-busy={isFetching}
              className={`transition-opacity duration-150 ${isFetching ? 'opacity-60' : ''}`}
            >
              <UserResultsList
                users={result!.users}
                selectedUid={selected?.uid ?? null}
                onSelect={select}
              />
            </div>
          )}

          {pageCount > 1 && !isLoading && (
            <nav
              aria-label="Results pages"
              className="flex items-center justify-between gap-3 border-t border-gray-200 px-4 py-2.5"
            >
              <span className="text-sm text-gray-500 tabular-nums">
                Page {page} of {pageCount}
              </span>
              <div className="flex gap-2">
                <PageButton disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeftIcon width={16} height={16} /> Previous
                </PageButton>
                <PageButton disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
                  Next <ChevronRightIcon width={16} height={16} />
                </PageButton>
              </div>
            </nav>
          )}
        </div>
      </div>

      <div ref={detailRef} className="scroll-mt-20 lg:sticky lg:top-20">
        <UserDetailPanel
          user={selected}
          onClose={() => setSelectedUid(null)}
          actions={
            selected && renderActions ? renderActions(selected, { retry, source }) : undefined
          }
        />
      </div>
    </div>
  );
}

function TypeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
        active ? 'bg-paper text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
      }`}
    >
      {children}
    </button>
  );
}

function PageButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-paper px-3 py-1.5 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-paper"
    >
      {children}
    </button>
  );
}

function ResultsSkeleton() {
  return (
    <ul className="animate-pulse divide-y divide-gray-100" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="space-y-2">
            <div className="h-3.5 w-40 rounded bg-gray-200" />
            <div className="h-3 w-56 rounded bg-gray-100" />
          </div>
          <div className="h-4 w-10 rounded bg-gray-200" />
        </li>
      ))}
    </ul>
  );
}

function ResultsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  // Session problems carry a readable message from the client; anything else
  // (network, 5xx) gets the generic recovery copy.
  const isSession = message.toLowerCase().includes('session');
  return (
    <div role="alert" className="px-6 py-10 text-center">
      <h2 className="text-base font-semibold text-gray-900">Couldn&apos;t search users</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-gray-600">
        {isSession
          ? message
          : "The user service didn't respond. Check your connection and try again."}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-md bg-chula-pink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-chula-pink-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-chula-pink focus-visible:ring-offset-2"
      >
        Try again
      </button>
    </div>
  );
}

function ResultsEmpty({
  query,
  filtered,
  onClear,
}: {
  query: string;
  filtered: boolean;
  onClear: () => void;
}) {
  return (
    <div className="px-6 py-10 text-center">
      <UsersIcon className="mx-auto text-gray-400" width={28} height={28} />
      <h2 className="mt-2 text-base font-semibold text-gray-900">
        {query ? `No users match “${query}”` : filtered ? 'No users of this type' : 'No users yet'}
      </h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-gray-600">
        {query
          ? 'Check the spelling, or try their email, student ID or phone number instead.'
          : filtered
            ? 'Switch the account type back to All to see everyone.'
            : 'Accounts appear here after someone signs in for the first time.'}
      </p>
      {query && (
        <button
          type="button"
          onClick={onClear}
          className="mt-4 rounded-md border border-gray-300 bg-paper px-4 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
        >
          Clear search
        </button>
      )}
    </div>
  );
}
