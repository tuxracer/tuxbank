# Project Name

See [README.md](README.md) for installation prerequisites, API documentation, and usage examples. See [docs/TRD.md](docs/TRD.md) for technical details.

**Repository URL**: https://github.com/tuxracer/REPOSITORY-NAME-HERE

## Source Structure

Each module is a directory named after its primary export, containing `index.ts` and optionally `consts.ts` for module-specific constants, `types.ts` for type definitions and type guards, and `tests.ts` for related tests.

## Commands

```bash
pnpm dev        # Run in development mode (tsx)
pnpm build      # Build for production (tsup → dist/)
pnpm start      # Run built version
pnpm test       # Run tests (vitest)
pnpm check      # Format, lint, and typecheck (run before commits)
```

**Important**: Always run `pnpm run check` before commits to ensure code is properly formatted, linted, and type-safe. Do not run formatting, linting, or typechecking separately.

**Documentation**: When making major changes (architecture, new modules, API changes, file structure), update [docs/TRD.md](docs/TRD.md) to keep the technical reference accurate.

## Tech Stack

## Coding Standards

- **Never log sensitive data**: Do not log API keys, tokens, passwords, or other secrets. Use placeholder text like `[REDACTED]` if you need to indicate a value exists without revealing it
- **Package manager**: Use `pnpm` for all package management (install, add, remove, etc.)
- **ESM imports only**: Always use `import` syntax, never `require()`. This is an ESM project and `require` will throw `ReferenceError: require is not defined`
- **Arrow functions**: Use `const foo = () => { ... }` (enforced by ESLint, auto-fixable)
- **Reserve `use` prefix for React hooks**: The `useFoo` naming convention is reserved for React hooks. For boolean options or flags, use names like `systemFont`, `enableCache`, or `withValidation` instead of `useSystemFont`, `useCache`, or `useValidation`
- **Named imports**: Use `import { pipe, filter } from 'remeda'` not `import * as R` (tree-shaking)
- **React context over prop drilling**: For app-wide state that's needed across many components (e.g., capabilities, settings), use React context instead of passing props through multiple levels. See `src/ui/AppCapabilities` for an example. This keeps component interfaces clean and avoids threading props through intermediate components that don't use them.
- **Remeda utilities**: Prefer for array/object manipulation over manual loops where it improves readability without hurting performance (e.g., `flatMap` to flatten nested loops, `find` for searching, `sortBy` for sorting)
- **Named constants**: Use `const HEADER_SIZE = 16` not magic numbers
- **Numeric separators**: Use underscore separators for numbers 1000 and above for readability (`1_500`, `44_100`, `100_000`)
- **DRY (Don't Repeat Yourself)**: When a pattern appears 3+ times, extract it into a helper function. Place shared utilities in `src/utils/` (e.g., `src/utils/findLibrary/index.ts`). This improves readability and maintainability without impacting performance
- **Module structure**: Always create modules as directories with `index.ts`, never as single `moduleName.ts` files. Name the directory after the primary export (class, function, or concept). This provides a consistent location for related files:

  ```
  # GOOD - directory structure allows for growth
  src/
    TitleScreen/
      index.ts       # exports showTitleScreen()
      tests.ts       # tests for the module
      consts.ts      # LOGO, PROMPT_TEXT, etc.
    Game/
      index.ts       # exports Game class
      consts.ts      # TICK_RATE, MAX_SPEED, etc.
      types.ts       # GameState, GameConfig interfaces

  # BAD - single files have nowhere for related code to go
  src/
    TitleScreen.ts
    Game.ts
  ```

  Standard files within a module directory:

  - `index.ts` - Main module implementation, exports, and re-exports types/consts
  - `tests.ts` - Tests for the module
  - `consts.ts` - Module-specific constants
  - `types.ts` - Module-specific type definitions and their type guards (if needed)

- **Re-export types and consts from index.ts**: Each module's `index.ts` should re-export all types and consts from `types.ts` and `consts.ts`. External code should import from the module, not directly from internal files:

  ```typescript
  // GOOD - import from the module
  import { TICK_RATE, GameState } from "../Game";

  // BAD - importing directly from internal module files
  import { TICK_RATE } from "../Game/consts";
  import type { GameState } from "../Game/types";
  ```

  In `Game/index.ts`:

  ```typescript
  export * from "./consts";
  export * from "./types";
  ```

- **Avoid barrel-only files**: Don't create `index.ts` files that only re-export from child modules. Import directly from the specific module instead (e.g., `import { useGamepad } from '../hooks/useGamepad'` not `from '../hooks'`).
- **JSDoc**: Skip `@param`/`@returns` tags (TypeScript provides types); use inline comments if needed
- **Loading indicators**: Delay by ~1 second to avoid flash for fast operations
- **Intl API**: Prefer `Intl.DateTimeFormat`, `Intl.NumberFormat`, etc. over manual formatting for dates, numbers, and currencies
- **Explicit conditionals for derived values**: When a value like `useTrueColor` is derived from another value like `limitColors`, use the source value in conditionals, not the derived value. This makes the logic clearer and avoids confusion:

  ```typescript
  // GOOD - explicit about what each branch handles
  if (this.limitColors === 16) {
    /* ANSI 16 */
  } else if (this.limitColors === 256) {
    /* ANSI 256 */
  } else {
    /* True color (limitColors === 0) */
  }

  // BAD - confusing because useTrueColor is derived from limitColors
  if (this.limitColors === 16) {
    /* ANSI 16 */
  } else if (this.useTrueColor) {
    /* True color */
  } else {
    /* ANSI 256 */
  }
  ```

- **Type guards over type assertions**: Never use `as` type assertions on values with unknown runtime types. Use type guards from Remeda (`isString`, `isNumber`, `isBoolean`, `isPlainObject`) or create a new custom type guard if none exist:

  ```typescript
  // GOOD - type guard validates at runtime
  import { isString } from "remeda";

  if (isString(value)) {
    config.name = value;
  }

  // BAD - blind cast assumes type without validation
  config.name = value as string;
  ```

  For union types (e.g., `"kitty" | "terminal" | "ascii"`), create a type guard that validates the actual values, not just the primitive type:

  ```typescript
  // GOOD - validates the value is one of the allowed options
  import { isPostProcessingMode } from "../VideoConfig";

  if (isPostProcessingMode(value)) {
    config.video_postprocessing_mode = value; // No cast needed
  }

  // BAD - isString only checks primitive type, not valid union values
  if (isString(value)) {
    config.video_postprocessing_mode = value as PostProcessingMode; // Still a blind cast!
  }
  ```

  When creating type guards for union types, use the named type in the return type annotation - don't hardcode the union:

  ```typescript
  // GOOD - uses the named type
  import type { VideoDriver } from "../frontend/config";

  const VIDEO_DRIVERS: readonly VideoDriver[] = [
    "kitty",
    "terminal",
    "ascii",
    "emoji",
  ];

  export const isVideoDriver = (value: unknown): value is VideoDriver => {
    return isString(value) && VIDEO_DRIVERS.includes(value as VideoDriver);
  };

  // BAD - hardcodes the union type (duplicates the type definition)
  export const isVideoDriver = (
    value: unknown
  ): value is "kitty" | "terminal" | "ascii" | "emoji" => {
    // ...
  };
  ```

- **Typed errors over string messages**: When throwing errors, create a custom error class with a typed `code` property instead of using plain `Error` with string messages. This enables type-safe error handling:

  ```typescript
  // GOOD - typed error with machine-readable code
  type MyErrorCode = "NOT_FOUND" | "PERMISSION_DENIED" | "TIMEOUT";

  class MyError extends Error {
    readonly code: MyErrorCode;
    constructor(code: MyErrorCode) {
      super(code);
      this.name = "MyError";
      this.code = code;
    }
  }

  const isMyError = (error: unknown): error is MyError => {
    return error instanceof MyError;
  };

  // Usage - callers get autocomplete and type checking
  try {
    await doSomething();
  } catch (error) {
    if (isMyError(error)) {
      switch (error.code) {
        case "NOT_FOUND": // TypeScript knows valid codes
        // ...
      }
    }
  }

  // BAD - string messages aren't type-safe
  throw new Error("Not found");
  throw new Error("Permission denied");
  ```

- **Tests verify behavior, not implementation**: Tests should verify that code works correctly, not enshrine implementation details. Never write tests that just check constant values - if a constant matters, test the behavior it affects:

  ```typescript
  // BAD - tests implementation detail, provides no value
  it("should have expected default value", () => {
    expect(MAX_FRAMES_BEHIND).toBe(60);
  });

  // GOOD - tests actual behavior that depends on the constant
  it("should trigger catchup when too far behind", () => {
    // Simulate being far behind and verify the sync behavior
    for (let i = 0; i < 70; i++) {
      syncManager.advanceFrame();
    }
    expect(syncManager.needsCatchup).toBe(true);
  });
  ```
