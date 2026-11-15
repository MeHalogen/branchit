/**
 * Open a URL in the user's default browser, cross-platform. User-initiated only
 * (pressing "o" on the PR screen). Uses argument arrays with no shell.
 */
import { execa } from "execa";

export async function openUrl(url: string): Promise<boolean> {
  // Only allow http(s) URLs — never hand an arbitrary string to an opener.
  if (!/^https?:\/\//.test(url)) return false;
  const platform = process.platform;
  const [cmd, args] =
    platform === "darwin"
      ? (["open", [url]] as const)
      : platform === "win32"
        ? // Not `cmd /c start`: cmd re-parses the line, so `&` in a URL (e.g.
          // from a branch name) would run a second command.
          (["rundll32", ["url.dll,FileProtocolHandler", url]] as const)
        : (["xdg-open", [url]] as const);
  try {
    const res = await execa(cmd, [...args], { reject: false, shell: false });
    return res.exitCode === 0;
  } catch {
    return false;
  }
}
