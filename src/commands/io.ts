/** Output sinks for non-interactive commands, injectable for tests. */
export interface CommandIO {
  out: (text: string) => void;
  err: (text: string) => void;
}

export const processIO: CommandIO = {
  out: (text) => void process.stdout.write(text),
  err: (text) => void process.stderr.write(text),
};

export function writeJson(io: CommandIO, value: unknown): void {
  io.out(`${JSON.stringify(value, null, 2)}\n`);
}
