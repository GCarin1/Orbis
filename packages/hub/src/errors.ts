// The single error shape of contracts/hub-surface § Authentication.
import type { ApiErrorBody } from "@orbis/shared";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "HttpError";
  }

  toBody(): ApiErrorBody {
    return {
      error: { code: this.code, message: this.message, ...(this.fields ? { fields: this.fields } : {}) },
    };
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) =>
  new HttpError(400, "invalid_request", message, fields);
export const unauthorized = () => new HttpError(401, "unauthorized", "missing or invalid token");
export const notFound = (what: string) => new HttpError(404, "not_found", `${what} not found`);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);
export const unprocessable = (code: string, message: string) => new HttpError(422, code, message);
