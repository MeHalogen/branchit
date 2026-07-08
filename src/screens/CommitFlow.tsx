import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { WorkingTreeState } from "../git/models.js";
import type { CommitResult } from "../git/actions.js";
import {
  COMMIT_TYPES,
  buildCommitMessage,
  inferScope,
  stageableFiles,
  suggestType,
  validateSubject,
  type CommitDraft,
} from "../workflows/commit.js";
import { useColor, useTheme } from "../app/theme-context.js";
import { sanitizeForDisplay } from "../utils/format.js";

type Stage =
  | "files"
  | "type"
  | "scope"
  | "subject"
  | "body"
  | "preview"
  | "committing"
  | "result";

/**
 * Conventional commit flow. Inspects real working-tree state, offers interactive
 * staging when nothing is staged, then guides type → scope → subject → body →
 * preview → commit. Every step is skippable where optional; nothing is faked.
 */
export function CommitFlow(props: {
  workingTree: WorkingTreeState;
  width: number;
  commandPreview: boolean;
  onReconcileStaging: (toAdd: string[], toRemove: string[]) => Promise<void>;
  onCommit: (message: string) => Promise<CommitResult>;
  onDone: () => void;
}) {
  const color = useColor();
  const { glyphs } = useTheme();
  const { workingTree, width } = props;

  const files = useMemo(() => stageableFiles(workingTree), [workingTree]);
  const currentStaged = useMemo(
    () => new Set(workingTree.staged.map((f) => f.path)),
    [workingTree],
  );

  const [stage, setStage] = useState<Stage>(
    workingTree.staged.length > 0 ? "type" : "files",
  );
  const [included, setIncluded] = useState<Set<string>>(() => new Set(currentStaged));
  const [cursor, setCursor] = useState(0);

  const suggestedTypeName = useMemo(() => suggestType(workingTree.staged), [workingTree.staged]);
  const [typeIdx, setTypeIdx] = useState(() => {
    const i = COMMIT_TYPES.findIndex((t) => t.name === suggestedTypeName);
    return i >= 0 ? i : 0;
  });
  const inferredScope = useMemo(() => inferScope(workingTree.staged), [workingTree.staged]);
  const [scope, setScope] = useState("");
  const [scopeTouched, setScopeTouched] = useState(false);
  const [breaking, setBreaking] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [result, setResult] = useState<CommitResult | null>(null);

  // Until the user types a scope, the inferred scope is used (and shown in the
  // live preview). Typing replaces it; an empty field on Enter accepts it.
  const effectiveScope = scopeTouched ? scope : inferredScope ?? "";
  const draft: CommitDraft = {
    type: COMMIT_TYPES[typeIdx]!.name,
    scope: effectiveScope,
    breaking,
    subject,
    body,
  };
  const header =
    `${draft.type}${draft.scope ? `(${draft.scope})` : ""}${breaking ? "!" : ""}: ` +
    (subject || "…");
  const subjectValidation = validateSubject(subject);

  const reconcileAndAdvance = async () => {
    const toAdd = [...included].filter((p) => !currentStaged.has(p));
    const toRemove = [...currentStaged].filter((p) => !included.has(p));
    await props.onReconcileStaging(toAdd, toRemove);
    setStage("type");
  };

  const doCommit = async () => {
    setStage("committing");
    const res = await props.onCommit(buildCommitMessage(draft));
    setResult(res);
    setStage("result");
  };

  useInput((input, key) => {
    // Global cancel (except while committing or on the result screen).
    if (key.escape && stage !== "committing" && stage !== "result") {
      props.onDone();
      return;
    }

    if (stage === "files") {
      if (key.downArrow || input === "j") setCursor((i) => Math.min(i + 1, files.length - 1));
      else if (key.upArrow || input === "k") setCursor((i) => Math.max(i - 1, 0));
      else if (input === " ") {
        const f = files[cursor];
        if (f)
          setIncluded((prev) => {
            const next = new Set(prev);
            next.has(f.path) ? next.delete(f.path) : next.add(f.path);
            return next;
          });
      } else if (input === "a") setIncluded(new Set(files.map((f) => f.path)));
      else if (key.return && included.size > 0) void reconcileAndAdvance();
      return;
    }

    if (stage === "type") {
      if (key.downArrow || input === "j") setTypeIdx((i) => Math.min(i + 1, COMMIT_TYPES.length - 1));
      else if (key.upArrow || input === "k") setTypeIdx((i) => Math.max(i - 1, 0));
      else if (key.return) {
        setStage("scope");
      } else if (workingTree.staged.length === 0) setStage("files");
      return;
    }

    if (stage === "scope") {
      if (key.return) {
        // Accept the effective scope (typed value, or the inferred suggestion).
        setScope(effectiveScope);
        setScopeTouched(true);
        setStage("subject");
      } else if (key.backspace || key.delete) {
        setScopeTouched(true);
        setScope((s) => s.slice(0, -1));
      } else if (key.tab) setStage("type");
      else if (input && !key.ctrl && !key.meta) {
        setScopeTouched(true);
        setScope((s) => s + input);
      }
      return;
    }

    if (stage === "subject") {
      if (key.ctrl && input === "b") setBreaking((b) => !b);
      else if (key.return) {
        if (subjectValidation.ok) setStage("body");
      } else if (key.tab) setStage("scope");
      else if (key.backspace || key.delete) setSubject((s) => s.slice(0, -1));
      else if (input && !key.ctrl && !key.meta) setSubject((s) => s + input);
      return;
    }

    if (stage === "body") {
      if (key.return) setStage("preview");
      else if (key.tab) setStage("subject");
      else if (key.backspace || key.delete) setBody((s) => s.slice(0, -1));
      else if (input && !key.ctrl && !key.meta) setBody((s) => s + input);
      return;
    }

    if (stage === "preview") {
      if (key.return) void doCommit();
      else if (input === "e") setStage("subject");
      return;
    }

    if (stage === "result") {
      if (result?.ok) {
        if (key.return || key.escape) props.onDone();
      } else {
        if (input === "r") setStage("preview");
        else if (key.return || key.escape) props.onDone();
      }
    }
  });

  const innerWidth = Math.max(24, width - 4);

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="round"
      borderColor={color(stage === "result" && !result?.ok ? "danger" : "primary")}
      paddingX={1}
    >
      <Text color={color("accent")} bold>
        Commit  ·  {stageLabel(stage)}
      </Text>

      {stage === "files" ? (
        <FilesStage files={files} included={included} cursor={cursor} width={innerWidth} />
      ) : null}

      {stage === "type" ? (
        <TypeStage typeIdx={typeIdx} suggested={suggestedTypeName} />
      ) : null}

      {stage === "scope" ? (
        <Field
          label="Scope"
          value={scope}
          placeholder={
            inferredScope ? `${inferredScope} (suggested — enter to accept)` : "(optional)"
          }
        />
      ) : null}

      {stage === "subject" ? (
        <Box flexDirection="column">
          <Field label="Subject" value={subject} placeholder="short imperative summary" />
          {subject.length > 0 && subjectValidation.warnings.length > 0 ? (
            <Box flexDirection="column" marginTop={1}>
              {subjectValidation.warnings.map((w, i) => (
                <Text key={i} color={color("warning")}>
                  {glyphs.warn} {w}
                </Text>
              ))}
            </Box>
          ) : null}
        </Box>
      ) : null}

      {stage === "body" ? (
        <Field label="Body" value={body} placeholder="(optional — enter to skip)" />
      ) : null}

      {/* Live header preview on the composition stages */}
      {stage === "type" || stage === "scope" || stage === "subject" || stage === "body" ? (
        <Box marginTop={1}>
          <Text color={color("dim")}>Preview  </Text>
          <Text color={color("success")} bold>
            {sanitizeForDisplay(header)}
          </Text>
        </Box>
      ) : null}

      {stage === "preview" ? (
        <PreviewStage
          message={buildCommitMessage(draft)}
          stagedCount={workingTree.staged.length}
          commandPreview={props.commandPreview}
          width={innerWidth}
        />
      ) : null}

      {stage === "committing" ? (
        <Box marginTop={1}>
          <Text color={color("primary")}>Committing…</Text>
        </Box>
      ) : null}

      {stage === "result" ? <ResultStage result={result!} width={innerWidth} /> : null}

      <Box marginTop={1}>
        <Text color={color("dim")}>{footerFor(stage, result?.ok, breaking)}</Text>
      </Box>
    </Box>
  );
}

