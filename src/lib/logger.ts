import pino from 'pino';

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info');

export const logger = pino({
  level,
  transport:
    process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  redact: {
    paths: [
      'apiKey',
      'encryptedApiKey',
      'password',
      'passwordHash',
      'token',
      'secret',
      'authorization',
      '*.apiKey',
      '*.encryptedApiKey',
      '*.password',
      '*.token',
      '*.secret',
    ],
    censor: '[REDACTED]',
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});

export function createChildLogger(module: string) {
  return logger.child({ module });
}
