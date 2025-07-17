import { interfaceToZod } from './src/index.ts';

export interface User {
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

const UserSchema = interfaceToZod<User>();
