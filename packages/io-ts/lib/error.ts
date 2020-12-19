import * as t from 'io-ts'

// TODO: replace with the built-in PathReporter.report
export function validationErrors(
  typeAlias: string,
  errors: t.Errors,
): string {
    /**
     * Inspired by
     * https://github.com/mmkal/ts/blob/94a9ba8f2931c9c91122d00b0bf1bd21b2be05cd/packages/io-ts-extra/src/reporters.ts#L11.
     */
    return errors.map((error) => {
        const name = typeAlias || error.context[0]?.type.name;
        const lastType = error.context.length && error.context[error.context.length - 1].type.name;
        const path = name + error.context.map((c) => c.key).join('.');
        return `Invalid value '${JSON.stringify(error.value)}' supplied to ${path}, expected ${lastType}.`;
    }).join('\n');
}
