/**
 * zudojs-cli — Binary
 *
 * The executable's run logic. `zudojs.ts` is the entry script itself and is
 * deliberately not re-exported: importing it would start the CLI.
 */

export {
  runBinary,
  shouldShowMenu,
  type BinaryEnvironment,
} from "./bin.runner.js";
export { isZudojsProject, openMainMenu } from "./bin.menu.js";
