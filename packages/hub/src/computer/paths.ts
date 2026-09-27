// Confinement of file paths to a bot's workspace (specs/computer: `..`,
// absolute paths and symlinks never lead outside it).
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

export class OutsideWorkspaceError extends Error {
  constructor(requested: string) {
    super(`"${requested}" is outside your workspace; file tools only reach files inside it`);
  }
}

const inside = (root: string, target: string) => target === root || target.startsWith(root + path.sep);

/** The real path of `target`, or of its nearest existing parent joined with the rest. */
function realOrParent(target: string): string {
  let current = target;
  const rest: string[] = [];
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    rest.unshift(path.basename(current));
    current = parent;
  }
  return path.join(realpathSync(current), ...rest);
}

/**
 * Resolve a path given by a bot (relative to the workspace, or absolute) to a
 * host path inside the workspace, or throw OutsideWorkspaceError.
 */
export function confine(workspace: string, requested: string): string {
  const root = realpathSync(workspace);
  const wanted = requested.trim() === "" ? "." : requested;
  const lexical = path.resolve(root, wanted);
  if (!inside(root, lexical)) throw new OutsideWorkspaceError(requested);
  // Symlinks: the real target (or the real parent of a file to be created) must stay inside too.
  if (!inside(root, realOrParent(lexical))) throw new OutsideWorkspaceError(requested);
  return lexical;
}

/** A host path as the bot should see it: relative to its workspace. */
export function display(workspace: string, target: string): string {
  const rel = path.relative(realpathSync(workspace), target);
  return rel === "" ? "." : rel.split(path.sep).join("/");
}
