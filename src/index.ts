import { Project, SourceFile, Type } from "ts-morph";
import { faker } from "@faker-js/faker";
import * as path from "path";
import * as fs from "fs";

/**
 * Configuration options for mock generation
 */
export interface FakeGeneratorOptions {
  /** Default length for generated arrays */
  arrayLength?: number;
  /** Probability (0-1) that optional properties will be included */
  optionalPropertyChance?: number;
  /** Min/max length for Record objects */
  recordLength?: { min: number; max: number };
}

/**
 * Main class for generating mock data from TypeScript interfaces
 */
class MockInterfaceGenerator {
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
   * Generate mock value for a TypeScript type
   */
  private generateMockValue(
    type: Type,
    sourceFile: SourceFile,
    options: FakeGeneratorOptions,
    depth = 0,
    visited = new Set<string>(),
    propName?: string
  ): string {
    const indent = "  ".repeat(depth);

    // Handle arrays
    if (type.isArray()) {
      const elementMock = this.generateMockValue(
        type.getArrayElementTypeOrThrow(),
        sourceFile,
        options,
        depth,
        visited
      );
      const length = options.arrayLength || 2;
      return `Array.from({ length: ${length} }, () => (${elementMock}))`;
    }

    // Handle string literals
    if (type.isStringLiteral()) {
      return `"${type.getLiteralValue()}"`;
    }

    // Handle other literals
    if (type.isLiteral()) {
      return JSON.stringify(type.getLiteralValue());
    }

    // Handle enum literals
    if (type.isEnumLiteral()) {
      return type.getText();
    }

    const text = type.getText();

    // Handle primitive types with contextual faker data
    if (text === "string") {
      if (propName) {
        const lowerProp = propName.toLowerCase();
        if (lowerProp.includes("email")) return "faker.internet.email()";
        if (lowerProp.includes("currency")) return "faker.finance.currencyCode()";
        if (lowerProp.includes("name")) return "faker.person.fullName()";
        if (lowerProp.includes("phone")) return "faker.phone.number()";
        if (lowerProp.includes("address")) return "faker.location.streetAddress()";
        if (lowerProp.includes("city")) return "faker.location.city()";
        if (lowerProp.includes("country")) return "faker.location.country()";
        if (lowerProp.includes("url") || lowerProp.includes("link")) return "faker.internet.url()";
        if (lowerProp.includes("id")) return "faker.string.uuid()";
      }
      return "faker.lorem.word()";
    }
    if (text === "number") {
      return "faker.number.int({ min: 1, max: 100 })";
    }
    if (text === "boolean") {
      return "faker.datatype.boolean()";
    }
    if (text === "Date") {
      return "faker.date.recent()";
    }
    if (text === "null") {
      return "null";
    }
    if (text === "undefined") {
      return "undefined";
    }
    if (text === "any") {
      return "faker.lorem.word()";
    }

    // Handle union types
    if (type.isUnion()) {
      const unionTypes = type.getUnionTypes();
      const mockValues = unionTypes
        .map(t => this.generateMockValue(t, sourceFile, options, depth, visited))
        .join(", ");
      return `faker.helpers.arrayElement([${mockValues}])`;
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
      const keyMock = this.generateMockValue(keyType, sourceFile, options, depth + 1, visited);
      const mockValue = this.generateMockValue(valueType, sourceFile, options, depth + 1, visited);
      const { min, max } = options.recordLength || { min: 1, max: 5 };
      return `Object.fromEntries(Array.from({ length: faker.number.int({ min: ${min}, max: ${max} }) }, () => [${keyMock}, ${mockValue}]))`;
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
        
        if (optional && Math.random() > (options.optionalPropertyChance || 0.7)) {
          return null;
        }

        const mockValue = this.generateMockValue(propType, sourceFile, options, depth + 1, visited, propName);
        return `${indent}  ${JSON.stringify(propName)}: ${mockValue},`;
      })
      .filter(Boolean);

    visited.delete(key);
    return `{
${lines.join("\n")}
${indent}}`;
  }

  /**
   * Generate a mock function for a TypeScript interface
   */
  generateMockFunction<T>(
    interfaceName: string,
    filePath: string,
    options: FakeGeneratorOptions = {}
  ): (count?: number) => T[] {
    const sourceFile = this.getSourceFile(filePath);
    
    const iface = sourceFile.getInterface(interfaceName);
    if (!iface) {
      throw new Error(`Interface '${interfaceName}' not found in ${path.basename(filePath)}`);
    }

    const mockGenerator = `
      function create${interfaceName}Mock() {
        return ${this.generateMockValue(iface.getType(), sourceFile, options)};
      }

      function create${interfaceName}Mocks(count = 1) {
        return Array.from({ length: count }, () => create${interfaceName}Mock());
      }

      return create${interfaceName}Mocks;
    `;

    return new Function('faker', mockGenerator)(faker) as (count?: number) => T[];
  }
}

// Singleton instance
const generator = new MockInterfaceGenerator();

/**
 * Creates a function to generate fake data for a TypeScript interface.
 * 
 * @param interfaceName Name of the interface to mock
 * @param filePath Path to the file containing the interface (use __filename)
 * @param options Generation options
 * @returns Function that generates mock data: (count?: number) => T[]
 * 
 * @example
 * ```typescript
 * interface User {
 *   id: string;
 *   name: string;
 *   email: string;
 * }
 * 
 * const generateUsers = mockInterface<User>("User", __filename);
 * const users = generateUsers(5); // Generate 5 mock users
 * ```
 */
export function createFakeGenerator<T>(
  interfaceName: string,
  filePath: string,
  options: FakeGeneratorOptions = {}
): (count?: number) => T[] {
  return generator.generateMockFunction(interfaceName, filePath, options);
}

// Default export for convenience
export default createFakeGenerator;
