export interface SerializedBounceError {
  name: "BounceError";
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class BounceError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "BounceError";
    this.code = code;
    this.details = details;
  }

  serialize(): SerializedBounceError {
    const obj: SerializedBounceError = {
      name: "BounceError",
      code: this.code,
      message: this.message,
    };
    if (this.details !== undefined) {
      obj.details = this.details;
    }
    return obj;
  }

  static deserialize(obj: SerializedBounceError): BounceError {
    return new BounceError(obj.code, obj.message, obj.details);
  }
}