function stageLabel(stage: Stage): string {
  return {
    files: "select files",
    type: "type",
    scope: "scope",
    subject: "subject",
    body: "body",
    preview: "preview",
    committing: "committing",
    result: "done",
  }[stage];
}

function footerFor(stage: Stage, ok: boolean | undefined, breaking: boolean): string {
  switch (stage) {
    case "files":
      return "space stage/unstage   a all   enter continue   esc cancel";
    case "type":
      return "↑↓ choose   enter next   esc cancel";
    case "scope":
      return "type scope   enter next   tab back   esc cancel";
    case "subject":
      return `type subject   ctrl-b breaking${breaking ? " (on)" : ""}   enter next   esc cancel`;
    case "body":
      return "optional body   enter to preview   tab back   esc cancel";
    case "preview":
      return "enter commit   e edit   esc cancel";
    case "committing":
      return "";
    case "result":
      return ok ? "enter done" : "r retry   enter close";
  }
}

function FilesStage(props: {
  files: ReturnType<typeof stageableFiles>;
  included: Set<string>;
  cursor: number;
  width: number;
}) {
  const color = useColor();
  const { glyphs } = useTheme();
  if (props.files.length === 0)
    return (
      <Box marginTop={1}>
        <Text color={color("dim")}>No changes to stage.</Text>
      </Box>
    );
  return (
    <Box flexDirection="column" marginTop={1}>
      {props.files.slice(0, 14).map((f, i) => {
        const on = props.included.has(f.path);
        const sel = i === props.cursor;
        return (
          <Box key={f.path} width={props.width}>
            <Box width={2}>
              <Text color={color("primary")}>{sel ? glyphs.arrow : " "}</Text>
            </Box>
            <Box width={4}>
              <Text color={on ? color("primary") : color("dim")}>{on ? "[x]" : "[ ]"} </Text>
            </Box>
            <Box flexGrow={1}>
              <Text color={sel ? color("primary") : color("text")} wrap="truncate">
                {sanitizeForDisplay(f.path)}
              </Text>
            </Box>
            <Text color={color("dim")}>{f.status}</Text>
          </Box>
        );
      })}
      <Box marginTop={1}>
        <Text color={color("dim")}>
          {[...props.included].length} file(s) will be committed
        </Text>
      </Box>
    </Box>
  );
}

