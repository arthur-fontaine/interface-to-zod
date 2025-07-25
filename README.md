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

Interface Faker automatically detects common property patterns and generates appropriate fake data:

- **Email**: Properties containing "email" → `faker.internet.email()`
- **Name**: Properties containing "name" → `faker.person.fullName()`
- **Phone**: Properties containing "phone" → `faker.phone.number()`
- **Currency**: Properties containing "currency" → `faker.finance.currencyCode()`
- **ID**: Properties containing "id" → `faker.string.uuid()`
- **Address**: Properties containing "address" → `faker.location.streetAddress()`
- **URL**: Properties containing "url" or "link" → `faker.internet.url()`

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
