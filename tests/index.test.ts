import { describe, it, expect } from 'vitest';
import { createFakeGenerator, type FakeGeneratorOptions } from '../src/index';

// Test interfaces
interface SimpleUser {
  id: string;
  name: string;
  email: string;
  age: number;
  isActive: boolean;
}

interface ComplexUser {
  id: string;
  profile: {
    firstName: string;
    lastName: string;
    bio?: string;
  };
  settings: Record<string, any>;
  tags: string[];
  metadata: {
    createdAt: Date;
    updatedAt: Date | null;
  };
}

interface UserWithUnions {
  id: string;
  status: "active" | "inactive" | "pending";
  role: "admin" | "user" | "moderator";
  count: number;
}

interface UserWithInterfaceTypes {
  id: string;
  books: Book[];
}

interface Book {
  title: string;
  author: UserWithInterfaceTypes;
}

describe('createFakeGenerator', () => {
  it('should generate mock data for simple interface', () => {
    const generateUsers = createFakeGenerator<SimpleUser>("SimpleUser", __filename);
    const users = generateUsers(3);
    
    expect(users).toHaveLength(3);
    expect(users[0]).toHaveProperty('id');
    expect(users[0]).toHaveProperty('name');
    expect(users[0]).toHaveProperty('email');
    expect(users[0]).toHaveProperty('age');
    expect(users[0]).toHaveProperty('isActive');
    
    const user = users[0]!;
    expect(typeof user.id).toBe('string');
    expect(typeof user.name).toBe('string');
    expect(typeof user.email).toBe('string');
    expect(typeof user.age).toBe('number');
    expect(typeof user.isActive).toBe('boolean');
  });

  it('should generate mock data for complex interface', () => {
    const generateUsers = createFakeGenerator<ComplexUser>("ComplexUser", __filename);
    const users = generateUsers(2);
    
    expect(users).toHaveLength(2);
    expect(users[0]).toHaveProperty('id');
    expect(users[0]).toHaveProperty('profile');
    expect(users[0]).toHaveProperty('settings');
    expect(users[0]).toHaveProperty('tags');
    expect(users[0]).toHaveProperty('metadata');
    
    const user = users[0]!;
    expect(user.profile).toHaveProperty('firstName');
    expect(user.profile).toHaveProperty('lastName');
    expect(Array.isArray(user.tags)).toBe(true);
    expect(user.metadata).toHaveProperty('createdAt');
    expect(user.metadata.createdAt instanceof Date).toBe(true);
  });

  it('should handle union types correctly', () => {
    const generateUsers = createFakeGenerator<UserWithUnions>("UserWithUnions", __filename);
    const users = generateUsers(5);
    
    users.forEach(user => {
      expect(['active', 'inactive', 'pending']).toContain(user.status);
      expect(['admin', 'user', 'moderator']).toContain(user.role);
      expect(typeof user.count).toBe('number');
    });
  });

  it('should respect custom options', () => {
    const options: FakeGeneratorOptions = {
      arrayLength: 5,
      optionalPropertyChance: 1.0, // Always include optional properties
    };
    
    const generateUsers = createFakeGenerator<ComplexUser>("ComplexUser", __filename, options);
    const users = generateUsers(1);
    
    const user = users[0]!;
    expect(user.tags).toHaveLength(5);
  });

  it('should generate single item when count is 1', () => {
    const generateUsers = createFakeGenerator<SimpleUser>("SimpleUser", __filename);
    const users = generateUsers(1);
    
    expect(users).toHaveLength(1);
    expect(users[0]).toHaveProperty('id');
  });

  it('should use default count when no count provided', () => {
    const generateUsers = createFakeGenerator<SimpleUser>("SimpleUser", __filename);
    const users = generateUsers();
    
    expect(users).toHaveLength(1);
  });

  it('should throw error for non-existent interface', () => {
    expect(() => {
      createFakeGenerator("NonExistentInterface", __filename);
    }).toThrow("Interface 'NonExistentInterface' not found");
  });

  it('should generate mock data for interfaces with nested interface types', () => {
    const generateUsers = createFakeGenerator<UserWithInterfaceTypes>("UserWithInterfaceTypes", __filename);
    const users = generateUsers(2);
    
    expect(users).toHaveLength(2);
    users.forEach(user => {
      expect(user).toHaveProperty('id');
      expect(Array.isArray(user.books)).toBe(true);
      user.books.forEach(book => {
        expect(book).toHaveProperty('title');
        expect(book).toHaveProperty('author');
        expect(book.author).toEqual({});
      });
    });
  });
});
