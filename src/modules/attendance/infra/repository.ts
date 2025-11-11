// TODO: Implement attendance repositories

import type { Pool } from "pg";

export interface AttendanceRepository {
  findActiveShift(userId: string): Promise<any>;
  checkIn(data: any): Promise<any>;
  checkOut(shiftId: string, data: any): Promise<void>;
}

export class PgAttendanceRepository implements AttendanceRepository {
  constructor(private pool: Pool) {}

  async findActiveShift(userId: string): Promise<any> {
    // TODO: Implement SQL query
    throw new Error("Not implemented");
  }

  async checkIn(data: any): Promise<any> {
    // TODO: Implement SQL insert
    throw new Error("Not implemented");
  }

  async checkOut(shiftId: string, data: any): Promise<void> {
    // TODO: Implement SQL update
    throw new Error("Not implemented");
  }
}
