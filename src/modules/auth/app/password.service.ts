import * as bcrypt from 'bcrypt';

export class PasswordService {
    private static readonly SALT_ROUNDS = 12;

    static async hashPassword(password: string): Promise<string> {
        return bcrypt.hash(password, this.SALT_ROUNDS);
    }

    static async verifyPassword(password: string, hash: string): Promise<boolean> {
        return bcrypt.compare(password, hash);
    }

    static validatePasswordStrength(password: string, minLength: number = 8): boolean {
        return password.length >= minLength;
    }
}