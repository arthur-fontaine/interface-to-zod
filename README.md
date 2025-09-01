# Interface Faker

Generate realistic mock data for TypeScript interfaces using faker.js and ts-morph.

## Installation

```bash
npm install interface-to-zod
# or
pnpm add interface-to-zod
# or
yarn add interface-to-zod
```

## Usage

```typescript
import { interfaceToZod } from 'interface-to-zod';

// Define your interface
interface User {
  id: string;
  name: string;
  email: string;
  age: number;
  isActive: boolean;
  createdAt: Date;
  profile?: {
    bio: string;
    avatar: string;
  };
}

const UserSchema = interfaceToZod<User>("User", __filename);
```

## Advanced Usage

### Smart Property Detection

`interface-to-zod` automatically detects common property patterns and generates appropriate fake data:

- **Email**: Properties containing "email" → `z.email()`
- **URL**: Properties containing "url" or "link" → `z.url()`

You can exclude specific properties from smart detection using the `excludedSmartDetections` option:

```typescript
const UserSchema = interfaceToZod<User>("User", __filename, {
  excludedSmartDetections: ["email", "profileUrl"]
});
```

## API Reference

### `mockInterface<T>(interfaceName, filePath, options?)`

Generates a mock function for a TypeScript interface.

#### Parameters

- `interfaceName` (string): Name of the interface to mock
- `filePath` (string): Path to the file containing the interface (use `__filename`)

#### Returns

Function that generates mock data: `(count?: number) => T[]`

## Supported Types

- ✅ Primitive types (string, number, boolean, Date)
- ✅ Arrays
- ✅ Optional properties
- ✅ Union types
- ✅ Literal types
- ✅ Enum types
- ✅ Nested objects
- ✅ Record types
- ✅ Interface references

## Requirements

- TypeScript >= 4.0.0
- Node.js >= 18.0.0

## License

MIT