function TypeStage(props: { typeIdx: number; suggested: string | null }) {
  const color = useColor();
  return (
    <Box flexDirection="column" marginTop={1}>
      {COMMIT_TYPES.map((t, i) => {
        const sel = i === props.typeIdx;
        const isSuggested = t.name === props.suggested;
        return (
          <Box key={t.name}>
            <Box width={2}>
              <Text color={color("primary")}>{sel ? ">" : " "}</Text>
            </Box>
            <Box width={10}>
              <Text color={sel ? color("primary") : color("text")} bold={sel}>
                {t.name}
              </Text>
            </Box>
            <Text color={color("dim")}>{t.description}</Text>
            {isSuggested ? <Text color={color("accent")}>  ← suggested</Text> : null}
          </Box>
        );
      })}
    </Box>
  );
}

function Field(props: { label: string; value: string; placeholder: string }) {
  const color = useColor();
  return (
    <Box marginTop={1}>
      <Box width={12}>
        <Text color={color("dim")}>{props.label}</Text>
      </Box>
      <Text color={color("text")}>{sanitizeForDisplay(props.value)}</Text>
      <Text color={color("primary")}>▏</Text>
      {props.value.length === 0 ? (
        <Text color={color("dim")}>{props.placeholder}</Text>
      ) : null}
    </Box>
  );
}

function PreviewStage(props: {
  message: string;
  stagedCount: number;
  commandPreview: boolean;
  width: number;
}) {
  const color = useColor();
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={color("border")}
        paddingX={1}
      >
        {props.message.trimEnd().split("\n").map((line, i) => (
          <Text key={i} color={i === 0 ? color("success") : color("text")} bold={i === 0}>
            {sanitizeForDisplay(line) || " "}
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color={color("dim")}>{props.stagedCount} staged file(s)</Text>
      </Box>
      {props.commandPreview ? (
        <Text color={color("dim")}>git commit -F -  (message on stdin; hooks run)</Text>
      ) : null}
    </Box>
  );
}

function ResultStage(props: { result: CommitResult; width: number }) {
  const color = useColor();
  const { glyphs } = useTheme();
  const { result } = props;
  if (result.ok) {
    return (
      <Box marginTop={1}>
        <Text color={color("success")} bold>
          {glyphs.check} Committed{" "}
        </Text>
        <Text color={color("text")}>
          {result.shortSha ? `${result.shortSha}  ` : ""}
          {sanitizeForDisplay(result.subject ?? "")}
        </Text>
      </Box>
    );
  }
  const detail = (result.raw ?? result.error?.raw ?? "").split("\n").slice(0, 6);
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={color("danger")} bold>
        {glyphs.cross} Commit failed{result.error ? ` — ${result.error.message}` : ""}
      </Text>
      {detail.length ? (
        <Box flexDirection="column" marginTop={1}>
          {detail.map((l, i) => (
            <Text key={i} color={color("dim")}>
              {sanitizeForDisplay(l)}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
