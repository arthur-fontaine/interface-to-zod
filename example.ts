import { interfaceToZod } from './src/index';

// Test interface
interface User {
  id: string;
  name: string;
  email: string;
  age: number;
  isActive: boolean;
  profile?: {
    bio: string;
    avatar: string;
  };
}

const UserSchema = interfaceToZod<User>("User", __filename);
const user = UserSchema.parse({});

console.log("Parsed users:", JSON.stringify(user, null, 2));
