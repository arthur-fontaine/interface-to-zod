import { CallExpression, Identifier, Node, Project, SourceFile, SyntaxKind, Type } from "ts-morph";
import { z } from "zod/v4";
import * as path from "node:path";
import * as fs from "node:fs";
import * as util from "node:util";

type GenericZodObject<T extends Record<string, any>> = z.ZodObject<{
  [K in keyof T]-?: undefined extends T[K] ? z.ZodOptional<z.ZodType<NonNullable<T[K]>>> : z.ZodType<T[K]>;
}>

/**
 * Configuration options for schema generation
 */
export interface ZodSchemaGeneratorOptions {
  /** Properties to ignore smart detection (z.email(), z.url(), etc.) */
  excludedSmartDetections?: string[];
  /** Custom type generators as [pattern, replacement] where replacement is a string evaluated as Zod schema */
  customTypeGenerators?: [RegExp | string, `z.${string}(${string}`][];
}

/**
 * Main class for generating Zod schema from TypeScript interfaces
 */
class ZodSchemaInterfaceGenerator {
  private project: Project | null = null;
  private sourceFiles = new Map<string, SourceFile>();

  /**
   * Initialize TypeScript project with tsconfig
   */
  private initProject(filePath: string): Project {
    if (this.project) return this.project;

    // Find the tsconfig.json file
    const tsConfigPath = this.findTsConfig(filePath);

    this.project = new Project({
      tsConfigFilePath: tsConfigPath,
    });

    return this.project;
  }

  /**
   * Search for tsconfig.json starting from the given file path
   */
  private findTsConfig(startPath: string): string | undefined {
    let currentDir = path.dirname(startPath);

    while (currentDir !== path.dirname(currentDir)) {
      const tsConfigPath = path.join(currentDir, 'tsconfig.json');
      if (fs.existsSync(tsConfigPath)) {
        return tsConfigPath;
      }
      currentDir = path.dirname(currentDir);
    }

    // Fallback: ts-morph will use default configuration
    console.warn('⚠️  tsconfig.json not found, using default configuration');
    return undefined;
  }

  /**
   * Get or load a source file
   */
  private getSourceFile(filePath: string): SourceFile {
    if (this.sourceFiles.has(filePath)) {
      return this.sourceFiles.get(filePath)!;
    }

    const project = this.initProject(filePath);

    // Add source file if not already in project
    let sourceFile = project.getSourceFile(filePath);
    if (!sourceFile) {
      sourceFile = project.addSourceFileAtPath(filePath);
    }

    this.sourceFiles.set(filePath, sourceFile);
    return sourceFile;
  }

  /**
   * Generate Zod schema for a TypeScript type
   */
  private generateZodSchema(
    type: Type,
    sourceFile: SourceFile,
    options: ZodSchemaGeneratorOptions,
    depth = 0,
    visited = new Set<string>(),
    propName?: string
  ): string {
    const indent = "  ".repeat(depth);

    // Handle arrays
    if (type.isArray()) {
      const elementSchema = this.generateZodSchema(
        type.getArrayElementTypeOrThrow(),
        sourceFile,
        options,
        depth,
        visited
      );
      return `z.array(${elementSchema})`;
    }

    // Handle literals
    if (type.isLiteral() || type.isStringLiteral()) {
      return `z.literal(${JSON.stringify(type.getLiteralValue())})`;
    }

    // Handle enum literals
    if (type.isEnumLiteral()) {
      return `z.enum(${type.getSymbolOrThrow().getName()})`;
    }

    const text = type.getText();

    // Handle excluded types
    if (options.customTypeGenerators) {
      for (const [pattern, replacement] of options.customTypeGenerators) {
        if ((typeof pattern === 'string' && text === pattern) ||
            (pattern instanceof RegExp && pattern.test(text))) {
          return replacement;
        }
      }
    }

    // Handle primitive types with string formats
    if (text === "string") {
      if (options.excludedSmartDetections?.includes(propName || "")) {
        return "z.string()";
      }
      if (propName) {
        const lowerProp = propName.toLowerCase();
        if (lowerProp.includes("email")) return "z.email()";
        if (lowerProp.includes("url")) return "z.url()";
      }
      return "z.string()";
    }
    if (text === "number") {
      return "z.number()";
    }
    if (text === "boolean") {
      return "z.boolean()";
    }
    if (text === "Date") {
      return "z.date()";
    }
    if (text === "null") {
      return "z.null()";
    }
    if (text === "undefined") {
      return "z.undefined()";
    }
    if (text === "void") {
      return "z.void()";
    }
    if (text === "any") {
      return "z.any()";
    }
    if (text === "unknown") {
      return "z.unknown()";
    }
    if (text === "never") {
      return "z.never()";
    }

    // Handle union types
    if (type.isUnion()) {
      const unionTypes = type.getUnionTypes();
      const schemaValues = unionTypes
        .map(t => this.generateZodSchema(t, sourceFile, options, depth, visited))
        .join(", ");
      return `z.union([${schemaValues}])`;
    }

    const apparent = type.getApparentType();
    const key = apparent.getText();

    // Prevent infinite recursion
    if (visited.has(key)) return "{}";
    visited.add(key);

    // Handle Record types
    if (type.getAliasSymbol()?.getName() === "Record") {
      const [keyType, valueType] = type.getAliasTypeArguments();
      if (!keyType || !valueType) {
        visited.delete(key);
        return "{}";
      }
      const keySchema = this.generateZodSchema(keyType, sourceFile, options, depth + 1, visited);
      const valueSchema = this.generateZodSchema(valueType, sourceFile, options, depth + 1, visited);
      return `z.record(${keySchema}, ${valueSchema})`;
    }

    // Handle object types
    const props = apparent.getProperties();
    if (props.length === 0) {
      visited.delete(key);
      return "{}";
    }

    const lines = props
      .filter(prop => !/^__@.+@\d+$/.test(prop.getName()))
      .map(prop => {
        const propName = prop.getName();
        const propType = prop.getTypeAtLocation(sourceFile);
        const optional = prop.isOptional?.() ?? false;

        let valueSchema = this.generateZodSchema(propType, sourceFile, options, depth + 1, visited, propName);
        if (optional) {
          valueSchema = `z.optional(${valueSchema})`;
        }

        return `${indent}  ${JSON.stringify(propName)}: ${valueSchema},`;
      })
      .filter(Boolean);

    visited.delete(key);
    return `z.object({
${lines.join("\n")}
${indent}})`;
  }

