// ID generation utilities (UUIDs, ULIDs)
import { randomUUID } from "crypto";

export const generateId = (): string => {
  return randomUUID();
};

// TODO: Add ULID generation if needed
// import { ulid } from 'ulid';
// export const generateUlid = (): string => ulid();
