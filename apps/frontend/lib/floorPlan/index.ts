// Public surface of the floor-plan data layer.
export * from './types';
export * from './statusStyle';
export * from './filterOptions';
export * from './format';
export { synthesizeLayout } from './autoLayout';
export {
  fetchLayout,
  buildFloorPlan,
  pickZone,
  type Sourced,
  type LayoutResult,
  type BuildFloorPlanArgs,
} from './client';
export {
  useFloorPlan,
  STATUS_POLL_MS,
  type UseFloorPlanResult,
  type UseFloorPlanOptions,
} from './useFloorPlan';
export { MOCK_FLOORS, mockFloorLayout, mockSeatStatus } from './mockData';
