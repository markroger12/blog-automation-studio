import bcrypt from 'bcryptjs';

export const PasswordSchemaMin = 10;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < PasswordSchemaMin) throw new Error(`Password must be at least ${PasswordSchemaMin} characters`);
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
