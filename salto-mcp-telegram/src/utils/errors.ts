export interface NormalizedError {
  ok: false;
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

export const ErrorCodes = {
  INTERNAL_ERROR: "INTERNAL_ERROR",
  INVALID_JSON: "INVALID_JSON",
  INVALID_REQUEST: "INVALID_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  TELEGRAM_CHAT_NOT_ALLOWED: "TELEGRAM_CHAT_NOT_ALLOWED",
  TELEGRAM_CHAT_NOT_FOUND: "TELEGRAM_CHAT_NOT_FOUND",
  TELEGRAM_FORBIDDEN: "TELEGRAM_FORBIDDEN",
  TELEGRAM_BAD_REQUEST: "TELEGRAM_BAD_REQUEST",
  TELEGRAM_API_ERROR: "TELEGRAM_API_ERROR",
  TELEGRAM_MESSAGE_NOT_DELIVERED: "TELEGRAM_MESSAGE_NOT_DELIVERED",
  TELEGRAM_DOCUMENT_TOO_LARGE: "TELEGRAM_DOCUMENT_TOO_LARGE",
  FILE_INVALID_SOURCE: "FILE_INVALID_SOURCE",
  FILE_DOWNLOAD_FAILED: "FILE_DOWNLOAD_FAILED"
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

const DEFAULT_ERROR_CODE: ErrorCode = ErrorCodes.INTERNAL_ERROR;

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  toResponse(): NormalizedError {
    return {
      ok: false,
      status: this.statusCode,
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {})
    };
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;

export const normalizeError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(500, DEFAULT_ERROR_CODE, error.message);
  }

  return new AppError(500, DEFAULT_ERROR_CODE, "Unknown error");
};

export const toErrorResponse = (error: unknown): NormalizedError => normalizeError(error).toResponse();
