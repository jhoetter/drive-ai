import { nanoid } from "nanoid";

export function newId(_hint?: string) {
  return nanoid(21);
}

export function newPrefixed(prefix: string) {
  return `${prefix}_${nanoid(16)}`;
}
