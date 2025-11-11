// TODO: Implement auth repositories
// Example: UserRepository, SessionRepository

import type { Pool } from "pg";

export interface UserRepository {
  findByEmail(email: string): Promise<any>;
  findById(id: string): Promise<any>;
  create(user: any): Promise<any>;
  update(id: string, data: any): Promise<any>;
}

export class PgUserRepository implements UserRepository {
  constructor(private pool: Pool) {}

  async findByEmail(email: string): Promise<any> {
    // TODO: Implement SQL query
    throw new Error("Not implemented");
  }

  async findById(id: string): Promise<any> {
    // TODO: Implement SQL query
    throw new Error("Not implemented");
  }

  async create(user: any): Promise<any> {
    // TODO: Implement SQL query
    throw new Error("Not implemented");
  }

  async update(id: string, data: any): Promise<any> {
    // TODO: Implement SQL query
    throw new Error("Not implemented");
  }
}
