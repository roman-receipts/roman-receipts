import { pbkdf2 } from "@railgun-community/wallet";
import { Pbkdf2Response } from "@railgun-community/shared-models";
import { getRandomBytes } from "@railgun-community/wallet";

export const hashPasswordString = async (secret: string, salt: string, iterations: number): Promise<Pbkdf2Response> => {
  return pbkdf2(secret, salt, iterations);
}

export const setEncryptionKeyFromPassword = async (password: string): Promise<string> => {
  // Desired `password` comes from user input

  const salt = getRandomBytes(16); // Generate salt
  const [encryptionKey, hashPasswordStored] = await Promise.all([
    hashPasswordString(password, salt, 100000), // Generate hash from password and salt
    hashPasswordString(password, salt, 1000000), // Generate hash for stored password. Use more iterations for the stored value.
  ]);

  await Promise.all([
    localStorage.setItem("hashPassword", hashPasswordStored), // Save `hashPasswordStored` to local storage
    localStorage.setItem("salt", salt),
  ]);

  return encryptionKey;
};

export const getEncryptionKeyFromPassword = async (password: string): Promise<string> => {
  // `password` comes from user input

  const storedPasswordHash: string | null = localStorage.getItem("hashPassword");
  const storedSalt: string = localStorage.getItem("salt") ?? "";

  const [encryptionKey, hashPassword] = await Promise.all([
    hashPasswordString(password, storedSalt, 100000), // Same iterations as when generated, i.e. 100000
    hashPasswordString(password, storedSalt, 1000000), // Same iterations as when generated, i.e. 1000000
  ]);

  if (storedPasswordHash !== hashPassword) {
    throw new Error("Incorrect password.");
  }

  return encryptionKey;
};
