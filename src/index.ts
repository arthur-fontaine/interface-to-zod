import { Project, SourceFile, Type } from "ts-morph";
import { z } from "zod/v4";
import * as path from "path";
import * as fs from "fs";

/**
 * Configuration options for schema generation
 */
export interface ZodSchemaGeneratorOptions {
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

    // Handle primitive types with string formats
    if (text === "string") {
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
  generateZodSchemaFunction<T>(
    interfaceName: string,
    filePath: string,
    options: ZodSchemaGeneratorOptions = {}
  ): z.ZodType<T> {
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
export function interfaceToZod<T>(
  interfaceName: string,
  filePath: string,
  options: ZodSchemaGeneratorOptions = {}
): z.ZodType<T> {
  return generator.generateZodSchemaFunction(interfaceName, filePath, options);
}

// Default export for convenience
export default interfaceToZod;
