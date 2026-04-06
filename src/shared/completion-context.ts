/**
 * CompletionContext — discriminated union describing what kind of completion
 * is needed at the current cursor position in the REPL buffer.
 *
 * Produced by the Language Service utility process and consumed by the REPL
 * Intelligence Layer in the main process.
 */

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

/** A variable visible in the current REPL session with its inferred type. */
export interface SessionVariable {
  name: string;
  /** TypeScript type name inferred from session source, e.g. "SampleResult". */
  inferredType?: string;
}

/** A resolved TypeScript type with its known property/method names. */
export interface TypeInfo {
  name: string;
  /** Property names available on this type (for OptionsCompleter). */
  properties?: string[];
}

/** Information about the function/method being called at the cursor. */
export interface CalleeInfo {
  /** Method or function name, e.g. "read" or "onsetSlice". */
  name: string;
  /** Name of the receiver, e.g. "sn" for `sn.read(...)`. */
  parentName?: string;
  /** Resolved type of the receiver, e.g. "SampleNamespace". */
  parentType?: string;
  /** 0-based index of the argument at cursor. */
  paramIndex: number;
}

// ---------------------------------------------------------------------------
// Base context (common fields in every variant)
// ---------------------------------------------------------------------------

interface BaseContext {
  /** Full buffer text submitted for completion. */
  buffer: string;
  /** Cursor offset (character count from buffer start). */
  cursor: number;
  /** User-defined variables inferred from the accumulated session source. */
  sessionVariables: SessionVariable[];
}

// ---------------------------------------------------------------------------
// Context variants
// ---------------------------------------------------------------------------

/**
 * Cursor is at an identifier position — completing a root-level name
 * (namespace, global function, or session variable).
 */
export interface IdentifierContext extends BaseContext {
  position: {
    kind: "identifier";
    /** Characters already typed (possibly empty). */
    prefix: string;
  };
}

/**
 * Cursor is after a `.` — completing a property or method on an object.
 */
export interface PropertyAccessContext extends BaseContext {
  position: {
    kind: "propertyAccess";
    /** Name of the receiver expression, e.g. "sn". */
    objectName: string;
    /** Resolved type of the receiver (if determinable). */
    resolvedType?: TypeInfo;
    /** Characters already typed after the `.`. */
    prefix: string;
  };
}

/**
 * Cursor is inside a function argument list but NOT in a string or object
 * literal — completing a typed value (e.g. a Sample variable).
 */
export interface CallArgumentContext extends BaseContext {
  position: {
    kind: "callArgument";
    callee: CalleeInfo;
    /** Characters already typed for the current argument. */
    prefix: string;
  };
}

/**
 * Cursor is completing a key inside an object literal argument.
 */
export interface ObjectLiteralKeyContext extends BaseContext {
  position: {
    kind: "objectLiteralKey";
    callee: CalleeInfo;
    /** Keys already present in the object literal (to exclude from suggestions). */
    alreadyPresentKeys: string[];
    /** Characters already typed for the current key. */
    prefix: string;
  };
}

/**
 * Cursor is inside a string literal argument — completing a file path or
 * sample hash depending on the `@param` kind registered for this position.
 */
export interface StringLiteralContext extends BaseContext {
  position: {
    kind: "stringLiteral";
    callee: CalleeInfo;
    /** Characters already typed inside the string. */
    prefix: string;
  };
}

/**
 * No meaningful completion context could be determined.
 */
export interface NoneContext extends BaseContext {
  position: { kind: "none" };
}

// ---------------------------------------------------------------------------
// Union
// ---------------------------------------------------------------------------

export type CompletionContext =
  | IdentifierContext
  | PropertyAccessContext
  | CallArgumentContext
  | ObjectLiteralKeyContext
  | StringLiteralContext
  | NoneContext;
