/**
 * @zudojs/docs/navigation
 *
 * Navigation tree utilities — breadcrumbs, flattening, sibling resolution.
 */

export {
  getBreadcrumbs,
  flattenNavigation,
  findNavigationItem,
} from "./navigation.core.js";
export { getSiblings, getAdjacent } from "./navigation.adjacent.js";

export type { GetAdjacentOptions } from "./navigation.adjacent.js";
