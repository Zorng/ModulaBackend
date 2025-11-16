// Typed domain errors
export class DomainError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "DomainError";
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, id: string) {
    super(`${resource} with id ${id} not found`, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, "CONFLICT");
    this.name = "ConflictError";
  }
}

export class ForbiddenError extends DomainError {
  constructor(message: string) {
    super(message, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, public readonly details?: unknown) {
    super(message, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}
