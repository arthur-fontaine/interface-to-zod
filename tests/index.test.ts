import { describe, it, expect } from 'vitest';
import { interfaceToZod } from '../src/index';
import { $ZodShape } from 'zod/v4/core';
import { ZodAny, ZodArray, ZodBoolean, ZodDate, ZodEmail, ZodEnum, ZodNull, ZodNumber, ZodObject, ZodOptional, ZodRecord, ZodString, ZodUndefined, ZodUnion } from 'zod';

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

describe('interfaceToZod', () => {
  it('should generate Zod schema for simple interface', () => {
    const SimpleUserSchema = interfaceToZod<SimpleUser>("SimpleUser", __filename);

    expect(SimpleUserSchema.def.type).toBe('object');
    const shape = (SimpleUserSchema.def as any).shape as $ZodShape;
    expect(Object.keys(shape)).toHaveLength(5);
    expect(Object.keys(shape)).toEqual(['id', 'name', 'email', 'age', 'isActive']);
    expect(shape.id).toBeInstanceOf(ZodString);
    expect(shape.name).toBeInstanceOf(ZodString);
    expect(shape.email).toBeInstanceOf(ZodEmail);
    expect(shape.age).toBeInstanceOf(ZodNumber);
    expect(shape.isActive).toBeInstanceOf(ZodBoolean);
  });

  it('should generate Zod schema for complex interface', () => {
    const ComplexUserSchema = interfaceToZod<ComplexUser>("ComplexUser", __filename);

    expect(ComplexUserSchema.def.type).toBe('object');
    const shape = (ComplexUserSchema.def as any).shape as $ZodShape;
    expect(Object.keys(shape)).toHaveLength(5);
    expect(Object.keys(shape)).toEqual(['id', 'profile', 'settings', 'tags', 'metadata']);

    expect(shape.id).toBeInstanceOf(ZodString);
    expect(shape.profile).toBeInstanceOf(ZodObject);
    expect(shape.settings).toBeInstanceOf(ZodRecord);
    expect(shape.tags).toBeInstanceOf(ZodArray);
    expect(shape.metadata).toBeInstanceOf(ZodObject);

    const profileShape = (shape.profile as any).shape as $ZodShape;
    expect(Object.keys(profileShape)).toEqual(['firstName', 'lastName', 'bio']);
    expect(profileShape.firstName).toBeInstanceOf(ZodString);
    expect(profileShape.lastName).toBeInstanceOf(ZodString);
    expect(profileShape.bio).toBeInstanceOf(ZodOptional);
    if (!(profileShape.bio instanceof ZodOptional)) throw 'never';
    const profileBioInnerType = profileShape.bio.def.innerType as ZodUnion;
    expect(profileBioInnerType.def.options).toHaveLength(2);
    expect(profileBioInnerType.def.options[0]).toBeInstanceOf(ZodUndefined);
    expect(profileBioInnerType.def.options[1]).toBeInstanceOf(ZodString);

    const settingsType = shape.settings as ZodRecord;
    expect(settingsType.keyType).toBeInstanceOf(ZodString);
    expect(settingsType.valueType).toBeInstanceOf(ZodAny);

    const metadataShape = (shape.metadata as any).shape as $ZodShape;
    expect(Object.keys(metadataShape)).toEqual(['createdAt', 'updatedAt']);
    expect(metadataShape.createdAt).toBeInstanceOf(ZodDate);
    expect(metadataShape.updatedAt).toBeInstanceOf(ZodUnion);
    if (!(metadataShape.updatedAt instanceof ZodUnion)) throw 'never';
    expect(metadataShape.updatedAt.options).toHaveLength(2);
    expect(metadataShape.updatedAt.options[0]).toBeInstanceOf(ZodNull);
    expect(metadataShape.updatedAt.options[1]).toBeInstanceOf(ZodDate);
  });

  it('should throw error for non-existent interface', () => {
    expect(() => {
      interfaceToZod("NonExistentInterface", __filename);
    }).toThrow("Interface 'NonExistentInterface' not found");
  });

  it('should generate Zod schema for interface with nested interface types', () => {
    const UserWithInterfaceTypesSchema = interfaceToZod<UserWithInterfaceTypes>("UserWithInterfaceTypes", __filename);

    expect(UserWithInterfaceTypesSchema.def.type).toBe('object');
    const shape = (UserWithInterfaceTypesSchema.def as any).shape as $ZodShape;
    expect(Object.keys(shape)).toHaveLength(2);
    expect(Object.keys(shape)).toEqual(['id', 'books']);
    expect(shape.id).toBeInstanceOf(ZodString);
    expect(shape.books).toBeInstanceOf(ZodArray);
    const bookShape = (shape.books as ZodArray).element as ZodObject;
    expect(bookShape.def.type).toBe('object');
    const bookShapeDef = (bookShape.def as any).shape as $ZodShape;
    expect(Object.keys(bookShapeDef)).toEqual(['title', 'author']);
    expect(bookShapeDef.title).toBeInstanceOf(ZodString);
    // TODO: Handle recursive types properly
  });

  it('should skip smart detections for specified properties', () => {
    const SimpleUserSchema = interfaceToZod<SimpleUser>(
      "SimpleUser",
      __filename,
      { excludedSmartDetections: ['email', 'url', 'uuid'] },
    );

    expect(SimpleUserSchema.def.type).toBe('object');
    const shape = (SimpleUserSchema.def as any).shape as $ZodShape;
    expect(Object.keys(shape)).toHaveLength(5);
    expect(Object.keys(shape)).toEqual(['id', 'name', 'email', 'age', 'isActive']);
    expect(shape.id).toBeInstanceOf(ZodString);
    expect(shape.email).toBeInstanceOf(ZodString);
  });

  it('should replace specified types with custom Zod schemas', () => {
    const UserWithUnionsSchema = interfaceToZod<UserWithUnions>(
      "UserWithUnions",
      __filename,
      { customTypeGenerators: [['"active" | "inactive" | "pending"', 'z.enum(["active", "inactive", "pending"])'], ['"admin" | "user" | "moderator"', 'z.enum(["admin", "user", "moderator"])']] },
    );

    expect(UserWithUnionsSchema.def.type).toBe('object');
    const shape = (UserWithUnionsSchema.def as any).shape as $ZodShape;
    expect(Object.keys(shape)).toHaveLength(4);
    expect(Object.keys(shape)).toEqual(['id', 'status', 'role', 'count']);
    expect(shape.id).toBeInstanceOf(ZodString);
    expect(shape.status).toBeInstanceOf(ZodEnum);
    expect(shape.role).toBeInstanceOf(ZodEnum);
    expect(shape.count).toBeInstanceOf(ZodNumber);
  });
});
