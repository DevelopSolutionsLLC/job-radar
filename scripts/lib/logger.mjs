const LEVELS = { info: 'INFO', warn: 'WARN', error: 'ERROR', fatal: 'FATAL' };

function write(level, msg) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}`;
  if (level === 'ERROR' || level === 'FATAL') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

export const log = {
  /** @param {string} msg */ info:  (msg) => write(LEVELS.info,  msg),
  /** @param {string} msg */ warn:  (msg) => write(LEVELS.warn,  msg),
  /** @param {string} msg */ error: (msg) => write(LEVELS.error, msg),
  /** @param {string} msg */ fatal: (msg) => { write(LEVELS.fatal, msg); process.exit(1); },
};
