import { createFakeGenerator } from './src/index';

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

const generateUsers = createFakeGenerator<User>("User", __filename);
const users = generateUsers(3);

console.log("Generated users:", JSON.stringify(users, null, 2));