  /**
   * Create a Zod schema generator function for a TypeScript interface
   */
  generateZodSchemaFunction<T extends Record<string, any>>(
    interfaceName: string,
    filePath: string,
    options: ZodSchemaGeneratorOptions = {}
  ): GenericZodObject<T> {
    const sourceFile = this.getSourceFile(filePath);

    const iface = sourceFile.getInterface(interfaceName);
    if (!iface) {
      throw new Error(`Interface '${interfaceName}' not found in ${path.basename(filePath)}`);
    }

    const schemaGenerator = `
      function create${interfaceName}ZodSchema() {
        return ${this.generateZodSchema(iface.getType(), sourceFile, options)};
      }

      return create${interfaceName}ZodSchema();
    `;

    return new Function('z', schemaGenerator)(z);
  }

  /**
   * Automatically detect caller information and generate Zod schema
   */
  generateZodSchemaFromCallSite<T extends Record<string, any>>(options: ZodSchemaGeneratorOptions = {}): GenericZodObject<T> {
    const callSites = util.getCallSites();

    if (callSites.length < 2) {
      throw new Error('Unable to detect caller information');
    }

    // Get the caller's call site (skip the current function)
    const fileName = typeof __filename === 'string' ? __filename : import.meta.filename;
    const callerSite = callSites.find(site => site.scriptName !== fileName && site.scriptName !== `file://${fileName}`);
    if (!callerSite) {
      throw new Error('Unable to find caller information');
    }
    const scriptName = callerSite.scriptName.replace(/^file:\/\//, '');
    const lineNumber = callerSite.lineNumber;
    const columnNumber = callerSite.columnNumber;

    if (!scriptName || !lineNumber) {
      throw new Error('Unable to get caller file information');
    }

    // Read the source file to extract the type parameter
    const sourceContent = fs.readFileSync(scriptName, 'utf8');
    const filePath = scriptName;

    // Try to find the interface in the current file first
    const sourceFile = this.getSourceFile(filePath);
    let nodeFound: Identifier | undefined;
    sourceFile.forEachDescendant((node) => {
      const start = node.getStart();
      const end = node.getEnd();

      const startPos = sourceFile.getLineAndColumnAtPos(start);
      const endPos = sourceFile.getLineAndColumnAtPos(end);

      // Check if the line and column number fall within the node's range
      if (
        (startPos.line <= lineNumber && lineNumber <= endPos.line) &&
        (startPos.line < lineNumber || startPos.column <= columnNumber) &&
        (endPos.line > columnNumber || endPos.column >= columnNumber)
      ) {
        nodeFound = node as Identifier; // It automatically gets the last matching node, which is our function call
      }
    });
    if (!nodeFound) {
      throw new Error(`Unable to find interface declaration at ${lineNumber}:${columnNumber} in ${path.basename(filePath)}`);
    }
    if (!(nodeFound instanceof Identifier)) {
      throw new Error(`Expected an identifier at ${lineNumber}:${columnNumber} in ${path.basename(filePath)}`);
    }
    const callExpression = nodeFound.getFirstAncestorByKindOrThrow(SyntaxKind.CallExpression);
    if (!callExpression) {
      throw new Error(`Expected a call expression at ${lineNumber}:${columnNumber} in ${path.basename(filePath)}`);
    }
    const typeArguments = callExpression.getTypeArguments();
    if (typeArguments.length === 0) {
      throw new Error(`No type arguments found in call expression at ${lineNumber}:${columnNumber} in ${path.basename(filePath)}`);
    }
    if (typeArguments.length > 1) {
      throw new Error(`Multiple type arguments found in call expression at ${lineNumber}:${columnNumber} in ${path.basename(filePath)}`);
    }
    const typeArg = typeArguments[0].getType();

    const interfaceSymbol = typeArg.getSymbol();
    if (!interfaceSymbol) {
      throw new Error(`No symbol found for interface at ${lineNumber}:${columnNumber} in ${path.basename(filePath)}`);
    }
    const declarations = interfaceSymbol.getDeclarations();
    if (declarations.length === 0) {
      throw new Error(`No declarations found for interface at ${lineNumber}:${columnNumber} in ${path.basename(filePath)}`);
    }
    if (declarations.length > 1) {
      throw new Error(`Multiple declarations found for interface at ${lineNumber}:${columnNumber} in ${path.basename(filePath)}`);
    }
    const declaration = declarations[0];
    if (!declaration.isKind(SyntaxKind.InterfaceDeclaration)) {
      throw new Error(`Expected an interface declaration for at ${lineNumber}:${columnNumber} in ${path.basename(filePath)}`);
    }

    const declarationFilePath = declaration.getSourceFile().getFilePath();
    const interfaceName = interfaceSymbol.getName();

    return this.generateZodSchemaFunction<T>(interfaceName, declarationFilePath, options);
  }

  /**
   * Resolve import path to absolute file path
   */
  private resolveImportPath(moduleSpecifier: string, fromFile: string): string | null {
    try {
      const fromDir = path.dirname(fromFile);

      // Handle relative imports
      if (moduleSpecifier.startsWith('./') || moduleSpecifier.startsWith('../')) {
        const resolvedPath = path.resolve(fromDir, moduleSpecifier);

        // Try different extensions
        const extensions = ['.ts', '.tsx', '.js', '.jsx'];
        for (const ext of extensions) {
          const fullPath = resolvedPath + ext;
          if (fs.existsSync(fullPath)) {
            return fullPath;
          }
        }

        // Try index file
        for (const ext of extensions) {
          const indexPath = path.join(resolvedPath, 'index' + ext);
          if (fs.existsSync(indexPath)) {
            return indexPath;
          }
        }
      }

      // Handle absolute imports (would need more complex resolution)
      return null;
    } catch (error) {
      return null;
    }
  }
}

// Singleton instance
const generator = new ZodSchemaInterfaceGenerator();

/**
 * Creates a function to generate Zod schema from a TypeScript interface.
 *
 * @param interfaceName Name of the interface to generate Zod schema for
 * @param filePath Path to the file containing the interface (use __filename)
 * @param options Generation options
 * @returns A Zod schema
 *
 * @example
 * ```typescript
 * interface User {
 *   id: string;
 *   name: string;
 *   email: string;
 * }
 *
 * const UserSchema = interfaceToZod<IUser>("User", __filename);
 * const user = UserSchema.parse({})
 * ```
 */
 export function interfaceToZod<T extends Record<string, any>>(options?: ZodSchemaGeneratorOptions): GenericZodObject<T>
 export function interfaceToZod<T extends Record<string, any>>(
   interfaceName?: string,
   filePath?: string,
   options?: ZodSchemaGeneratorOptions
 ): GenericZodObject<T>
 export function interfaceToZod<T extends Record<string, any>>(
   interfaceName: string,
   filePath: string,
   options?: ZodSchemaGeneratorOptions
 ): GenericZodObject<T>
export function interfaceToZod<T extends Record<string, any>>(
  interfaceNameOrOptions?: string | ZodSchemaGeneratorOptions,
  filePath?: string,
  options_: ZodSchemaGeneratorOptions = {}
) {
  const options = typeof interfaceNameOrOptions === 'string' ? options_ : (interfaceNameOrOptions || {});
  const interfaceName = typeof interfaceNameOrOptions === 'object' ? undefined : interfaceNameOrOptions;
  if (interfaceName === undefined || filePath === undefined) {
    return generator.generateZodSchemaFromCallSite<T>(options);
  }
  return generator.generateZodSchemaFunction(interfaceName, filePath, options);
}

// Default export for convenience
export default interfaceToZod;
