
import { Box, Text, useInput } from "ink";
import { useColor, useTheme } from "../app/theme-context.js";
import { sanitizeForDisplay } from "../utils/format.js";
import type { PrContext } from "../workflows/pr.js";

/**
 * Pull-request readiness. Shows a checklist derived from real branch state and
 * offers the concrete next actions: push (setting an upstream if needed) and
 * opening a compare/PR page in the browser. GitHub `gh` availability is noted
 * when detected. No action is faked or hidden behind a dead button.
 */
export function PrReadiness(props: {
  ctx: PrContext;
  width: number;
  commandPreview: boolean;
  onPush: () => void;
  onOpenUrl: (url: string) => void;
  onClose: () => void;
}) {
  const color = useColor();
  const { glyphs } = useTheme();
  const { readiness, compareUrl, ghAvailable, identity } = props.ctx;

  const canPush = readiness.canPush && readiness.unpushed > 0;

  useInput((input, key) => {
    if (key.escape) {
      props.onClose();
      return;
    }
    if ((input === "P" || input === "p") && canPush) props.onPush();
    else if (input === "o" && compareUrl) props.onOpenUrl(compareUrl);
  });

  return (
    <Box
      flexDirection="column"
      width={props.width}
      borderStyle="round"
      borderColor={color("primary")}
      paddingX={1}
    >
      <Box>
        <Text color={color("accent")} bold>
          PR readiness
        </Text>
        <Text color={color("dim")}>
          {"   "}
          {sanitizeForDisplay(readiness.head)} {glyphs.arrow}{" "}
          {sanitizeForDisplay(readiness.base)}
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {readiness.items.map((it, i) => (
          <Box key={i}>
            <Box width={2}>
              <Text color={it.ok ? color("success") : color("warning")} bold>
                {it.ok ? glyphs.check : glyphs.warn}
              </Text>
            </Box>
            <Text color={color("text")}>{it.label}</Text>
          </Box>
        ))}
      </Box>

      {compareUrl ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={color("dim")}>Compare / open PR:</Text>
          <Text color={color("info")}>{sanitizeForDisplay(compareUrl)}</Text>
          {ghAvailable ? (
            <Text color={color("dim")}>
              GitHub CLI detected — you can also run{" "}
              <Text color={color("text")}>gh pr create</Text>
            </Text>
          ) : null}
        </Box>
      ) : identity ? (
        <Box marginTop={1}>
          <Text color={color("dim")}>
            {identity.host} host — no compare URL format available.
          </Text>
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text color={color("dim")}>
            No recognized remote — push, then open a PR on your host.
          </Text>
        </Box>
      )}

      {props.commandPreview && canPush ? (
        <Box marginTop={1}>
          <Text color={color("dim")}>
            {readiness.hasUpstream
              ? "git push"
              : `git push --set-upstream ${props.ctx.pushRemote ?? "origin"} ${sanitizeForDisplay(readiness.head)}`}
          </Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text color={color("dim")}>
          {canPush ? "P push   " : ""}
          {compareUrl ? "o open in browser   " : ""}
          esc close
        </Text>
      </Box>
    </Box>
  );
}
