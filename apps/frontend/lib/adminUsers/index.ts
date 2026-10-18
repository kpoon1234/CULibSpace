// Public surface of the admin user-search data layer (US5-4).
export * from './types';
export {
  searchUsers,
  useUserSearch,
  type SourcedUserPage,
  type UseUserSearchResult,
} from './client';
export { mockSearchUsers } from './mockData';
