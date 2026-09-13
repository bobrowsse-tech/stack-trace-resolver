import { simpleGit } from 'simple-git';

export async function resolveCommit(
  workspaceRoot: string,
  buildId: string | undefined
): Promise<{ sha?: string; found: boolean; note?: string }> {
  if (!buildId) {
    return { found: false };
  }
  try {
    const git = simpleGit(workspaceRoot);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return {
        found: false,
        note: `Build id ${buildId} present but workspace is not a git repo — showing HEAD working tree`,
      };
    }
    try {
      // Bare rev-parse echoes the input even when the object is missing;
      // --verify requires a real revision.
      const sha = (await git.revparse(['--verify', `${buildId}^{commit}`])).trim();
      return { sha, found: true };
    } catch {
      return {
        found: false,
        note: `Commit ${buildId} not found locally — showing HEAD instead of historical revision`,
      };
    }
  } catch (err) {
    return {
      found: false,
      note: `Could not check git for ${buildId}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Read file content as of a commit. Returns undefined if unavailable.
 */
export async function showFileAtCommit(
  workspaceRoot: string,
  sha: string,
  filePath: string
): Promise<string | undefined> {
  try {
    const git = simpleGit(workspaceRoot);
    return await git.show([`${sha}:${filePath}`]);
  } catch {
    return undefined;
  }
}
